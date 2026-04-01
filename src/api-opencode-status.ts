/**
 * OpenCode Status API — exposes skills, agents, plugins, and MCP servers
 * Used by /status command and the web UI control panel.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

export interface SkillInfo {
  name: string;
  description: string;
  source: 'project' | 'project-claude' | 'global' | 'global-claude';
  path: string;
}

export interface AgentInfo {
  name: string;
  description: string;
  mode: string;
  source: 'config' | 'file' | 'registry';
}

export interface PluginInfo {
  name: string;
  version?: string;
}

export interface McpServerInfo {
  name: string;
  command?: string;
  disabled: boolean;
}

export interface OpenCodeStatus {
  skills: SkillInfo[];
  agents: AgentInfo[];
  plugins: PluginInfo[];
  mcpServers: McpServerInfo[];
}

/**
 * Scan a directory for skill folders (each containing SKILL.md)
 */
function scanSkillsDir(dir: string, source: SkillInfo['source']): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (!fs.existsSync(dir)) return skills;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(dir, entry.name);
      // Look for SKILL.md (case-insensitive)
      const files = fs.readdirSync(skillDir);
      const skillFile = files.find(f => f.toLowerCase() === 'skill.md');
      if (!skillFile) continue;

      const content = fs.readFileSync(path.join(skillDir, skillFile), 'utf-8');
      const description = extractSkillDescription(content, entry.name);
      skills.push({
        name: entry.name,
        description,
        source,
        path: skillDir,
      });
    }
  } catch (err) {
    logger.warn({ dir, err }, 'Failed to scan skills directory');
  }
  return skills;
}

/**
 * Extract description from SKILL.md frontmatter or first paragraph
 */
function extractSkillDescription(content: string, fallbackName: string): string {
  // Try YAML frontmatter: ---\ndescription: ...\n---
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const descLine = fmMatch[1].split('\n').find(l => l.startsWith('description:'));
    if (descLine) {
      return descLine.replace(/^description:\s*/, '').replace(/^['"]|['"]$/g, '').trim();
    }
  }
  // Fallback: first non-empty, non-heading line
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      return trimmed.slice(0, 120);
    }
  }
  return `${fallbackName} skill`;
}

/**
 * Discover all skills from project and global locations.
 * Priority order (first found wins by name):
 * 1. .opencode/skills/ (project)
 * 2. .claude/skills/ (project, Claude compat)
 * 3. ~/.config/opencode/skills/ (global) or %APPDATA%\opencode\skills\ (Windows)
 * 4. ~/.claude/skills/ (global, Claude compat)
 */
function discoverSkills(): SkillInfo[] {
  const cwd = process.cwd();
  const seen = new Set<string>();
  const allSkills: SkillInfo[] = [];

  const sources: Array<{ dir: string; source: SkillInfo['source'] }> = [
    { dir: path.join(cwd, '.opencode', 'skills'), source: 'project' },
    { dir: path.join(cwd, '.claude', 'skills'), source: 'project-claude' },
  ];

  // Global paths differ by platform
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    sources.push({ dir: path.join(appData, 'opencode', 'skills'), source: 'global' });
  } else {
    sources.push({ dir: path.join(os.homedir(), '.config', 'opencode', 'skills'), source: 'global' });
  }
  sources.push({ dir: path.join(os.homedir(), '.claude', 'skills'), source: 'global-claude' });

  for (const { dir, source } of sources) {
    const skills = scanSkillsDir(dir, source);
    for (const skill of skills) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        allSkills.push(skill);
      }
    }
  }

  return allSkills;
}

/**
 * Discover all agents from opencode.json config + .opencode/agents/*.md + registry
 */
