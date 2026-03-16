/**
 * Stdio MCP Server for EureClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 *
 * Tools are split into separate modules:
 * - mcp-tools-messaging.ts: send_message, schedule/list/pause/resume/cancel_task, register_group, send_image
 * - mcp-tools-data.ts: show_opencode_stats, show_system_status, show_execution_stats, list_agents,
 *                       list_logs, read_log, search_conversations, create/list_downloadable_files
 * - mcp-tools-security.ts: security_report, run_shell_command
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'path';
import type { McpToolContext } from './mcp-shared.js';
import { registerMessagingTools } from './mcp-tools-messaging.js';
import { registerDataTools } from './mcp-tools-data.js';
import { registerSecurityTools } from './mcp-tools-security.js';

// Context from environment variables (set by the agent runner)
const IPC_DIR = process.env.EURECLAW_IPC_DIR || '/workspace/ipc';

const ctx: McpToolContext = {
  chatJid: process.env.EURECLAW_CHAT_JID!,
  groupFolder: process.env.EURECLAW_GROUP_FOLDER!,
  isMain: process.env.EURECLAW_IS_MAIN === '1',
  ipcDir: IPC_DIR,
  messagesDir: path.join(IPC_DIR, 'messages'),
  tasksDir: path.join(IPC_DIR, 'tasks'),
};

const server = new McpServer({
  name: 'eureclaw',
  version: '1.0.0',
});

// Register all tool modules
registerMessagingTools(server, ctx);
registerDataTools(server, ctx);
registerSecurityTools(server, ctx);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
