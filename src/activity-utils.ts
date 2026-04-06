/**
 * Utility functions for parsing, normalizing, and enriching Activity Events.
 *
 * Used by both the REST API (historical JSONL) and the SSE proxy (real-time).
 */

import type { ActivityEvent, ActivityCategory, ActivityStatsData } from './activity-types.js';
import {
  EVENT_ICONS,
  EVENT_CATEGORY_MAP,
  ALLOWED_EVENT_TYPES,
} from './activity-types.js';

// ─── JSONL Parsing ───────────────────────────────────────────────────────────

/** Parse a single JSONL line. Returns null if malformed. */
export function parseJsonlLine(line: string): ActivityEvent | null {
  try {
    const raw = JSON.parse(line);
    if (typeof raw?.ts !== 'number' || typeof raw?.type !== 'string') return null;
    return normalizeEvent(raw);
  } catch {
    return null;
  }
}

/** Parse a full JSONL string (multiple lines). Skips malformed lines. */
export function parseJsonlContent(content: string): ActivityEvent[] {
  return content
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map(parseJsonlLine)
    .filter((e): e is ActivityEvent => e !== null);
}

// ─── Normalization ───────────────────────────────────────────────────────────

/** Enrich a raw event with icon, label, and category. */
export function normalizeEvent(raw: {
  ts: number;
  type: string;
  properties: Record<string, unknown>;
}): ActivityEvent {
  const { ts, type, properties = {} } = raw;
  const icon = EVENT_ICONS[type] ?? '📌';
  const category: ActivityCategory = EVENT_CATEGORY_MAP[type] ?? 'other';
  const label = buildEventLabel(type, properties);
  return { ts, type, properties, icon, label, category };
}

// ─── Tool info extraction ────────────────────────────────────────────────────

/** Extract tool invocation details from message.part.updated properties. */
export function extractToolInfo(
  properties: Record<string, unknown>,
): { toolName: string; state: string; args: Record<string, unknown> } | null {
  const part = properties?.part as Record<string, unknown> | undefined;
  if (!part) return null;

  // OpenCode uses part.type === "tool" with part.tool and part.state.status
  if (part.type === 'tool') {
    const toolName = part.tool as string | undefined;
    if (!toolName) return null;
    const stateObj = part.state as Record<string, unknown> | undefined;
    const status = (stateObj?.status as string) ?? 'unknown';
    // Args are in state.input — only populated at 'running' status
    const input = (stateObj?.input as Record<string, unknown>) ?? {};
    return { toolName, state: status, args: input };
  }

  // Legacy: part.type === "tool-invocation" with part.toolInvocation
  const invocation = part?.toolInvocation as Record<string, unknown> | undefined;

  const toolName =
    (invocation?.toolName as string) ?? (part?.toolName as string) ?? null;
  const state =
    (invocation?.state as string) ?? (part?.state as string) ?? null;

  if (!toolName) return null;

  const args =
    (invocation?.args as Record<string, unknown>) ??
    (part?.args as Record<string, unknown>) ??
    {};

  return { toolName, state: state ?? 'unknown', args };
}

/** Remove MCP prefixes for cleaner display. */
export function cleanMcpToolName(name: string): string {
  if (name.startsWith('mcp__eureclaw__')) return name.slice('mcp__eureclaw__'.length);
  if (name.startsWith('mcp__')) return name.slice('mcp__'.length);
  return name;
}

// ─── Label building ──────────────────────────────────────────────────────────

/** Build a human-readable label for an event. */
export function buildEventLabel(
  type: string,
  properties: Record<string, unknown>,
): string {
  switch (type) {
    case 'message.part.updated': {
      const info = extractToolInfo(properties);
      if (!info) return type;
      const clean = cleanMcpToolName(info.toolName);
      // Only show details for running/completed (pending has no args)
      if (info.state === 'pending') return `${clean} ⏳`;
      const stateLabel = info.state === 'completed' ? ' ✓' : info.state === 'running' ? '' : '';
      const arg = pickRelevantArg(clean, info.args);
      return arg ? `${clean}: ${arg}${stateLabel}` : `${clean}${stateLabel}`;
    }

    case 'session.created': {
      const info = properties?.info as Record<string, unknown> | undefined;
      const title = info?.title as string | undefined;
      const parentID = info?.parentID as string | undefined;
      const agent = info?.agent ?? info?.mode ?? '';
      const model =
        (info?.model as Record<string, unknown>)?.modelID ?? '';
      // Sub-agent sessions have a parentID and descriptive title
      if (parentID && title) return `🤖 Sub-agent: ${title}`;
      if (agent && model) return `Session started — ${agent} (${model})`;
      if (agent) return `Session started — ${agent}`;
      return 'Session started';
    }

    case 'session.status': {
      const status = properties?.status as Record<string, unknown> | undefined;
      if (!status) return 'Session status update';
      const statusType = status.type as string;
      if (statusType === 'retry') {
        const attempt = status.attempt as number | undefined;
        const message = status.message as string | undefined;
        // Extract the key info from retry messages (quota, rate limit, etc.)
        const shortMsg = message
          ? extractRetryReason(message)
          : 'retrying...';
        return `⏳ Retry #${attempt ?? '?'}: ${shortMsg}`;
      }
      if (statusType === 'busy') return '⏳ Processing...';
      if (statusType === 'idle') return 'Session idle';
      if (statusType === 'error') {
        const msg = status.message as string | undefined;
        return `Error: ${msg ?? 'unknown'}`;
      }
      return `Status: ${statusType}`;
    }

    case 'session.idle':
      return 'Session idle';

    case 'session.error': {
      const msg =
        (properties?.error as string) ??
        (properties?.message as string) ??
        'unknown error';
      return `Error: ${msg}`;
    }

    case 'file.edited': {
      const filePath =
        (properties?.file as string) ?? (properties?.path as string) ?? '?';
      return `File edited: ${filePath}`;
    }

    case 'command.executed': {
      const cmd = (properties?.command as string) ?? '?';
      return cmd.length > 120
        ? `Command: ${cmd.slice(0, 120)}...`
        : `Command: ${cmd}`;
    }

    default:
      return type;
  }
}

