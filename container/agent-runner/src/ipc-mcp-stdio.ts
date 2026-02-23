/**
 * Stdio MCP Server for EureClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = process.env.EURECLAW_IPC_DIR || '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

// Context from environment variables (set by the agent runner)
const chatJid = process.env.EURECLAW_CHAT_JID!;
const groupFolder = process.env.EURECLAW_GROUP_FOLDER!;
const isMain = process.env.EURECLAW_IS_MAIN === '1';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'eureclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times. Note: when running as a scheduled task, your final output is NOT sent to the user — use this tool if you need to communicate with the user or group.",
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.'),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
    schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
    schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
    context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
    target_group_jid: z.string().optional().describe('(Main group only) JID of the group to schedule the task for. Defaults to the current group.'),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}". Use ISO 8601 format like "2026-02-01T15:30:00.000Z".` }],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const data = {
      type: 'schedule_task',
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    const filename = writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Task scheduled (${filename}): ${args.schedule_type} - ${args.schedule_value}` }],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

      if (tasks.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const formatted = tasks
        .map(
          (t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  },
);

server.tool(
  'register_group',
  `Register a new WhatsApp group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name should be lowercase with hyphens (e.g., "family-chat").`,
  {
    jid: z.string().describe('The WhatsApp JID (e.g., "120363336345536173@g.us")'),
    name: z.string().describe('Display name for the group'),
    folder: z.string().describe('Folder name for group files (lowercase, hyphens, e.g., "family-chat")'),
    trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can register new groups.' }],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Group "${args.name}" registered. It will start receiving messages immediately.` }],
    };
  },
);

// Model Management Tools
server.tool(
  'get_current_model',
  'Get the current AI model configuration (primary, small, fallback models)',
  {},
  async () => {
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    const configPath = path.join(projectDir, 'models-config.json');
    
    let config: any = {
      model: 'opencode/minimax-m2.5-free',
      small_model: 'opencode/minimax-m2.5-free'
    };
    
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {}
    }

    // Check what model is actually running (from env vars passed to OpenCode)
    const runningModel = process.env.OPENCODE_MODEL || 'unknown';
    const configuredModel = config.model || 'opencode/minimax-m2.5-free';
    const modelsMatch = runningModel === configuredModel || runningModel === 'unknown';
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          configured_primary_model: configuredModel,
          configured_small_model: config.small_model || config.model || 'opencode/minimax-m2.5-free',
          configured_fallback_model: config.fallback_model || 'none',
          currently_running_model: runningModel,
          models_in_sync: modelsMatch,
          note: modelsMatch 
            ? 'Configuration matches running model' 
            : 'Configuration changed - restart required to apply'
        }, null, 2)
      }]
    };
  }
);

server.tool(
  'change_model',
  'Change the primary AI model used for complex reasoning tasks. Requires server restart.',
  {
    model: z.string().describe('Model identifier (e.g., "anthropic/claude-3-5-sonnet", "google/gemini-2.0-flash-lite")')
  },
  async (args) => {
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    const configPath = path.join(projectDir, 'models-config.json');
    
    let config: any = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {}
    }
    
    config.model = args.model;
    
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return {
        content: [{
          type: 'text' as const,
          text: `✓ Primary model changed to: ${args.model}\n\n` +
                `⚠️  Restart required for changes to take effect.\n` +
                `Wait a few seconds, then use /restart to apply the new model.`
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Failed to change model: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  'set_small_model',
  'Set the lightweight model for simple tasks (searches, summaries). Requires server restart.',
  {
    model: z.string().describe('Model identifier for lightweight tasks (e.g., "google/gemini-2.0-flash-lite")')
  },
  async (args) => {
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    const configPath = path.join(projectDir, 'models-config.json');
    
    let config: any = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {}
    }
    
    config.small_model = args.model;
    
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return {
        content: [{
          type: 'text' as const,
          text: `✓ Small model changed to: ${args.model}\n\n` +
                `⚠️  Restart required for changes to take effect.\n` +
                `Wait a few seconds, then use /restart to apply the new model.`
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Failed to set small model: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  'list_models',
  'List popular AI models available for use',
  {
    category: z.enum(['free', 'premium', 'all']).optional().describe('Filter by category (default: all)')
  },
  async (args) => {
    const category = args.category || 'all';
    
    const freeModels = [
      '• opencode/minimax-m2.5-free - MiniMax M2.5 Free (current default)',
      '• opencode/glm-5-free - GLM-5 Free (good for Chinese)',
      '• google/gemini-2.0-flash-lite - Gemini 2.0 Flash Lite (fast, lightweight)',
      '• google/gemini-2.5-flash-lite - Gemini 2.5 Flash Lite (latest lite version)'
    ];

    const premiumModels = [
      '• anthropic/claude-3-5-sonnet - Claude 3.5 Sonnet (balanced, excellent for code)',
      '• anthropic/claude-3-opus - Claude 3 Opus (best reasoning)',
      '• openai/gpt-4o - GPT-4 Omni (multimodal)',
      '• openai/gpt-4-turbo - GPT-4 Turbo (fast GPT-4)',
      '• google/gemini-2.0-pro - Gemini 2.0 Pro (Google\'s best)',
      '• deepseek/deepseek-chat - DeepSeek Chat (very cheap, good quality)'
    ];

    let models = [];
    if (category === 'free' || category === 'all') {
      models.push('## Free Models\n', ...freeModels);
    }
    if (category === 'premium' || category === 'all') {
      models.push('\n## Premium Models (require API key)\n', ...premiumModels);
    }

    return {
      content: [{
        type: 'text' as const,
        text: models.join('\n')
      }]
    };
  }
);

server.tool(
  'show_opencode_stats',
  'Show OpenCode usage statistics including sessions, messages, costs, tokens, and tool usage. Useful to see how much the AI is being used and costing.',
  {},
  async () => {
    const { execSync } = await import('child_process');
    
    try {
      // Run opencode stats command
      const output = execSync('opencode stats', {
        encoding: 'utf-8',
        cwd: process.env.PROJECT_DIR || '/workspace/project',
        timeout: 10000
      });
      
      return {
        content: [{
          type: 'text' as const,
          text: `# OpenCode Usage Statistics\n\n\`\`\`\n${output}\n\`\`\``
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to get OpenCode stats: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  'send_image',
  'Send an image or file to the user via Telegram/WhatsApp. Use this after taking screenshots or generating images.',
  {
    filePath: z.string().describe('Path to image file (relative to group folder or absolute). Supported: .png, .jpg, .jpeg, .gif, .webp, .pdf'),
    caption: z.string().optional().describe('Optional caption for the image')
  },
  async (args) => {
    const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    
    // Resolve path
    let resolvedPath = args.filePath;
    if (!path.isAbsolute(args.filePath)) {
      // Try group folder first
      const groupPath = path.join(groupDir, args.filePath);
      if (fs.existsSync(groupPath)) {
        resolvedPath = groupPath;
      } else {
        // Try project root
        const projectPath = path.join(projectDir, args.filePath);
        if (fs.existsSync(projectPath)) {
          resolvedPath = projectPath;
        } else {
          return {
            content: [{
              type: 'text' as const,
              text: `✗ File not found: ${args.filePath}\nTried:\n- ${groupPath}\n- ${projectPath}`
            }],
            isError: true
          };
        }
      }
    }
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ File not found: ${resolvedPath}`
        }],
        isError: true
      };
    }
    
    // Validate file type
    const ext = path.extname(resolvedPath).toLowerCase();
    const supportedTypes = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'];
    if (!supportedTypes.includes(ext)) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Unsupported file type: ${ext}\nSupported: ${supportedTypes.join(', ')}`
        }],
        isError: true
      };
    }
    
    // Write IPC message
    const data = {
      type: 'send_image',
      filePath: resolvedPath,
      caption: args.caption,
      chatJid,
      groupFolder,
      timestamp: new Date().toISOString(),
    };
    
    writeIpcFile(MESSAGES_DIR, data);
    
    return {
      content: [{
        type: 'text' as const,
        text: `✓ Image queued for sending: ${path.basename(resolvedPath)}`
      }]
    };
  }
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
