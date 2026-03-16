/**
 * MCP Tools — Messaging & Task Scheduling
 * send_message, schedule_task, list_tasks, pause_task, resume_task,
 * cancel_task, register_group, send_image
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';
import type { McpToolContext } from './mcp-shared.js';
import { writeIpcFile } from './mcp-shared.js';

export function registerMessagingTools(server: McpServer, ctx: McpToolContext): void {
  const { chatJid, groupFolder, isMain, messagesDir, tasksDir, ipcDir } = ctx;

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
      writeIpcFile(messagesDir, data);
      return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
    },
  );

  server.tool(
    'schedule_task',
    `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history.
\u2022 "isolated": Task runs in a fresh session with no conversation history.

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00")`,
    {
      prompt: z.string().describe('What the agent should do when the task runs.'),
      schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
      schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00"'),
      context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history, isolated=fresh session'),
      target_group_jid: z.string().optional().describe('(Main group only) JID of the group to schedule the task for.'),
    },
    async (args) => {
      if (args.schedule_type === 'cron') {
        try {
          CronExpressionParser.parse(args.schedule_value);
        } catch {
          return {
            content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am).` }],
            isError: true,
          };
        }
      } else if (args.schedule_type === 'interval') {
        const ms = parseInt(args.schedule_value, 10);
        if (isNaN(ms) || ms <= 0) {
          return {
            content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds.` }],
            isError: true,
          };
        }
      } else if (args.schedule_type === 'once') {
        const date = new Date(args.schedule_value);
        if (isNaN(date.getTime())) {
          return {
            content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}". Use ISO 8601 format.` }],
            isError: true,
          };
        }
      }

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
      const filename = writeIpcFile(tasksDir, data);
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
      const tasksFile = path.join(ipcDir, 'current_tasks.json');
      try {
        if (!fs.existsSync(tasksFile)) {
          return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
        }
        const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
        const tasks = isMain ? allTasks : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);
        if (tasks.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
        }
        const formatted = tasks
          .map((t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`)
          .join('\n');
        return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    },
  );

  server.tool('pause_task', 'Pause a scheduled task.', { task_id: z.string() }, async (args) => {
    writeIpcFile(tasksDir, { type: 'pause_task', taskId: args.task_id, groupFolder, isMain, timestamp: new Date().toISOString() });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  });

  server.tool('resume_task', 'Resume a paused task.', { task_id: z.string() }, async (args) => {
    writeIpcFile(tasksDir, { type: 'resume_task', taskId: args.task_id, groupFolder, isMain, timestamp: new Date().toISOString() });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  });

  server.tool('cancel_task', 'Cancel and delete a scheduled task.', { task_id: z.string() }, async (args) => {
    writeIpcFile(tasksDir, { type: 'cancel_task', taskId: args.task_id, groupFolder, isMain, timestamp: new Date().toISOString() });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  });

  server.tool(
    'register_group',
    'Register a new WhatsApp group so the agent can respond to messages there. Main group only.',
    {
      jid: z.string().describe('The WhatsApp JID'),
      name: z.string().describe('Display name for the group'),
      folder: z.string().describe('Folder name (lowercase, hyphens)'),
      trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
    },
    async (args) => {
      if (!isMain) {
        return { content: [{ type: 'text' as const, text: 'Only the main group can register new groups.' }], isError: true };
      }
      writeIpcFile(tasksDir, { type: 'register_group', jid: args.jid, name: args.name, folder: args.folder, trigger: args.trigger, timestamp: new Date().toISOString() });
      return { content: [{ type: 'text' as const, text: `Group "${args.name}" registered.` }] };
    },
  );

  server.tool(
    'send_image',
    'Send an image or file to the user via Telegram/WhatsApp.',
    {
      filePath: z.string().describe('Path to image file. Supported: .png, .jpg, .jpeg, .gif, .webp, .pdf'),
      caption: z.string().optional().describe('Optional caption'),
    },
    async (args) => {
      const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
      const projectDir = process.env.PROJECT_DIR || '/workspace/project';

      let resolvedPath = args.filePath;
      if (!path.isAbsolute(args.filePath)) {
        const groupPath = path.join(groupDir, args.filePath);
        if (fs.existsSync(groupPath)) {
          resolvedPath = groupPath;
        } else {
          const projectPath = path.join(projectDir, args.filePath);
          if (fs.existsSync(projectPath)) {
            resolvedPath = projectPath;
          } else {
            return { content: [{ type: 'text' as const, text: `File not found: ${args.filePath}` }], isError: true };
          }
        }
      }
      if (!fs.existsSync(resolvedPath)) {
        return { content: [{ type: 'text' as const, text: `File not found: ${resolvedPath}` }], isError: true };
      }
      const ext = path.extname(resolvedPath).toLowerCase();
      const supported = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'];
      if (!supported.includes(ext)) {
        return { content: [{ type: 'text' as const, text: `Unsupported file type: ${ext}` }], isError: true };
      }
      writeIpcFile(messagesDir, { type: 'send_image', filePath: resolvedPath, caption: args.caption, chatJid, groupFolder, timestamp: new Date().toISOString() });
      return { content: [{ type: 'text' as const, text: `Image queued: ${path.basename(resolvedPath)}` }] };
    },
  );
}
