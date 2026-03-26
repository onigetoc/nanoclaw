/**
 * Dynamic agent switching commands for all channels (Telegram, WhatsApp, Web UI)
 * 
 * Auto-discovers agents from:
 *   1. opencode.json → agent.{name} entries
 *   2. .opencode/agents/*.md files
 *   3. .opencode/prompts/*.md files (excluding .bak)
 * 
 * Each discovered agent gets a /{name} slash command automatically.
 * No hardcoding — add a new agent file and the command appears.
 * 
 * Examples:
 *   /talk what's the weather?
 *   /build fix the login bug
 *   /researcher find latest AI news
 */

import fs from 'fs';
import path from 'path';

import { registerCommand, CommandContext, CommandResponse } from './index.js';
import { logger } from '../logger.js';

/** Agents that should NOT get a slash command (system-level only) */
const EXCLUDED_AGENTS = new Set(['default']);

/** Built-in commands that must not be overridden by agent names */
const RESERVED_COMMANDS = new Set([
  'restart', 'sleep', 'awake', 'status', 'stop', 'clear',
  'help', 'chatid', 'new', 'undo', 'redo', 'model', 'agent',
]);

interface DiscoveredAgent {
  name: string;
  description: string;
  source: 'config' | 'file' | 'prompt';
}

/**
 * Discover all agents from opencode.json, .opencode/agents/, and .opencode/prompts/
 */
function discoverAgents(): DiscoveredAgent[] {
  const projectRoot = process.cwd();
  const agents = new Map<string, DiscoveredAgent>();

  // 1. Scan opencode.json → agent.{name}
  try {
    const configPath = path.join(projectRoot, 'opencode.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.agent && typeof config.agent === 'object') {
        for (const [name, conf] of Object.entries(config.agent)) {
          const key = name.toLowerCase();
          if (EXCLUDED_AGENTS.has(key) || RESERVED_COMMANDS.has(key)) continue;
          agents.set(key, {
            name: key,
            description: (conf as any)?.description || `Switch to ${name} agent`,
            source: 'config',
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read opencode.json for agent discovery');
  }

  // 2. Scan .opencode/agents/*.md
  try {
    const agentsDir = path.join(projectRoot, '.opencode', 'agents');
    if (fs.existsSync(agentsDir)) {
      for (const file of fs.readdirSync(agentsDir)) {
        if (!file.endsWith('.md')) continue;
        const name = path.basename(file, '.md').toLowerCase();
        if (EXCLUDED_AGENTS.has(name) || RESERVED_COMMANDS.has(name)) continue;
        if (agents.has(name)) continue; // config takes precedence for description

        // Try to extract description from frontmatter
        let description = `Switch to ${name} agent`;
        try {
          const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
          const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const descMatch = fmMatch[1].match(/description:\s*['"]?(.+?)['"]?\s*$/m);
            if (descMatch) description = descMatch[1];
          }
        } catch { /* ignore read errors */ }

        agents.set(name, { name, description, source: 'file' });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to scan .opencode/agents/ for agent discovery');
  }

  // 3. Scan .opencode/prompts/*.md (excluding .bak files)
  try {
    const promptsDir = path.join(projectRoot, '.opencode', 'prompts');
    if (fs.existsSync(promptsDir)) {
      for (const file of fs.readdirSync(promptsDir)) {
        if (!file.endsWith('.md') || file.endsWith('.bak')) continue;
        const name = path.basename(file, '.md').toLowerCase();
        if (EXCLUDED_AGENTS.has(name) || RESERVED_COMMANDS.has(name)) continue;
        if (agents.has(name)) continue; // don't override existing

        agents.set(name, {
          name,
          description: `Switch to ${name} agent`,
          source: 'prompt',
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to scan .opencode/prompts/ for agent discovery');
  }

  return Array.from(agents.values());
}

/**
 * Create a generic agent command handler
 */
function createAgentHandler(agentName: string): (ctx: CommandContext) => Promise<CommandResponse> {
  return async (ctx: CommandContext): Promise<CommandResponse> => {
    logger.info(
      { chatJid: ctx.chatJid, sender: ctx.senderName, agent: agentName },
      `Switching to ${agentName} agent`,
    );

    const prompt = ctx.args.join(' ').trim();

    if (!prompt) {
      return {
        reply: `🎯 ${agentName} mode activated. Send your message to use this agent.`,
        data: { agent: agentName },
      };
    }

    return {
      data: {
        agent: agentName,
        prompt,
      },
    };
  };
}

// --- Auto-discover and register all agent commands ---

const discovered = discoverAgents();

for (const agent of discovered) {
  registerCommand(agent.name, createAgentHandler(agent.name));
}

logger.info(
  { agents: discovered.map(a => a.name), count: discovered.length },
  'Dynamic agent commands registered',
);

// /model - Override model for next message (not agent-specific, stays here)
registerCommand('model', async (ctx: CommandContext): Promise<CommandResponse> => {
  const modelId = ctx.args[0];

  if (!modelId) {
    return {
      reply: '❌ Usage: /model <model-id>\nExample: /model gpt-4o',
    };
  }

  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName, model: modelId }, 'Switching model');

  const prompt = ctx.args.slice(1).join(' ').trim();

  if (!prompt) {
    return {
      reply: `🤖 Model set to: ${modelId}\nSend your message to use this model.`,
      data: { model: modelId },
    };
  }

  return {
    data: {
      model: modelId,
      prompt,
    },
  };
});

// /agent - Generic agent switcher (fallback for any agent name)
registerCommand('agent', async (ctx: CommandContext): Promise<CommandResponse> => {
  const agentName = ctx.args[0];

  if (!agentName) {
    const agentList = discovered.map(a => a.name).join(', ');
    return {
      reply: `❌ Usage: /agent <agent-name>\nAvailable: ${agentList}\nExample: /agent talk what's up?`,
    };
  }

  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName, agent: agentName }, 'Switching agent');

  const prompt = ctx.args.slice(1).join(' ').trim();

  if (!prompt) {
    return {
      reply: `🎯 Agent set to: ${agentName}\nSend your message to use this agent.`,
      data: { agent: agentName },
    };
  }

  return {
    data: {
      agent: agentName,
      prompt,
    },
  };
});

// Export discovered agents for use by other modules (e.g., /help)
export { discovered as discoveredAgents };
export type { DiscoveredAgent };
