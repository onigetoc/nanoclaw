/**
 * Shared types and constants for the Event Activity Panel.
 *
 * Reuses the icon/event mappings from the container EventLogger
 * so the Web UI stays consistent with the agent-runner console output.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActivityCategory =
  | 'session'
  | 'tool'
  | 'file'
  | 'command'
  | 'error'
  | 'message'
  | 'other';

export interface ActivityEvent {
  ts: number;
  type: string;
  properties: Record<string, unknown>;
  icon: string;
  label: string;
  category: ActivityCategory;
}

export interface ActivityStatsData {
  totalEvents: number;
  duration: number;
  filesEdited: string[];
  commandsRun: number;
  errors: number;
  toolsUsed: Map<string, number>;
  isActive: boolean;
}

export interface ActivityFile {
  filename: string;
  size: number;
  modified: string;
}

// ─── Icon mapping (mirrors event-logger.ts) ──────────────────────────────────

export const EVENT_ICONS: Record<string, string> = {
  // Session lifecycle
  'session.created': '🟢',
  'session.status': '⏳',
  'session.idle': '💤',
  'session.compacted': '📦',
  'session.diff': '📝',
  'session.error': '🔴',

  // Messages & streaming
  'message.updated': '💬',
  'message.removed': '🗑️',
  'message.part.updated': '✏️',
  'message.part.delta': '⚡',
  'message.part.removed': '❌',

  // Questions & permissions
  'question.asked': '❓',
  'question.replied': '✅',
  'question.rejected': '🚫',
  'permission.asked': '🔐',
  'permission.replied': '🔓',

  // Files & git
  'file.edited': '📄',
  'file.watcher.updated': '👁️',
  'vcs.branch.updated': '🌿',

  // Terminal & commands
  'pty.created': '🖥️',
  'pty.updated': '🖥️',
  'pty.exited': '🖥️',
  'pty.deleted': '🖥️',
  'command.executed': '⚙️',

  // Tools & protocols
  'mcp.tools.changed': '🛠️',
  'mcp.browser.open.failed': '🌐',
  'lsp.client.diagnostics': '🔍',
  'lsp.updated': '🔍',

  // Workspace & worktree
  'workspace.ready': '📂',
  'workspace.failed': '📂',
  'worktree.ready': '🌳',
  'worktree.failed': '🌳',

  // UI
  'tui.prompt.append': '📝',
  'tui.command.execute': '⌨️',
  'tui.toast.show': '🔔',
  'tui.session.select': '🔀',
  'todo.updated': '☑️',

  // Maintenance
  'installation.updated': '📦',
  'installation.update-available': '📦',
  'server.connected': '🔌',
  'server.instance.disposed': '🔌',
  'global.disposed': '🔌',
  'project.updated': '📁',
};

// ─── Allowed events (transmitted to client) ──────────────────────────────────

export const ALLOWED_EVENT_TYPES = new Set([
  'session.created',
  'session.idle',
  'session.error',
  'session.compacted',
  'session.status',         // retry/fallback/quota errors — critical for debugging
  'message.part.updated',   // tool-invocation only (filtered at runtime)
  'message.updated',        // assistant only (filtered at runtime)
  'file.edited',
  'vcs.branch.updated',
  'command.executed',
  'pty.created',
  'pty.exited',
  'question.asked',
  'question.replied',
  'question.rejected',
  'permission.asked',
  'permission.replied',
  'mcp.tools.changed',
  'lsp.client.diagnostics',
  'todo.updated',
]);

// ─── Filtered events (noisy, never transmitted) ──────────────────────────────

export const FILTERED_EVENT_TYPES = new Set([
  'message.part.delta',
  'file.watcher.updated',
  'pty.updated',
  'tui.prompt.append',
  'tui.command.execute',
  'tui.toast.show',
  'tui.session.select',
  'installation.updated',
  'installation.update-available',
  'server.connected',
  'server.instance.disposed',
  'global.disposed',
  'project.updated',
  'lsp.updated',
  'session.diff',
  'session.updated',
  'workspace.ready',
  'workspace.failed',
  'worktree.ready',
  'worktree.failed',
  'message.removed',
  'message.part.removed',
  'pty.deleted',
  'mcp.browser.open.failed',
  'server.heartbeat',
]);

// ─── Category mapping ────────────────────────────────────────────────────────

export const EVENT_CATEGORY_MAP: Record<string, ActivityCategory> = {
  'session.created': 'session',
  'session.idle': 'session',
  'session.compacted': 'session',
  'session.status': 'session',
  'session.error': 'error',
  'message.part.updated': 'tool',
  'message.updated': 'message',
  'file.edited': 'file',
  'vcs.branch.updated': 'file',
  'command.executed': 'command',
  'pty.created': 'command',
  'pty.exited': 'command',
  'question.asked': 'message',
  'question.replied': 'message',
  'question.rejected': 'message',
  'permission.asked': 'message',
  'permission.replied': 'message',
  'mcp.tools.changed': 'other',
  'lsp.client.diagnostics': 'other',
  'todo.updated': 'other',
};
