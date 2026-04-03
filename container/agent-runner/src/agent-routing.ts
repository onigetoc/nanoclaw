/**
 * Agent routing and discovery for the EureClaw Agent Runner.
 * Handles agent validation, complexity detection, and prompt routing.
 */

import fs from 'fs';
import path from 'path';
import { extractFrontmatterBlock, getFrontmatterValue } from '../../../shared/frontmatter.js';
import { OPENCODE_TOOLS } from './types.js';
import { log } from './io.js';
import type { EureClawConfig } from './model-fallback.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidatedSubagent {
  name: string;
  description: string;
  mode: 'all' | 'primary' | 'subagent';
  resolvedModel: string;
  resolvedTemperature: number;
  hasExplicitMode?: boolean;
  hasExplicitModel?: boolean;
  hasExplicitTemperature?: boolean;
  source: 'config' | 'file' | 'merged';
}

export interface AgentRoutingResult {
  agentName: string;
  routingReason: string;
  allKnownAgents: ValidatedSubagent[];
  knownAgentNames: Set<string>;
}

// ─── Complexity Detection ────────────────────────────────────────────────────

/**
 * Detect if a task is complex and should use the orchestrator agent.
 */
export function detectComplexTask(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  const explicitAgentMention = prompt.match(/(^|\s)@([a-z0-9][a-z0-9_-]{1,63})\b/i)?.[2]?.toLowerCase();
  if (explicitAgentMention && explicitAgentMention !== 'build') {
    return true;
  }

  if (
    lowerPrompt.includes('/tasks/') ||
    lowerPrompt.includes('\\tasks\\') ||
    lowerPrompt.includes('plan_created') ||
    /-\s*\[\s?[x ]\s?\]/i.test(prompt)
  ) {
    return true;
  }

  const multiStepPatterns = [
    /recherche.*et.*résume/i,
    /search.*and.*summarize/i,
    /find.*and.*create/i,
    /analyse.*et.*compare/i,
    /cherche.*puis.*fait/i,
  ];

  if (multiStepPatterns.some(pattern => pattern.test(prompt))) {
    return true;
  }

  return false;
}

// ─── Path Hints ──────────────────────────────────────────────────────────────

/**
 * Add deterministic path hints for common virtual paths used by users.
 */
export function applyPathHints(prompt: string, workspaceDir: string): string {
  const mentionsTasksPath =
    prompt.includes('/tasks/') ||
    prompt.includes('\\tasks\\') ||
    /(^|\s)(\.?[\\/])?tasks[\\/]/i.test(prompt);

  if (!mentionsTasksPath) {
    return prompt;
  }

  const workspaceTasksPath = path.join(workspaceDir, 'tasks').replace(/\\/g, '/');
  const hint = [
    '',
    '[SYSTEM PATH HINT]',
    `If the user references /tasks/... it maps to ${workspaceTasksPath}/... for this workspace.`,
    'This refers to FILE TASKS (markdown files in workspace/tasks), not scheduled tasks in IPC/DB.',
    'When user asks about /tasks files, inspect the filesystem first (workspace/tasks) before using any scheduled-task tool.',
    'Do not search project root for these task files unless explicitly requested.',
  ].join('\n');

  return `${prompt}\n${hint}`;
}

// ─── Agent Validation ────────────────────────────────────────────────────────

function resolveMode(rawMode?: string): 'all' | 'primary' | 'subagent' {
  if (rawMode === 'primary' || rawMode === 'subagent' || rawMode === 'all') return rawMode;
  return 'all';
}

function resolveModelForMode(
  mode: 'all' | 'primary' | 'subagent',
  runtimeModel?: string,
  runtimeSmallModel?: string,
  eureClawConfig?: EureClawConfig | null,
): string | undefined {
  const fallbackPrimary = eureClawConfig?.models?.primary;
  const fallbackSmall = eureClawConfig?.models?.small;
  if (mode === 'subagent') {
    return runtimeSmallModel || fallbackSmall || runtimeModel || fallbackPrimary;
  }
  return runtimeModel || fallbackPrimary || runtimeSmallModel || fallbackSmall;
}

