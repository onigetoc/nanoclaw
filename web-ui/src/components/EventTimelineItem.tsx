import { memo } from 'react';
import {
  Circle,
  CircleDot,
  AlertCircle,
  Wrench,
  FileEdit,
  Terminal,
  MessageSquare,
  GitBranch,
  HelpCircle,
  ShieldCheck,
  Settings,
  Search,
  CheckSquare,
  Plug,
} from 'lucide-react';
import type { ActivityEvent } from '../api';

/** Format a timestamp as relative time (e.g. "2s ago", "1m ago") */
function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Category → accent color classes (border + text) */
function categoryColors(category: string, isDark: boolean) {
  switch (category) {
    case 'error':
      return isDark
        ? 'text-red-400 border-red-500/30'
        : 'text-red-600 border-red-300';
    case 'session':
      return isDark
        ? 'text-emerald-400 border-emerald-500/30'
        : 'text-emerald-600 border-emerald-300';
    case 'tool':
      return isDark
        ? 'text-blue-400 border-blue-500/30'
        : 'text-blue-600 border-blue-300';
    case 'file':
      return isDark
        ? 'text-amber-400 border-amber-500/30'
        : 'text-amber-600 border-amber-300';
    case 'command':
      return isDark
        ? 'text-purple-400 border-purple-500/30'
        : 'text-purple-600 border-purple-300';
    default:
      return isDark
        ? 'text-zinc-400 border-zinc-700'
        : 'text-zinc-600 border-zinc-300';
  }
}

/** Map event type → Lucide icon + color class */
function eventIcon(type: string, isDark: boolean): { Icon: React.ComponentType<{ className?: string }>; color: string } {
  switch (type) {
    // Session
    case 'session.created':
      return { Icon: CircleDot, color: isDark ? 'text-emerald-400' : 'text-emerald-600' };
    case 'session.idle':
      return { Icon: Circle, color: isDark ? 'text-zinc-500' : 'text-zinc-400' };
    case 'session.compacted':
      return { Icon: Settings, color: isDark ? 'text-zinc-400' : 'text-zinc-500' };
    case 'session.status':
      return { Icon: AlertCircle, color: isDark ? 'text-amber-400' : 'text-amber-500' };
    case 'session.error':
      return { Icon: AlertCircle, color: isDark ? 'text-red-400' : 'text-red-500' };

    // Tools
    case 'message.part.updated':
      return { Icon: Wrench, color: isDark ? 'text-blue-400' : 'text-blue-600' };

    // Messages
    case 'message.updated':
      return { Icon: MessageSquare, color: isDark ? 'text-sky-400' : 'text-sky-600' };

    // Files
    case 'file.edited':
      return { Icon: FileEdit, color: isDark ? 'text-amber-400' : 'text-amber-600' };
    case 'vcs.branch.updated':
      return { Icon: GitBranch, color: isDark ? 'text-amber-400' : 'text-amber-600' };

    // Commands
    case 'command.executed':
    case 'pty.created':
    case 'pty.exited':
      return { Icon: Terminal, color: isDark ? 'text-purple-400' : 'text-purple-600' };

    // Questions & permissions
    case 'question.asked':
      return { Icon: HelpCircle, color: isDark ? 'text-cyan-400' : 'text-cyan-600' };
    case 'question.replied':
    case 'question.rejected':
      return { Icon: HelpCircle, color: isDark ? 'text-cyan-300' : 'text-cyan-500' };
    case 'permission.asked':
    case 'permission.replied':
      return { Icon: ShieldCheck, color: isDark ? 'text-teal-400' : 'text-teal-600' };

    // MCP & LSP
    case 'mcp.tools.changed':
      return { Icon: Plug, color: isDark ? 'text-indigo-400' : 'text-indigo-600' };
    case 'lsp.client.diagnostics':
      return { Icon: Search, color: isDark ? 'text-zinc-400' : 'text-zinc-500' };

    // Todo
    case 'todo.updated':
      return { Icon: CheckSquare, color: isDark ? 'text-teal-400' : 'text-teal-600' };

    default:
      return { Icon: Circle, color: isDark ? 'text-zinc-500' : 'text-zinc-400' };
  }
}

interface EventTimelineItemProps {
  event: ActivityEvent;
  count?: number;
  isDark: boolean;
}

function EventTimelineItem({ event, count = 1, isDark }: EventTimelineItemProps) {
  const colors = categoryColors(event.category, isDark);
  const { Icon, color } = eventIcon(event.type, isDark);
  const truncatedLabel =
    event.label && event.label.length > 80
      ? event.label.slice(0, 77) + '…'
      : event.label || event.type;

  return (
    <div
      className={`flex items-center gap-2 border-l-2 px-2 py-1 text-xs ${colors} ${
        isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'
      }`}
    >
      <span className={`w-5 shrink-0 flex items-center justify-center ${color}`} title={event.type}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${
          event.category === 'error'
            ? 'font-medium'
            : isDark
              ? 'text-zinc-300'
              : 'text-zinc-700'
        }`}
        title={event.label || event.type}
      >
        {truncatedLabel}
      </span>
      {count > 1 && (
        <span
          className={`shrink-0 inline-flex items-center justify-center rounded-full px-1.5 min-w-[1.25rem] h-5 text-[10px] font-semibold leading-none ${
            isDark
              ? 'bg-zinc-700 text-zinc-300'
              : 'bg-zinc-200 text-zinc-600'
          }`}
          title={`Repeated ${count} times`}
        >
          {count}
        </span>
      )}
      <span
        className={`shrink-0 tabular-nums ${
          isDark ? 'text-zinc-500' : 'text-zinc-400'
        }`}
      >
        {relativeTime(event.ts)}
      </span>
    </div>
  );
}

export default memo(EventTimelineItem);
