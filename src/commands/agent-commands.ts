/**
 * Agent switching commands for all channels (Telegram, WhatsApp, Web UI)
 * Allows users to switch agents on-the-fly with slash commands
 * 
 * Examples:
 *   /plan analyze my budget
 *   /orchestrator research climate change
 *   /build fix the login bug
 */

import { registerCommand, CommandContext, CommandResponse } from './index.js';
import { logger } from '../logger.js';

/**
 * Register agent switching commands
 * These commands set the agent preference for the next message
 */

// /plan - Switch to Plan agent (read-only, analysis)
registerCommand('plan', async (ctx: CommandContext): Promise<CommandResponse> => {
  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName }, 'Switching to Plan agent');
  
  // The message after the command becomes the actual prompt
  const prompt = ctx.args.join(' ').trim();
  
  if (!prompt) {
    return {
      reply: '📋 Plan mode activated. Send your message to use the Plan agent (read-only, analysis).',
      data: { agent: 'plan' }
    };
  }
  
  // Return the prompt with agent metadata
  // The message processor will pick this up and set preferences
  return {
    data: { 
      agent: 'plan',
      prompt 
    }
  };
});

// /build - Switch to Build agent (full access)
registerCommand('build', async (ctx: CommandContext): Promise<CommandResponse> => {
  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName }, 'Switching to Build agent');
  
  const prompt = ctx.args.join(' ').trim();
  
  if (!prompt) {
    return {
      reply: '🔨 Build mode activated. Send your message to use the Build agent (full access).',
      data: { agent: 'build' }
    };
  }
  
  return {
    data: { 
      agent: 'build',
      prompt 
    }
  };
});

// /orchestrator - Switch to Orchestrator agent
registerCommand('orchestrator', async (ctx: CommandContext): Promise<CommandResponse> => {
  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName }, 'Switching to Orchestrator agent');
  
  const prompt = ctx.args.join(' ').trim();
  
  if (!prompt) {
    return {
      reply: '🎯 Orchestrator mode activated. Send your message to delegate tasks to specialized subagents.',
      data: { agent: 'orchestrator' }
    };
  }
  
  return {
    data: { 
      agent: 'orchestrator',
      prompt 
    }
  };
});

// /planner - Switch to Planner agent
registerCommand('planner', async (ctx: CommandContext): Promise<CommandResponse> => {
  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName }, 'Switching to Planner agent');
  
  const prompt = ctx.args.join(' ').trim();
  
  if (!prompt) {
    return {
      reply: '📝 Planner mode activated. Send your message to create detailed task plans.',
      data: { agent: 'planner' }
    };
  }
  
  return {
    data: { 
      agent: 'planner',
      prompt 
    }
  };
});

// /model - Override model for next message
registerCommand('model', async (ctx: CommandContext): Promise<CommandResponse> => {
  const modelId = ctx.args[0];
  
  if (!modelId) {
    return {
      reply: '❌ Usage: /model <model-id>\nExample: /model gpt-4o'
    };
  }
  
  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName, model: modelId }, 'Switching model');
  
  // Remaining args become the prompt
  const prompt = ctx.args.slice(1).join(' ').trim();
  
  if (!prompt) {
    return {
      reply: `🤖 Model set to: ${modelId}\nSend your message to use this model.`,
      data: { model: modelId }
    };
  }
  
  return {
    data: { 
      model: modelId,
      prompt 
    }
  };
});

// /agent - Generic agent switcher (alias for specific commands)
registerCommand('agent', async (ctx: CommandContext): Promise<CommandResponse> => {
  const agentName = ctx.args[0];
  
  if (!agentName) {
    return {
      reply: '❌ Usage: /agent <agent-name>\nAvailable: plan, build, orchestrator, planner\nExample: /agent plan analyze my code'
    };
  }
  
  logger.info({ chatJid: ctx.chatJid, sender: ctx.senderName, agent: agentName }, 'Switching agent');
  
  const prompt = ctx.args.slice(1).join(' ').trim();
  
  if (!prompt) {
    return {
      reply: `🎯 Agent set to: ${agentName}\nSend your message to use this agent.`,
      data: { agent: agentName }
    };
  }
  
  return {
    data: { 
      agent: agentName,
      prompt 
    }
  };
});

logger.info('Agent switching commands registered');