function discoverAgents(): AgentInfo[] {
  const cwd = process.cwd();
  const seen = new Set<string>();
  const agents: AgentInfo[] = [];

  // 1. From opencode.json
  try {
    const configPath = path.join(cwd, 'opencode.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.agent) {
        for (const [id, conf] of Object.entries(config.agent)) {
          const c = conf as Record<string, unknown>;
          agents.push({
            name: id,
            description: (c.description as string) || `${id} agent`,
            mode: (c.mode as string) || 'subagent',
            source: 'config',
          });
          seen.add(id.toLowerCase());
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read opencode.json for agents');
  }

  // 2. From .opencode/agents/*.md
  try {
    const agentsDir = path.join(cwd, '.opencode', 'agents');
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const id = file.replace(/\.md$/, '');
        if (seen.has(id.toLowerCase())) continue;
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
        const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        let description = `${id} agent`;
        let mode = 'subagent';
        if (fmMatch) {
          const descLine = fmMatch[1].split('\n').find(l => l.startsWith('description:'));
          if (descLine) description = descLine.replace(/^description:\s*/, '').replace(/^['"]|['"]$/g, '').trim();
          const modeLine = fmMatch[1].split('\n').find(l => l.startsWith('mode:'));
          if (modeLine) mode = modeLine.replace(/^mode:\s*/, '').trim();
        }
        agents.push({ name: id, description, mode, source: 'file' });
        seen.add(id.toLowerCase());
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to scan .opencode/agents/');
  }

  // 3. From agents-registry.yaml (subagents not in config)
  try {
    const registryPath = path.join(cwd, '.opencode', 'agents-registry.yaml');
    if (fs.existsSync(registryPath)) {
      const content = fs.readFileSync(registryPath, 'utf-8');
      // Simple YAML parsing for agent entries
      const agentBlocks = content.split(/\n\s*-\s+name:\s*/);
      for (let i = 1; i < agentBlocks.length; i++) {
        const block = agentBlocks[i];
        const nameMatch = block.match(/^(\S+)/);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        if (seen.has(name.toLowerCase())) continue;
        const descMatch = block.match(/description:\s*['"]?(.+?)['"]?\s*$/m);
        agents.push({
          name,
          description: descMatch ? descMatch[1] : `${name} agent`,
          mode: 'subagent',
          source: 'registry',
        });
        seen.add(name.toLowerCase());
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read agents-registry.yaml');
  }

  return agents;
}

/**
 * Discover plugins from opencode.json
 */
function discoverPlugins(): PluginInfo[] {
  const plugins: PluginInfo[] = [];
  try {
    const configPath = path.join(process.cwd(), 'opencode.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const pluginList = config.plugin || config.plugins || [];
      if (Array.isArray(pluginList)) {
        for (const p of pluginList) {
          if (typeof p === 'string') {
            const [name, version] = p.split('@');
            plugins.push({ name, version });
          } else if (typeof p === 'object' && p.name) {
            plugins.push({ name: p.name, version: p.version });
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read plugins from opencode.json');
  }
  return plugins;
}

/**
 * Discover MCP servers from multiple config locations:
 * 1. opencode.json mcp section
 * 2. .mcp.json (project root)
 * 3. ~/.config/opencode/mcp.json or %APPDATA%\opencode\mcp.json (global)
 */
function discoverMcpServers(): McpServerInfo[] {
  const servers: McpServerInfo[] = [];
  const seen = new Set<string>();

  const configFiles: string[] = [];

  // 1. opencode.json mcp section
  try {
    const configPath = path.join(process.cwd(), 'opencode.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.mcp && typeof config.mcp === 'object') {
        // mcp can be { serverName: { command, args, ... } } or { mcpServers: { ... } }
        const mcpObj = config.mcp.mcpServers || config.mcp;
        for (const [name, conf] of Object.entries(mcpObj)) {
          if (seen.has(name)) continue;
          const c = conf as Record<string, unknown>;
          servers.push({
            name,
            command: (c.command as string) || undefined,
            disabled: (c.disabled as boolean) || false,
          });
          seen.add(name);
        }
      }
    }
  } catch { /* ignore */ }

  // 2. .mcp.json in project root
  configFiles.push(path.join(process.cwd(), '.mcp.json'));

  // 3. Global MCP config
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    configFiles.push(path.join(appData, 'opencode', 'mcp.json'));
  } else {
    configFiles.push(path.join(os.homedir(), '.config', 'opencode', 'mcp.json'));
  }

  for (const configFile of configFiles) {
    try {
      if (!fs.existsSync(configFile)) continue;
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      const mcpObj = config.mcpServers || config;
      for (const [name, conf] of Object.entries(mcpObj)) {
        if (seen.has(name)) continue;
        const c = conf as Record<string, unknown>;
        servers.push({
          name,
          command: (c.command as string) || undefined,
          disabled: (c.disabled as boolean) || false,
        });
        seen.add(name);
      }
    } catch { /* ignore */ }
  }

  return servers;
}

/**
 * Get full OpenCode status — skills, agents, plugins, MCP servers
 */
export function getOpenCodeStatus(): OpenCodeStatus {
  return {
    skills: discoverSkills(),
    agents: discoverAgents(),
    plugins: discoverPlugins(),
    mcpServers: discoverMcpServers(),
  };
}

/**
 * Format OpenCode status as text (for /status command in chat)
 */
export function formatOpenCodeStatusText(status: OpenCodeStatus): string {
  let s = '';

  // Skills
  s += `\n🛠 Skills (${status.skills.length})\n`;
  if (status.skills.length === 0) {
    s += '└ No skills found\n';
  } else {
    const projectSkills = status.skills.filter(sk => sk.source === 'project' || sk.source === 'project-claude');
    const globalSkills = status.skills.filter(sk => sk.source === 'global' || sk.source === 'global-claude');
    if (projectSkills.length > 0) {
      s += `├ Project: ${projectSkills.map(sk => sk.name).join(', ')}\n`;
    }
    if (globalSkills.length > 0) {
      s += `├ Global: ${globalSkills.map(sk => sk.name).join(', ')}\n`;
    }
  }

  // Agents
  s += `\n🤖 Agents (${status.agents.length})\n`;
  if (status.agents.length === 0) {
    s += '└ No agents found\n';
  } else {
    const primary = status.agents.filter(a => a.mode === 'primary');
    const sub = status.agents.filter(a => a.mode !== 'primary');
    if (primary.length > 0) {
      s += `├ Primary: ${primary.map(a => a.name).join(', ')}\n`;
    }
    if (sub.length > 0) {
      s += `├ Subagents: ${sub.map(a => a.name).join(', ')}\n`;
    }
  }

  // Plugins
  s += `\n🔌 Plugins (${status.plugins.length})\n`;
  if (status.plugins.length === 0) {
    s += '└ No plugins\n';
  } else {
    for (const p of status.plugins) {
      s += `├ ${p.name}${p.version ? `@${p.version}` : ''}\n`;
    }
  }

  // MCP Servers
  s += `\n🔗 MCP Servers (${status.mcpServers.length})\n`;
  if (status.mcpServers.length === 0) {
    s += '└ No MCP servers\n';
  } else {
    for (const m of status.mcpServers) {
      const state = m.disabled ? '🔴' : '🟢';
      s += `├ ${state} ${m.name}${m.command ? ` (${m.command})` : ''}\n`;
    }
  }

  return s;
}