/** Extract a short reason from retry error messages. */
function extractRetryReason(message: string): string {
  // Quota exceeded
  if (message.includes('quota')) {
    const modelMatch = message.match(/model:\s*(\S+)/);
    const retryMatch = message.match(/retry in\s*([\d.]+s)/i);
    const model = modelMatch ? modelMatch[1] : '';
    const retryIn = retryMatch ? ` (${retryMatch[1]})` : '';
    return `Quota exceeded${model ? ` — ${model}` : ''}${retryIn}`;
  }
  // Rate limit
  if (message.includes('rate') && message.includes('limit')) {
    return 'Rate limited';
  }
  // Generic — take first line, truncate
  const firstLine = message.split('\n')[0];
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}

/** Pick the most relevant argument for a tool label. */
function pickRelevantArg(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const path =
    (args?.filePath as string) ?? (args?.path as string) ?? null;
  const cmd =
    (args?.command as string) ?? (args?.cmd as string) ?? null;

  switch (toolName) {
    case 'read':
    case 'file_read':
    case 'write':
    case 'file_write':
    case 'edit':
    case 'file_edit':
    case 'list':
      return path ?? '';
    case 'bash':
    case 'shell': {
      if (!cmd) return '';
      return cmd.length > 120 ? `${cmd.slice(0, 120)}...` : cmd;
    }
    case 'glob':
    case 'grep':
      return (args?.pattern as string) ?? '';
    case 'webfetch':
      return (args?.url as string) ?? '';
    case 'websearch':
    case 'brave_search':
    case 'remote_web_search':
      return (args?.query as string) ?? (args?.q as string) ?? '';
    case 'task': {
      // Sub-agent delegation — show agent type + description
      const subagent = (args?.subagent_type as string) ?? (args?.agent as string) ?? '';
      const desc = (args?.description as string) ?? '';
      if (subagent && desc) {
        const shortDesc = desc.length > 80 ? desc.slice(0, 77) + '...' : desc;
        return `@${subagent} — ${shortDesc}`;
      }
      if (subagent) return `@${subagent}`;
      if (desc) return desc.length > 100 ? desc.slice(0, 97) + '...' : desc;
      return '';
    }
    case 'skill': {
      // Skill invocation — show skill name
      const skillName = (args?.name as string) ?? (args?.skill as string) ?? '';
      return skillName;
    }
    case 'todowrite':
    case 'todoread':
      return (args?.content as string) ?? '';
    default:
      return '';
  }
}

// ─── Filtering ───────────────────────────────────────────────────────────────

/** Check if an event type should be transmitted to the client. */
export function isAllowedEvent(type: string): boolean {
  return ALLOWED_EVENT_TYPES.has(type);
}

// ─── Stats computation ───────────────────────────────────────────────────────

/** Compute aggregate stats from a list of events. */
export function computeStats(events: ActivityEvent[]): ActivityStatsData {
  const toolsUsed = new Map<string, number>();
  const filesEdited: string[] = [];
  let commandsRun = 0;
  let errors = 0;
  let isActive = false;

  for (const ev of events) {
    if (ev.type === 'session.created') isActive = true;
    if (ev.type === 'session.idle') isActive = false;
    if (ev.type === 'session.error') errors++;

    if (ev.type === 'file.edited') {
      const p =
        (ev.properties?.file as string) ?? (ev.properties?.path as string);
      if (p && !filesEdited.includes(p)) filesEdited.push(p);
    }

    if (ev.type === 'command.executed') commandsRun++;

    if (ev.type === 'message.part.updated') {
      const info = extractToolInfo(ev.properties);
      if (info && (info.state === 'call' || info.state === 'pending' || info.state === 'running')) {
        const clean = cleanMcpToolName(info.toolName);
        // Only count once per tool call (use pending, or running if pending was missed)
        if (info.state === 'pending' || info.state === 'call') {
          toolsUsed.set(clean, (toolsUsed.get(clean) ?? 0) + 1);
        } else if (info.state === 'running' && !toolsUsed.has(clean)) {
          toolsUsed.set(clean, 1);
        }
      }
    }
  }

  const duration =
    events.length >= 2
      ? (events[events.length - 1].ts - events[0].ts) / 1000
      : 0;

  return {
    totalEvents: events.length,
    duration,
    filesEdited,
    commandsRun,
    errors,
    toolsUsed,
    isActive,
  };
}
