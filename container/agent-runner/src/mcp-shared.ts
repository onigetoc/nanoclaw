/**
 * Shared types and utilities for MCP tool modules.
 * Each tool module receives a McpToolContext and registers tools on the server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs';
import path from 'path';

export interface McpToolContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
  ipcDir: string;
  messagesDir: string;
  tasksDir: string;
}

export function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

export type RegisterFn = (server: McpServer, ctx: McpToolContext) => void;
