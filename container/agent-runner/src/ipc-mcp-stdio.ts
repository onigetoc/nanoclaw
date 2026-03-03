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
  'Change the primary AI model. IMPORTANT: You MUST use list_models first to get valid model IDs. Do NOT guess model IDs.',
  {
    model: z.string().describe('EXACT model identifier from list_models (e.g., "opencode/minimax-m2.5-free", "google/gemini-2.5-flash-lite"). MUST contain a "/" separator.')
  },
  async (args) => {
    // Validate model ID format: must be "provider/model-name"
    if (!args.model.includes('/')) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Invalid model ID: "${args.model}"\n\n` +
                `Model IDs must be in "provider/model-name" format.\n` +
                `Use list_models to see valid model IDs.\n\n` +
                `Common models:\n` +
                `• opencode/minimax-m2.5-free (free)\n` +
                `• opencode/minimax-m2.1-free (free)\n` +
                `• opencode/glm-4.7-free (free)\n` +
                `• google/gemini-2.5-flash-lite (free tier)\n` +
                `• anthropic/claude-sonnet-4-5 (premium)`
        }],
        isError: true
      };
    }

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
                `⚠️  Restart required for changes to take effect.\n\n` +
                `/restart`
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
  'Set the lightweight model for simple tasks. IMPORTANT: You MUST use list_models first to get valid model IDs.',
  {
    model: z.string().describe('EXACT model identifier from list_models. MUST contain a "/" separator.')
  },
  async (args) => {
    if (!args.model.includes('/')) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Invalid model ID: "${args.model}"\n\nModel IDs must be in "provider/model-name" format.\nUse list_models to see valid IDs.`
        }],
        isError: true
      };
    }

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
                `⚠️  Restart required for changes to take effect.\n\n` +
                `/restart`
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
  'List AI models available for use. ALWAYS call this BEFORE change_model or set_small_model to get exact model IDs.',
  {
    category: z.enum(['free', 'premium', 'all']).optional().describe('Filter by category (default: all)')
  },
  async (args) => {
    const category = args.category || 'all';
    
    const freeModels = [
      '• opencode/minimax-m2.5-free — MiniMax M2.5 (recommended free default)',
      '• opencode/minimax-m2.1-free — MiniMax M2.1',
      '• opencode/glm-5-free — GLM-5 Free',
      '• opencode/glm-4.7-free — GLM-4.7 Free',
      '• opencode/kimi-k2.5-free — Kimi K2.5 Free',
      '• opencode/trinity-large-preview-free — Trinity Large Preview',
      '• google/gemini-2.5-flash-lite — Gemini 2.5 Flash Lite',
      '• google/gemini-2.0-flash-lite — Gemini 2.0 Flash Lite',
    ];

    const premiumModels = [
      '• opencode/claude-sonnet-4-5 — Claude Sonnet 4.5 (excellent for code)',
      '• opencode/claude-opus-4-5 — Claude Opus 4.5 (best reasoning)',
      '• opencode/gpt-5 — GPT-5',
      '• opencode/gpt-5.2 — GPT-5.2 (latest OpenAI)',
      '• opencode/gemini-3-pro — Gemini 3 Pro',
      '• opencode/kimi-k2.5 — Kimi K2.5',
      '• opencode/minimax-m2.5 — MiniMax M2.5 (paid)',
      '• google/gemini-2.5-flash — Gemini 2.5 Flash',
      '• google/gemini-2.5-pro — Gemini 2.5 Pro',
      '• anthropic/claude-sonnet-4-5-20250929 — Claude Sonnet 4.5',
      '• deepseek/deepseek-chat — DeepSeek Chat (cheap, good quality)',
    ];

    let models = [];
    if (category === 'free' || category === 'all') {
      models.push('## Free Models (no API key needed)\n', ...freeModels);
    }
    if (category === 'premium' || category === 'all') {
      models.push('\n## Premium Models (require API key or credits)\n', ...premiumModels);
    }

    models.push(
      '\n⚠️ IMPORTANT: Use the EXACT model ID shown above (e.g., "opencode/minimax-m2.5-free").',
      'Do NOT invent or modify model IDs. They must contain a "/" separator.'
    );

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

server.tool(
  'list_logs',
  'List agent execution logs for debugging. Shows recent log files from the current group or all groups (main only).',
  {
    limit: z.number().optional().default(20).describe('Maximum number of log files to return (default: 20)'),
    all_groups: z.boolean().optional().default(false).describe('(Main only) Show logs from all groups, not just current group')
  },
  async (args) => {
    const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    
    try {
      const logs: Array<{ file: string; group: string; timestamp: string; size: number }> = [];
      
      if (args.all_groups && isMain) {
        // List logs from all groups
        const groupsDir = path.join(projectDir, 'groups');
        const groups = fs.readdirSync(groupsDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && !['templates', 'global'].includes(d.name));
        
        for (const group of groups) {
          const logsDir = path.join(groupsDir, group.name, 'logs');
          if (fs.existsSync(logsDir)) {
            const files = fs.readdirSync(logsDir)
              .filter(f => f.endsWith('.log'))
              .map(f => {
                const stat = fs.statSync(path.join(logsDir, f));
                return {
                  file: f,
                  group: group.name,
                  timestamp: stat.mtime.toISOString(),
                  size: stat.size
                };
              });
            logs.push(...files);
          }
        }
      } else {
        // List logs from current group only
        const logsDir = path.join(groupDir, 'logs');
        if (fs.existsSync(logsDir)) {
          const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log'))
            .map(f => {
              const stat = fs.statSync(path.join(logsDir, f));
              return {
                file: f,
                group: groupFolder,
                timestamp: stat.mtime.toISOString(),
                size: stat.size
              };
            });
          logs.push(...files);
        }
      }
      
      if (logs.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No log files found.'
          }]
        };
      }
      
      // Sort by timestamp (newest first) and limit
      logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const limited = logs.slice(0, args.limit);
      
      const formatted = limited.map(log => {
        const sizeKB = (log.size / 1024).toFixed(1);
        const date = new Date(log.timestamp).toLocaleString();
        return `• ${log.file} (${log.group}) - ${sizeKB}KB - ${date}`;
      }).join('\n');
      
      return {
        content: [{
          type: 'text' as const,
          text: `Found ${logs.length} log files (showing ${limited.length}):\n\n${formatted}\n\nUse read_log to view a specific log file.`
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Error listing logs: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  'read_log',
  'Read the contents of a specific agent execution log file for debugging.',
  {
    filename: z.string().describe('Log filename (e.g., "direct-2026-02-23T12-00-00-000Z.log")'),
    lines: z.number().optional().describe('Number of lines to read from the end (default: all)'),
    group: z.string().optional().describe('(Main only) Group folder name if reading from another group')
  },
  async (args) => {
    const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    
    try {
      let logsDir: string;
      
      if (args.group && isMain) {
        // Read from specified group
        logsDir = path.join(projectDir, 'groups', args.group, 'logs');
      } else {
        // Read from current group
        logsDir = path.join(groupDir, 'logs');
      }
      
      const logPath = path.join(logsDir, args.filename);
      
      if (!fs.existsSync(logPath)) {
        return {
          content: [{
            type: 'text' as const,
            text: `✗ Log file not found: ${args.filename}`
          }],
          isError: true
        };
      }
      
      let content = fs.readFileSync(logPath, 'utf-8');
      
      // If lines limit specified, get last N lines
      if (args.lines) {
        const allLines = content.split('\n');
        const lastLines = allLines.slice(-args.lines);
        content = lastLines.join('\n');
      }
      
      const stat = fs.statSync(logPath);
      const sizeKB = (stat.size / 1024).toFixed(1);
      
      return {
        content: [{
          type: 'text' as const,
          text: `# Log: ${args.filename}\nSize: ${sizeKB}KB | Modified: ${stat.mtime.toISOString()}\n\n\`\`\`\n${content}\n\`\`\``
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Error reading log: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

// Monitoring tools
server.tool(
  'show_system_status',
  'Show current system status: active agents, model configuration, OpenCode server status, and recent activity. Use this to understand what is currently happening in the system.',
  {},
  async () => {
    try {
      const statusFile = path.join(IPC_DIR, 'system-status.json');
      
      if (!fs.existsSync(statusFile)) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️ System status not available yet. The monitoring system may still be initializing.'
          }]
        };
      }

      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      
      let output = '# 📊 EureClaw System Status\n\n';
      
      // Model Configuration
      output += '## 🧠 Model Configuration\n';
      output += `- **Primary Model:** ${status.models.primary}\n`;
      output += `- **Small Model:** ${status.models.small}\n`;
      if (status.models.fallback) {
        output += `- **Fallback Model:** ${status.models.fallback}\n`;
      }
      if (status.models.vision) {
        output += `- **Vision Model:** ${status.models.vision}\n`;
      }
      output += '\n';
      
      // OpenCode Server
      output += '## 🖥️ OpenCode Server\n';
      output += `- **Status:** ${status.openCodeServer.status === 'running' ? '✅ Running' : '❌ Stopped'}\n`;
      output += `- **Port:** ${status.openCodeServer.port}\n`;
      output += '\n';
      
      // System State
      output += '## 📈 System State\n';
      output += `- **Active Agents:** ${status.activeAgents}\n`;
      output += `- **Registered Groups:** ${status.registeredGroups}\n`;
      output += `- **Sleeping:** ${status.isSleeping ? 'Yes' : 'No'}\n`;
      output += `- **Uptime:** ${Math.floor(status.uptime / 60)} minutes\n`;
      output += '\n';
      
      // Recent Activity
      if (status.recentExecutions && status.recentExecutions.length > 0) {
        output += '## 🚀 Recent Agent Executions (Last 10)\n\n';
        output += '| Time | Group | Agent | Model | Status | Duration |\n';
        output += '|------|-------|-------|-------|--------|----------|\n';
        
        for (const exec of status.recentExecutions.slice(0, 10)) {
          const time = new Date(exec.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const model = exec.model.split('/').pop() || exec.model;
          const statusIcon = exec.status === 'completed' ? '✅' : exec.status === 'error' ? '❌' : '⏳';
          const duration = exec.duration ? `${(exec.duration / 1000).toFixed(1)}s` : '-';
          
          output += `| ${time} | ${exec.groupFolder} | ${exec.agentType} | ${model} | ${statusIcon} | ${duration} |\n`;
        }
      } else {
        output += '## 🚀 Recent Agent Executions\n\nNo recent executions.\n';
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: output
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Error reading system status: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  'show_execution_stats',
  'Show detailed statistics about agent executions: success rate, average duration, breakdown by agent type and group. Use this to understand system performance and usage patterns.',
  {},
  async () => {
    try {
      const statsFile = path.join(IPC_DIR, 'execution-stats.json');
      
      if (!fs.existsSync(statsFile)) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️ Execution statistics not available yet.'
          }]
        };
      }

      const stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
      
      let output = '# 📊 Execution Statistics\n\n';
      
      output += '## Overall Performance\n';
      output += `- **Total Executions:** ${stats.totalExecutions}\n`;
      output += `- **Success Rate:** ${stats.successRate.toFixed(1)}%\n`;
      output += `- **Average Duration:** ${(stats.averageDuration / 1000).toFixed(1)}s\n`;
      output += '\n';
      
      if (Object.keys(stats.byAgent).length > 0) {
        output += '## By Agent Type\n\n';
        const sortedAgents = Object.entries(stats.byAgent).sort((a: any, b: any) => b[1] - a[1]);
        for (const [agent, count] of sortedAgents) {
          const bar = '█'.repeat(Math.min(Math.ceil((count as number) / 2), 20));
          output += `- **${agent}:** ${count} ${bar}\n`;
        }
        output += '\n';
      }
      
      if (Object.keys(stats.byGroup).length > 0) {
        output += '## By Group\n\n';
        const sortedGroups = Object.entries(stats.byGroup).sort((a: any, b: any) => b[1] - a[1]);
        for (const [group, count] of sortedGroups) {
          const bar = '█'.repeat(Math.min(Math.ceil((count as number) / 2), 20));
          output += `- **${group}:** ${count} ${bar}\n`;
        }
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: output
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `✗ Error reading execution stats: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  'list_agents',
  'List all available agents that can be invoked. Returns agent names, descriptions, and file paths.',
  {},
  async () => {
    try {
      const agentsDir = '/workspace/project/.opencode/agents';
      
      if (!fs.existsSync(agentsDir)) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No agents directory found.'
          }]
        };
      }

      const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      const agents = [];

      for (const file of agentFiles) {
        const filePath = path.join(agentsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Extract frontmatter description if available
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let description = 'No description available';
        
        if (frontmatterMatch) {
          const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
          if (descMatch) {
            description = descMatch[1].trim().replace(/^["']|["']$/g, '');
          }
        }
        
        // If no frontmatter description, try to get first non-heading line
        if (description === 'No description available') {
          const lines = content.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              description = trimmed.slice(0, 150);
              break;
            }
          }
        }

        agents.push({
          name: path.basename(file, '.md'),
          description,
          file
        });
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(agents, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error listing agents: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);

// --- Conversation Memory Tools ---

/**
 * Get the SQLite database path.
 * In direct mode: {PROJECT_DIR}/store/messages.db
 * In container mode: /workspace/project/store/messages.db
 */
function getDbPath(): string {
  const projectDir = process.env.PROJECT_DIR || '/workspace/project';
  return path.join(projectDir, 'store', 'messages.db');
}

server.tool(
  'search_conversations',
  `Search your conversation history in the SQLite database. Use this when:
- The user asks "what did we talk about?", "remember when...", "what was that thing..."
- You need context from previous conversations
- You want to recall a decision, idea, or instruction from the user
Returns messages matching the query, ordered by most recent first.`,
  {
    query: z.string().optional().describe('Search term to filter messages (searches in content). Leave empty to get recent messages.'),
    limit: z.number().optional().describe('Max number of messages to return (default: 20, max: 50)'),
    hours_ago: z.number().optional().describe('Only return messages from the last N hours (e.g. 24 for last day)'),
    sender: z.string().optional().describe('Filter by sender name (e.g. "Gino", "Andy")'),
  },
  async (args) => {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      return {
        content: [{ type: 'text' as const, text: 'No conversation database found.' }],
        isError: true,
      };
    }

    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath, { readonly: true });

      const limit = Math.min(args.limit || 20, 50);
      const conditions: string[] = [`chat_jid = ?`];
      const params: any[] = [chatJid];

      if (args.query) {
        conditions.push(`content LIKE ?`);
        params.push(`%${args.query}%`);
      }

      if (args.hours_ago) {
        const since = new Date(Date.now() - args.hours_ago * 3600000).toISOString();
        conditions.push(`timestamp > ?`);
        params.push(since);
      }

      if (args.sender) {
        conditions.push(`sender_name LIKE ?`);
        params.push(`%${args.sender}%`);
      }

      const where = conditions.join(' AND ');
      const rows = db.prepare(
        `SELECT sender_name, content, timestamp, is_bot_message
         FROM messages
         WHERE ${where}
         ORDER BY timestamp DESC
         LIMIT ?`
      ).all(...params, limit) as Array<{
        sender_name: string;
        content: string;
        timestamp: string;
        is_bot_message: number;
      }>;

      db.close();

      if (rows.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No messages found matching your criteria.' }],
        };
      }

      // Reverse to chronological order
      rows.reverse();

      const formatted = rows.map(msg => {
        const date = new Date(msg.timestamp);
        const timeStr = date.toLocaleString('fr-FR', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const role = msg.is_bot_message ? '🤖' : '👤';
        return `${role} [${timeStr}] ${msg.sender_name}: ${msg.content}`;
      }).join('\n\n');

      return {
        content: [{ type: 'text' as const, text: `Found ${rows.length} message(s):\n\n${formatted}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error searching conversations: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
