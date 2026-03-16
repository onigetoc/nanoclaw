/**
 * MCP Tools — Security
 * security_report, run_shell_command
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { checkCommand } from './command-security.js';
import type { McpToolContext } from './mcp-shared.js';
import { writeIpcFile } from './mcp-shared.js';

export function registerSecurityTools(server: McpServer, ctx: McpToolContext): void {
  const { chatJid, groupFolder, isMain, ipcDir } = ctx;

  server.tool(
    'security_report',
    'View recent security events. Main group only.',
    {
      limit: z.number().optional().default(20).describe('Number of recent events (default: 20, max: 100)'),
    },
    async (args) => {
      if (!isMain) {
        return { content: [{ type: 'text' as const, text: 'Security reports are only available to the main group.' }], isError: true };
      }
      try {
        const projectDir = process.env.PROJECT_DIR || '/workspace/project';
        const logFile = path.join(projectDir, 'data', 'security', 'security-events.log');
        if (!fs.existsSync(logFile)) {
          return { content: [{ type: 'text' as const, text: 'No security events recorded yet.' }] };
        }
        const content = fs.readFileSync(logFile, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        const limit = Math.min(args.limit || 20, 100);
        const start = Math.max(0, lines.length - limit);
        const events: Array<{ timestamp: string; eventType: string; sourceGroup: string; severity: string; description: string }> = [];
        for (let i = start; i < lines.length; i++) {
          try { events.push(JSON.parse(lines[i])); } catch { /* skip malformed */ }
        }
        if (events.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No security events found.' }] };
        }
        const icon: Record<string, string> = { info: 'ℹ️', warning: '⚠️', critical: '🚨' };
        const formatted = events.map(e => {
          const time = new Date(e.timestamp).toLocaleString();
          return `${icon[e.severity] || '❓'} [${time}] [${e.severity}] ${e.eventType} (${e.sourceGroup})\n   ${e.description}`;
        }).join('\n\n');
        return { content: [{ type: 'text' as const, text: `# Security Report (${events.length} of ${lines.length} events)\n\n${formatted}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    'run_shell_command',
    'Execute a shell command. Dangerous commands are blocked for non-main groups and require approval for main.',
    {
      command: z.string().describe('The shell command to execute'),
      cwd: z.string().optional().describe('Working directory'),
      timeout: z.number().optional().default(30000).describe('Timeout in ms (default: 30000)'),
    },
    async (args) => {
      const check = checkCommand(args.command);
      if (!check.safe) {
        if (!isMain) {
          writeIpcFile(path.join(ipcDir, 'messages'), {
            type: 'security_event', chatJid, groupFolder, eventType: 'command_blocked',
            severity: 'warning', description: `Blocked [${check.pattern}]: ${check.description}`,
            command: args.command.slice(0, 500), timestamp: new Date().toISOString(),
          });
          return { content: [{ type: 'text' as const, text: `🚫 Blocked: ${check.description}\nNon-main groups cannot execute dangerous commands.` }], isError: true };
        }
        const approvalId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(path.join(ipcDir, 'messages'), {
          type: 'approval_request', chatJid, groupFolder, approvalId,
          command: args.command, pattern: check.pattern, description: check.description,
          timestamp: new Date().toISOString(),
        });
        return { content: [{ type: 'text' as const, text: `⚠️ Dangerous: ${check.description}\nApproval requested (${approvalId}). Command NOT executed.` }], isError: true };
      }

      const { execSync } = await import('child_process');
      const groupDirPath = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
      try {
        const output = execSync(args.command, {
          encoding: 'utf-8', cwd: args.cwd || groupDirPath,
          timeout: args.timeout || 30000, maxBuffer: 1024 * 1024,
        });
        return { content: [{ type: 'text' as const, text: output || '(no output)' }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Failed (exit ${err.status || '?'}):\n${err.stderr || err.stdout || err.message}` }], isError: true };
      }
    },
  );
}
