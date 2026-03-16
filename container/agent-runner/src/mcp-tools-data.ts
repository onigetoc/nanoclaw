/**
 * MCP Tools — Monitoring, Logs, Conversations, Downloads
 * show_opencode_stats, show_system_status, show_execution_stats, list_agents,
 * list_logs, read_log, search_conversations, create_downloadable_file,
 * list_downloadable_files
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import type { McpToolContext } from './mcp-shared.js';
import { writeIpcFile } from './mcp-shared.js';

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.md': 'text/markdown', '.txt': 'text/plain', '.json': 'application/json',
    '.csv': 'text/csv', '.html': 'text/html', '.xml': 'application/xml',
    '.yaml': 'application/x-yaml', '.yml': 'application/x-yaml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function registerDataTools(server: McpServer, ctx: McpToolContext): void {
  const { chatJid, groupFolder, isMain, ipcDir } = ctx;
  const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
  const projectDir = process.env.PROJECT_DIR || '/workspace/project';
  const DOWNLOADS_DIR = path.join(groupDir, 'workspace', 'downloads');

  // --- Monitoring ---

  server.tool('show_opencode_stats', 'Show OpenCode usage statistics.', {}, async () => {
    const { execSync } = await import('child_process');
    try {
      const output = execSync('opencode stats', { encoding: 'utf-8', cwd: projectDir, timeout: 10000 });
      return { content: [{ type: 'text' as const, text: `# OpenCode Usage Statistics\n\n\`\`\`\n${output}\n\`\`\`` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Failed to get stats: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.tool('show_system_status', 'Show current system status: active agents, model config, recent activity.', {}, async () => {
    try {
      const statusFile = path.join(ipcDir, 'system-status.json');
      if (!fs.existsSync(statusFile)) {
        return { content: [{ type: 'text' as const, text: 'System status not available yet.' }] };
      }
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      let output = '# EureClaw System Status\n\n';
      output += `## Model Configuration\n`;
      output += `- Primary: ${status.models.primary}\n- Small: ${status.models.small}\n`;
      if (status.models.fallback) output += `- Fallback: ${status.models.fallback}\n`;
      if (status.models.vision) output += `- Vision: ${status.models.vision}\n`;
      output += `\n## OpenCode Server\n- Status: ${status.openCodeServer.status === 'running' ? 'Running' : 'Stopped'}\n- Port: ${status.openCodeServer.port}\n`;
      output += `\n## System State\n- Active Agents: ${status.activeAgents}\n- Registered Groups: ${status.registeredGroups}\n- Sleeping: ${status.isSleeping ? 'Yes' : 'No'}\n- Uptime: ${Math.floor(status.uptime / 60)} minutes\n`;
      if (status.recentExecutions?.length > 0) {
        output += '\n## Recent Executions (Last 10)\n\n| Time | Group | Agent | Model | Status | Duration |\n|------|-------|-------|-------|--------|----------|\n';
        for (const exec of status.recentExecutions.slice(0, 10)) {
          const time = new Date(exec.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const model = exec.model.split('/').pop() || exec.model;
          const icon = exec.status === 'completed' ? '✅' : exec.status === 'error' ? '❌' : '⏳';
          const dur = exec.duration ? `${(exec.duration / 1000).toFixed(1)}s` : '-';
          output += `| ${time} | ${exec.groupFolder} | ${exec.agentType} | ${model} | ${icon} | ${dur} |\n`;
        }
      }
      return { content: [{ type: 'text' as const, text: output }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.tool('show_execution_stats', 'Show execution statistics: success rate, duration, breakdown by agent/group.', {}, async () => {
    try {
      const statsFile = path.join(ipcDir, 'execution-stats.json');
      if (!fs.existsSync(statsFile)) {
        return { content: [{ type: 'text' as const, text: 'Execution statistics not available yet.' }] };
      }
      const stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
      let output = `# Execution Statistics\n\n## Overall\n- Total: ${stats.totalExecutions}\n- Success Rate: ${stats.successRate.toFixed(1)}%\n- Avg Duration: ${(stats.averageDuration / 1000).toFixed(1)}s\n`;
      if (Object.keys(stats.byAgent).length > 0) {
        output += '\n## By Agent\n';
        for (const [agent, count] of Object.entries(stats.byAgent).sort((a: any, b: any) => b[1] - a[1])) {
          output += `- ${agent}: ${count}\n`;
        }
      }
      if (Object.keys(stats.byGroup).length > 0) {
        output += '\n## By Group\n';
        for (const [group, count] of Object.entries(stats.byGroup).sort((a: any, b: any) => b[1] - a[1])) {
          output += `- ${group}: ${count}\n`;
        }
      }
      return { content: [{ type: 'text' as const, text: output }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.tool('list_agents', 'List all available agents.', {}, async () => {
    try {
      const agentsDir = '/workspace/project/.opencode/agents';
      if (!fs.existsSync(agentsDir)) {
        return { content: [{ type: 'text' as const, text: 'No agents directory found.' }] };
      }
      const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      const agents = [];
      for (const file of agentFiles) {
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
        const fm = content.match(/^---\n([\s\S]*?)\n---/);
        let desc = 'No description';
        if (fm) {
          const dm = fm[1].match(/description:\s*(.+)/);
          if (dm) desc = dm[1].trim().replace(/^["']|["']$/g, '');
        }
        if (desc === 'No description') {
          const lines = content.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
          for (const line of lines) {
            const t = line.trim();
            if (t && !t.startsWith('#')) { desc = t.slice(0, 150); break; }
          }
        }
        agents.push({ name: path.basename(file, '.md'), description: desc, file });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(agents, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  // --- Logs ---

  server.tool(
    'list_logs',
    'List agent execution logs for debugging.',
    {
      limit: z.number().optional().default(20).describe('Max log files to return'),
      all_groups: z.boolean().optional().default(false).describe('(Main only) Show logs from all groups'),
    },
    async (args) => {
      try {
        const logs: Array<{ file: string; group: string; timestamp: string; size: number }> = [];
        if (args.all_groups && isMain) {
          const groupsDir = path.join(projectDir, 'groups');
          const groups = fs.readdirSync(groupsDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && !['templates', 'global'].includes(d.name));
          for (const g of groups) {
            const logsDir = path.join(groupsDir, g.name, 'logs');
            if (fs.existsSync(logsDir)) {
              logs.push(...fs.readdirSync(logsDir).filter(f => f.endsWith('.log')).map(f => {
                const stat = fs.statSync(path.join(logsDir, f));
                return { file: f, group: g.name, timestamp: stat.mtime.toISOString(), size: stat.size };
              }));
            }
          }
        } else {
          const logsDir = path.join(groupDir, 'logs');
          if (fs.existsSync(logsDir)) {
            logs.push(...fs.readdirSync(logsDir).filter(f => f.endsWith('.log')).map(f => {
              const stat = fs.statSync(path.join(logsDir, f));
              return { file: f, group: groupFolder, timestamp: stat.mtime.toISOString(), size: stat.size };
            }));
          }
        }
        if (logs.length === 0) return { content: [{ type: 'text' as const, text: 'No log files found.' }] };
        logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const limited = logs.slice(0, args.limit);
        const formatted = limited.map(l => `• ${l.file} (${l.group}) - ${(l.size / 1024).toFixed(1)}KB - ${new Date(l.timestamp).toLocaleString()}`).join('\n');
        return { content: [{ type: 'text' as const, text: `Found ${logs.length} logs (showing ${limited.length}):\n\n${formatted}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    'read_log',
    'Read a specific agent execution log file.',
    {
      filename: z.string().describe('Log filename'),
      lines: z.number().optional().describe('Lines from end'),
      group: z.string().optional().describe('(Main only) Group folder name'),
    },
    async (args) => {
      try {
        const logsDir = (args.group && isMain)
          ? path.join(projectDir, 'groups', args.group, 'logs')
          : path.join(groupDir, 'logs');
        const logPath = path.join(logsDir, args.filename);
        if (!fs.existsSync(logPath)) {
          return { content: [{ type: 'text' as const, text: `Log not found: ${args.filename}` }], isError: true };
        }
        let content = fs.readFileSync(logPath, 'utf-8');
        if (args.lines) content = content.split('\n').slice(-args.lines).join('\n');
        const stat = fs.statSync(logPath);
        return { content: [{ type: 'text' as const, text: `# Log: ${args.filename}\nSize: ${(stat.size / 1024).toFixed(1)}KB\n\n\`\`\`\n${content}\n\`\`\`` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  // --- Conversations ---

  server.tool(
    'search_conversations',
    'Search conversation history in the SQLite database.',
    {
      query: z.string().optional().describe('Search term'),
      limit: z.number().optional().describe('Max messages (default: 20, max: 50)'),
      hours_ago: z.number().optional().describe('Messages from last N hours'),
      sender: z.string().optional().describe('Filter by sender name'),
    },
    async (args) => {
      const dbPath = path.join(projectDir, 'store', 'messages.db');
      if (!fs.existsSync(dbPath)) {
        return { content: [{ type: 'text' as const, text: 'No conversation database found.' }], isError: true };
      }
      try {
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(dbPath, { readonly: true });
        const limit = Math.min(args.limit || 20, 50);
        const conditions: string[] = ['chat_jid = ?'];
        const params: any[] = [chatJid];
        if (args.query) { conditions.push('content LIKE ?'); params.push(`%${args.query}%`); }
        if (args.hours_ago) { conditions.push('timestamp > ?'); params.push(new Date(Date.now() - args.hours_ago * 3600000).toISOString()); }
        if (args.sender) { conditions.push('sender_name LIKE ?'); params.push(`%${args.sender}%`); }
        const rows = db.prepare(
          `SELECT sender_name, content, timestamp, is_bot_message FROM messages WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC LIMIT ?`
        ).all(...params, limit) as Array<{ sender_name: string; content: string; timestamp: string; is_bot_message: number }>;
        db.close();
        if (rows.length === 0) return { content: [{ type: 'text' as const, text: 'No messages found.' }] };
        rows.reverse();
        const formatted = rows.map(m => {
          const t = new Date(m.timestamp).toLocaleString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `${m.is_bot_message ? '🤖' : '👤'} [${t}] ${m.sender_name}: ${m.content}`;
        }).join('\n\n');
        return { content: [{ type: 'text' as const, text: `Found ${rows.length} message(s):\n\n${formatted}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  // --- File Downloads ---

  server.tool(
    'create_downloadable_file',
    'Create a file the user can download via the web UI. Supported: .md, .txt, .json, .csv, .html, .xml, .yaml, .yml',
    {
      filename: z.string().describe('Filename with extension'),
      content: z.string().describe('File content'),
      description: z.string().optional().describe('Brief description'),
    },
    async (args) => {
      const ext = path.extname(args.filename).toLowerCase();
      const supported = ['.md', '.txt', '.json', '.csv', '.html', '.xml', '.yaml', '.yml'];
      if (!supported.includes(ext)) {
        return { content: [{ type: 'text' as const, text: `Unsupported type: ${ext}` }], isError: true };
      }
      const safeFilename = path.basename(args.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storedFilename = `${fileId}_${safeFilename}`;
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
      fs.writeFileSync(path.join(DOWNLOADS_DIR, storedFilename), args.content, 'utf-8');
      writeIpcFile(path.join(ipcDir, 'files'), {
        type: 'file_created', fileId, filename: safeFilename, storedFilename,
        description: args.description || `File: ${safeFilename}`,
        size: Buffer.byteLength(args.content, 'utf-8'), mimeType: getMimeType(ext),
        chatJid, groupFolder, timestamp: new Date().toISOString(),
      });
      return { content: [{ type: 'text' as const, text: `File created: ${safeFilename}\nDownload: /api/files/${groupFolder}/${fileId}` }] };
    },
  );

  server.tool(
    'list_downloadable_files',
    'List downloadable files for this group.',
    { limit: z.number().optional().default(20) },
    async (args) => {
      try {
        if (!fs.existsSync(DOWNLOADS_DIR)) return { content: [{ type: 'text' as const, text: 'No files found.' }] };
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => !f.endsWith('.tmp')).map(f => {
          const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
          const match = f.match(/^(\d+-[a-z0-9]+)_(.+)$/);
          return { fileId: match?.[1] || f, filename: match?.[2] || f, size: stat.size, created: stat.mtime.toISOString() };
        }).sort((a, b) => b.created.localeCompare(a.created)).slice(0, args.limit);
        if (files.length === 0) return { content: [{ type: 'text' as const, text: 'No files found.' }] };
        const formatted = files.map(f => `• ${f.filename} (${(f.size / 1024).toFixed(1)}KB) - ${new Date(f.created).toLocaleString()}\n  /api/files/${groupFolder}/${f.fileId}`).join('\n\n');
        return { content: [{ type: 'text' as const, text: `${files.length} file(s):\n\n${formatted}` }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );
}