function resolveTemperatureForAgent(
  agentName: string,
  mode: 'all' | 'primary' | 'subagent',
  rawTemperature?: string,
  runtimeAgentTemps?: Record<string, number>,
): number {
  if (rawTemperature) {
    const parsed = Number(rawTemperature);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (runtimeAgentTemps && typeof runtimeAgentTemps[agentName] === 'number') {
    return runtimeAgentTemps[agentName];
  }
  return mode === 'subagent' ? 0.1 : 0.2;
}

export function validateSubagent(
  filePath: string,
  fileName: string,
  content: string,
  runtimeModel?: string,
  runtimeSmallModel?: string,
  runtimeAgentTemps?: Record<string, number>,
  eureClawConfig?: EureClawConfig | null,
): { valid: true; agent: ValidatedSubagent } | { valid: false; errors: string[] } {
  const frontmatter = extractFrontmatterBlock(content);
  const description = getFrontmatterValue(frontmatter, 'description') || 'No description available';
  const rawMode = getFrontmatterValue(frontmatter, 'mode');
  const rawModel = getFrontmatterValue(frontmatter, 'model');
  const rawTemperature = getFrontmatterValue(frontmatter, 'temperature');
  const mode = resolveMode(rawMode);
  const model = rawModel || resolveModelForMode(mode, runtimeModel, runtimeSmallModel, eureClawConfig);
  const temperature = resolveTemperatureForAgent(fileName, mode, rawTemperature, runtimeAgentTemps);
  const toolsRaw = getFrontmatterValue(frontmatter, 'tools');
  const errors: string[] = [];

  if (!model) {
    errors.push('model unresolved (missing in frontmatter and config fallback chain)');
  }
  if (!Number.isFinite(temperature)) {
    errors.push('temperature unresolved or invalid');
  }

  if (toolsRaw && toolsRaw.toLowerCase() !== 'all') {
    const tools = toolsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const invalidTools = tools.filter(t => !OPENCODE_TOOLS.has(t));
    if (invalidTools.length > 0) {
      errors.push(`invalid tools: ${invalidTools.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    log(`⚠ Subagent ${fileName} is invalid (${filePath}): ${errors.join('; ')}`);
    return { valid: false, errors };
  }

  return {
    valid: true,
    agent: {
      name: fileName,
      description,
      mode,
      resolvedModel: model!,
      resolvedTemperature: temperature,
      hasExplicitMode: typeof rawMode === 'string' && rawMode.length > 0,
      hasExplicitModel: typeof rawModel === 'string' && rawModel.length > 0,
      hasExplicitTemperature: typeof rawTemperature === 'string' && rawTemperature.length > 0,
      source: 'file',
    }
  };
}

// ─── Agent Discovery & Routing ───────────────────────────────────────────────

export interface DiscoverAgentsOptions {
  isDirectMode: boolean;
  projectDir: string;
  containerInput: { agent?: string };
  prompt: string;
  eureClawConfig: EureClawConfig | null;
}

/**
 * Discover all available agents and determine which one to route to.
 */
export function discoverAndRouteAgents(opts: DiscoverAgentsOptions): AgentRoutingResult {
  const { isDirectMode, projectDir, containerInput, prompt, eureClawConfig } = opts;
  const promptLower = prompt.toLowerCase();
  const envDefaultAgent = (process.env.EURECLAW_DEFAULT_AGENT || '').toLowerCase();

  // Read opencode.json for agent config
  let runtimeModel: string | undefined;
  let runtimeSmallModel: string | undefined;
  let runtimeAgentTemps: Record<string, number> = {};
  let runtimeConfigAgentDefs: Array<{
    name: string; description?: string; mode?: string; model?: string; temperature?: number;
  }> = [];

  try {
    const opencodeConfigPath = path.join(projectDir, 'opencode.json');
    if (fs.existsSync(opencodeConfigPath)) {
      const cfg = JSON.parse(fs.readFileSync(opencodeConfigPath, 'utf-8')) as {
        model?: string;
        small_model?: string;
        agent?: Record<string, { description?: string; mode?: string; model?: string; temperature?: number }>;
      };
      runtimeModel = cfg.model;
      runtimeSmallModel = cfg.small_model;
      if (cfg.agent && typeof cfg.agent === 'object') {
        runtimeAgentTemps = Object.fromEntries(
          Object.entries(cfg.agent)
            .filter(([, v]) => typeof v?.temperature === 'number')
            .map(([k, v]) => [k, v!.temperature as number])
        );
        runtimeConfigAgentDefs = Object.entries(cfg.agent).map(([name, conf]) => ({
          name, description: conf?.description, mode: conf?.mode,
          model: conf?.model, temperature: conf?.temperature,
        }));
      }
    }
  } catch (err) {
    log(`⚠ Failed to read opencode.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate config agents
  const validatedConfigAgents: ValidatedSubagent[] = runtimeConfigAgentDefs
    .map((a) => {
      const mode = resolveMode(a.mode);
      const model = a.model || resolveModelForMode(mode, runtimeModel, runtimeSmallModel, eureClawConfig);
      if (!model) {
        log(`⚠ Config agent ${a.name} skipped: model unresolved`);
        return undefined;
      }
      const resolvedTemperature = Number.isFinite(a.temperature)
        ? (a.temperature as number)
        : resolveTemperatureForAgent(a.name, mode, undefined, runtimeAgentTemps);
      return {
        name: a.name, description: a.description || 'Configured in opencode.json',
        mode, resolvedModel: model, resolvedTemperature,
        hasExplicitMode: typeof a.mode === 'string' && a.mode.length > 0,
        hasExplicitModel: typeof a.model === 'string' && a.model.length > 0,
        hasExplicitTemperature: typeof a.temperature === 'number',
        source: 'config' as const,
      };
    })
    .filter((a): a is ValidatedSubagent => !!a);

  // Discover file-based agents
  const agentsDirForRouting = isDirectMode
    ? path.join(projectDir, '.opencode', 'agents')
    : '/workspace/project/.opencode/agents';
  let validatedSubagents: ValidatedSubagent[] = [];

  try {
    if (fs.existsSync(agentsDirForRouting)) {
      const files = fs.readdirSync(agentsDirForRouting).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const fp = path.join(agentsDirForRouting, file);
        const name = path.basename(file, '.md');
        const content = fs.readFileSync(fp, 'utf-8');
        const result = validateSubagent(fp, name, content, runtimeModel, runtimeSmallModel, runtimeAgentTemps, eureClawConfig);
        if (result.valid) {
          validatedSubagents.push(result.agent);
        }
      }
    }
  } catch (err) {
    log(`⚠ Failed to discover agents: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Merge config + file agents (no duplicates)
  const allAgentsByName = new Map<string, ValidatedSubagent>();
  for (const agent of validatedConfigAgents) {
    allAgentsByName.set(agent.name.toLowerCase(), agent);
  }
  for (const agent of validatedSubagents) {
    const key = agent.name.toLowerCase();
    const existing = allAgentsByName.get(key);
    if (!existing) {
      allAgentsByName.set(key, agent);
      continue;
    }
    // Merge: prefer explicit file values over config
    const merged: ValidatedSubagent = {
      name: existing.name,
      description: agent.description && agent.description !== 'No description available'
        ? agent.description : existing.description,
      mode: agent.hasExplicitMode ? agent.mode : existing.mode,
      resolvedModel: agent.hasExplicitModel ? agent.resolvedModel : existing.resolvedModel,
      resolvedTemperature: agent.hasExplicitTemperature ? agent.resolvedTemperature : existing.resolvedTemperature,
      hasExplicitMode: existing.hasExplicitMode || agent.hasExplicitMode,
      hasExplicitModel: existing.hasExplicitModel || agent.hasExplicitModel,
      hasExplicitTemperature: existing.hasExplicitTemperature || agent.hasExplicitTemperature,
      source: 'merged',
    };
    allAgentsByName.set(key, merged);
  }

  const allKnownAgents = Array.from(allAgentsByName.values());
  const knownAgentNames = new Set(allKnownAgents.map(a => a.name.toLowerCase()));

  // Route to the right agent
  const mentionedAgents = Array.from(
    new Set(
      [...promptLower.matchAll(/(^|\s)@([a-z0-9][a-z0-9_-]{1,63})\b/g)].map(m => m[2])
    )
  );
  const mentionedKnownSubagent = mentionedAgents.find(
    a => a !== 'build' && a !== 'orchestrator' && knownAgentNames.has(a)
  );

  let agentName = 'build';
  let routingReason = '';

  if (containerInput.agent) {
    agentName = containerInput.agent;
    routingReason = `web UI override (${containerInput.agent})`;
  } else if (promptLower.includes('@orchestrator')) {
    agentName = 'orchestrator';
    routingReason = 'explicit @orchestrator override in prompt';
  } else if (promptLower.includes('@build')) {
    agentName = 'build';
    routingReason = 'explicit @build override in prompt';
  } else if (promptLower.includes('@plan')) {
    agentName = 'plan';
    routingReason = 'explicit @plan override in prompt';
  } else if (mentionedKnownSubagent) {
    agentName = 'orchestrator';
    routingReason = `explicit @${mentionedKnownSubagent} mention (known subagent)`;
  } else if (envDefaultAgent === 'orchestrator' || envDefaultAgent === 'build' || envDefaultAgent === 'plan') {
    agentName = envDefaultAgent;
    routingReason = `EURECLAW_DEFAULT_AGENT=${envDefaultAgent}`;
  } else {
    const useOrchestrator = detectComplexTask(prompt);
    agentName = useOrchestrator ? 'orchestrator' : 'build';
    routingReason = useOrchestrator ? 'complexity heuristic' : 'simple-task heuristic';
  }

  if (agentName === 'orchestrator') {
    log(`🧠 Using orchestrator agent (${routingReason})`);
  } else if (agentName === 'plan') {
    log(`📋 Using plan agent (${routingReason})`);
  } else if (agentName === 'build') {
    log(`⚡ Using build agent (${routingReason})`);
  } else {
    log(`🎯 Using ${agentName} agent (${routingReason})`);
  }

  return { agentName, routingReason, allKnownAgents, knownAgentNames };
}
