/**
 * OpenCode Event Logger
 * 
 * Subscribes to OpenCode SSE events and logs agent activity in real-time.
 * Gives visibility into what the agent is doing: reading files, running commands,
 * writing code, streaming responses, etc.
 * 
 * Events are logged to stderr (so they don't interfere with the stdout output protocol)
 * and optionally written to a JSONL file for the Web UI to consume.
 */

import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EventLoggerOptions {
  /** OpenCode SDK client instance */
  client: any;
  /** Session ID to filter events for (optional — logs all if omitted) */
  sessionId?: string;
  /** Directory to write events JSONL file (optional) */
  eventsDir?: string;
  /** Workspace name for log prefix */
  workspace?: string;
  /** Enable verbose logging (all events, not just important ones) */
  verbose?: boolean;
}

interface EventStats {
  totalEvents: number;
  byType: Record<string, number>;
  startTime: number;
  toolsUsed: string[];
  filesEdited: string[];
  commandsRun: number;
  errors: number;
}

// ─── Emoji map for console readability ───────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  // Session lifecycle
  'session.created': '🟢',
  'session.status': '📊',
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

// Events we always log (important for understanding agent behavior)
const IMPORTANT_EVENTS = new Set([
  'session.created',
  'session.idle',
  'session.error',
  'session.compacted',
  'session.diff',
  'message.updated',
  'message.part.updated',
  'file.edited',
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
  'workspace.ready',
  'workspace.failed',
  'worktree.ready',
  'worktree.failed',
  'vcs.branch.updated',
  'todo.updated',
]);

// Events we skip in non-verbose mode (too noisy)
const NOISY_EVENTS = new Set([
  'message.part.delta',      // Streaming deltas — too many
  'pty.updated',             // Terminal output chunks
  'file.watcher.updated',   // File system noise
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
  'session.status',
]);

// ─── Logger class ────────────────────────────────────────────────────────────

export class EventLogger {
  private abortController: AbortController;
  private stats: EventStats;
  private options: EventLoggerOptions;
  private eventsFile: string | null = null;
  private running = false;
  private streamPromise: Promise<void> | null = null;
  private deltaBuffer = '';
  private deltaTimer: ReturnType<typeof setTimeout> | null = null;
  // Console repeat grouping (like browser console)
  private lastLogMessage = '';
  private lastLogRepeat = 0;

  constructor(options: EventLoggerOptions) {
    this.options = options;
    this.abortController = new AbortController();
    this.stats = {
      totalEvents: 0,
      byType: {},
      startTime: Date.now(),
      toolsUsed: [],
      filesEdited: [],
      commandsRun: 0,
      errors: 0,
    };

    // Set up JSONL file for Web UI consumption
    if (options.eventsDir) {
      fs.mkdirSync(options.eventsDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      this.eventsFile = path.join(options.eventsDir, `events-${ts}.jsonl`);
    }
  }

  /** Start listening to events in the background */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.log('📡 Event logger started — listening for agent activity...');

    this.streamPromise = this.listenLoop();
  }

  /** Stop listening and print summary */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.abortController.abort();
    this.flushDeltaBuffer();
    this.lastLogMessage = '';
    this.lastLogRepeat = 0;

    // Wait for stream to finish
    if (this.streamPromise) {
      try { await this.streamPromise; } catch { /* expected abort */ }
    }

    this.printSummary();
  }

  /** Update the session ID filter (e.g., after session creation) */
  setSessionId(id: string): void {
    this.options.sessionId = id;
  }

  /** Get current stats */
  getStats(): EventStats {
    return { ...this.stats };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async listenLoop(): Promise<void> {
    try {
      const events = await this.options.client.event.subscribe({
        signal: this.abortController.signal,
      });

      const stream = events.stream || events;

      for await (const rawEvent of stream) {
        if (!this.running) break;

        const event = (rawEvent as any)?.payload || rawEvent;
        const type: string = event?.type || 'unknown';
        const props = event?.properties || {};

        // Filter by session if configured
        if (this.options.sessionId) {
          const eSid = props?.sessionID
            || props?.info?.sessionID
            || props?.part?.sessionID;
          if (eSid && eSid !== this.options.sessionId) continue;
        }

        // Track stats
        this.stats.totalEvents++;
        this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;

        // Process the event
        this.processEvent(type, props);

        // Write to JSONL for Web UI
        this.writeToFile(type, props);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
        // Expected — we called stop()
        return;
      }
      this.log(`⚠️ Event stream error: ${err?.message || String(err)}`);
    }
  }

  private processEvent(type: string, props: any): void {
    switch (type) {
      // ─── Session lifecycle ─────────────────────────────────────────
      case 'session.created':
        this.log(`🟢 Session created: ${props?.info?.id || props?.id || '?'}`);
        break;

      case 'session.idle':
        this.log(`💤 Agent idle — finished processing`);
        break;

      case 'session.error':
        this.stats.errors++;
        this.log(`🔴 Session error: ${props?.error || JSON.stringify(props).slice(0, 200)}`);
        break;

      case 'session.compacted':
        this.log(`📦 Session compacted (context trimmed)`);
        break;

      case 'session.diff':
        this.log(`📝 Session diff generated`);
        break;

      // ─── Messages ──────────────────────────────────────────────────
      case 'message.updated': {
        const role = props?.info?.role || props?.role || '?';
        const agent = props?.info?.agent || props?.info?.mode || '';
        const agentStr = agent ? ` [${agent}]` : '';
        if (role === 'assistant') {
          this.log(`💬 Assistant response updated${agentStr}`);
        }
        break;
      }

      case 'message.part.updated': {
        const partType = props?.part?.type || '?';
        if (partType === 'tool-invocation') {
          const toolName = props?.part?.toolInvocation?.toolName
            || props?.part?.toolName || '?';
          const state = props?.part?.toolInvocation?.state
            || props?.part?.state || '?';
          this.handleToolEvent(toolName, state, props);
        } else if (partType === 'tool') {
          // OpenCode actual format: part.type === "tool", part.tool, part.state.status
          const toolName = props?.part?.tool || '?';
          const state = props?.part?.state?.status || '?';
          this.handleToolEvent(toolName, state, props);
        } else if (partType === 'text') {
          // Final text part update (not delta)
          // Don't log — message.updated covers this
        }
        break;
      }

      case 'message.part.delta':
        // Buffer deltas and flush periodically to avoid spam
        this.bufferDelta(props);
        break;

      case 'message.removed':
        this.log(`🗑️ Message removed`);
        break;

      case 'message.part.removed':
        // Usually not important
        break;

      // ─── Questions & Permissions ───────────────────────────────────
      case 'question.asked':
        this.log(`❓ Agent asked a question: ${props?.question || JSON.stringify(props).slice(0, 150)}`);
        break;

      case 'question.replied':
        this.log(`✅ Question answered`);
        break;

      case 'question.rejected':
        this.log(`🚫 Question rejected`);
        break;

      case 'permission.asked':
        this.log(`🔐 Permission requested: ${props?.permission || props?.tool || JSON.stringify(props).slice(0, 150)}`);
        break;

      case 'permission.replied':
        this.log(`🔓 Permission granted`);
        break;

      // ─── Files & Git ───────────────────────────────────────────────
      case 'file.edited': {
        const filePath = props?.file || props?.path || '?';
        if (!this.stats.filesEdited.includes(filePath)) {
          this.stats.filesEdited.push(filePath);
        }
        this.log(`📄 File edited: ${filePath}`);
        break;
      }

      case 'vcs.branch.updated':
        this.log(`🌿 Git branch updated: ${props?.branch || '?'}`);
        break;

      // ─── Terminal & Commands ───────────────────────────────────────
      case 'pty.created':
        this.log(`🖥️ Terminal opened`);
        break;

      case 'pty.exited': {
        const exitCode = props?.exitCode ?? props?.code ?? '?';
        this.log(`🖥️ Terminal exited (code: ${exitCode})`);
        break;
      }

      case 'command.executed': {
        this.stats.commandsRun++;
        const cmd = props?.command || '?';
        this.log(`⚙️ Command: ${cmd.slice(0, 120)}${cmd.length > 120 ? '...' : ''}`);
        break;
      }

      // ─── Tools & Protocols ─────────────────────────────────────────
      case 'mcp.tools.changed':
        this.log(`🔧 MCP tools changed`);
        break;

      case 'mcp.browser.open.failed':
        this.log(`🌐 Browser open failed`);
        break;

      case 'lsp.client.diagnostics': {
        const count = props?.diagnostics?.length || 0;
        if (count > 0) {
          this.log(`🔍 LSP diagnostics: ${count} issue(s)`);
        }
        break;
      }

      // ─── Workspace & Worktree ──────────────────────────────────────
      case 'workspace.ready':
        this.log(`📂 Workspace ready`);
        break;

      case 'workspace.failed':
        this.stats.errors++;
        this.log(`📂 Workspace failed: ${props?.error || '?'}`);
        break;

      case 'worktree.ready':
        this.log(`🌳 Worktree ready`);
        break;

      case 'worktree.failed':
        this.stats.errors++;
        this.log(`🌳 Worktree failed: ${props?.error || '?'}`);
        break;

      case 'todo.updated':
        this.log(`☑️ Todo updated`);
        break;

      // ─── Noisy / maintenance — only in verbose ─────────────────────
      default:
        if (this.options.verbose || !NOISY_EVENTS.has(type)) {
          const icon = EVENT_ICONS[type] || '📌';
          this.log(`${icon} ${type}`);
        }
        break;
    }
  }

  private handleToolEvent(toolName: string, state: string, props: any): void {
    // OpenCode sends: pending (no args) → running (with args) → completed (with output)
    // We log on 'running' because that's when args are available.
    // We also track on 'pending' for stats, but skip the detailed log.
    if (state === 'pending' || state === 'call' || state === 'partial-call') {
      // Track tool usage for stats
      if (!this.stats.toolsUsed.includes(toolName)) {
        this.stats.toolsUsed.push(toolName);
      }
      // Don't log details yet — args are empty at 'pending'. Wait for 'running'.
      return;
    }

    if (state === 'running') {
      // Args are now available — log the detailed tool invocation
      const args = props?.part?.state?.input
        || props?.part?.toolInvocation?.args
        || props?.part?.args || {};

      // Also track if we missed the pending event
      if (!this.stats.toolsUsed.includes(toolName)) {
        this.stats.toolsUsed.push(toolName);
      }

      switch (toolName) {
        case 'read':
        case 'file_read':
          this.log(`📖 Reading: ${args?.filePath || args?.path || '?'}`);
          break;
        case 'write':
        case 'file_write':
          this.log(`✍️ Writing: ${args?.filePath || args?.path || '?'}`);
          break;
        case 'edit':
        case 'file_edit':
          this.log(`✏️ Editing: ${args?.filePath || args?.path || '?'}`);
          break;
        case 'bash':
        case 'shell': {
          const cmd = args?.command || args?.cmd || '?';
          this.log(`🖥️ Running: ${cmd.slice(0, 100)}${cmd.length > 100 ? '...' : ''}`);
          break;
        }
        case 'glob':
          this.log(`🔎 Glob: ${args?.pattern || '?'}`);
          break;
        case 'grep':
          this.log(`🔎 Grep: ${args?.pattern || '?'}`);
          break;
        case 'list':
          this.log(`📂 Listing: ${args?.path || '?'}`);
          break;
        case 'webfetch':
          this.log(`🌐 Fetching: ${args?.url || '?'}`);
          break;
        case 'websearch':
        case 'brave_search':
        case 'remote_web_search':
          this.log(`🔍 Web search: ${args?.query || args?.q || '?'}`);
          break;
        case 'task': {
          const agentName = args?.subagent_type || args?.agent || '?';
          const desc = args?.description || '';
          const label = desc ? `${agentName} — ${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}` : agentName;
          this.log(`🤖 Delegating to agent: ${label}`);
          break;
        }
        case 'skill': {
          const skillName = args?.name || args?.skill || '?';
          this.log(`🧩 Skill: ${skillName}`);
          break;
        }
        case 'todowrite':
          this.log(`☑️ Updating todo list`);
          break;
        case 'todoread':
          this.log(`☑️ Reading todo list`);
          break;
        default:
          // MCP tools (eureclaw tools, etc.)
          if (toolName.startsWith('mcp__')) {
            const cleanName = toolName.replace('mcp__eureclaw__', '').replace('mcp__', '');
            this.log(`🔧 MCP tool: ${cleanName}`);
          } else {
            this.log(`🔧 Tool: ${toolName}`);
          }
          break;
      }
    } else if (state === 'result' || state === 'completed') {
      // Tool completed — only log errors
      const result = props?.part?.state?.output
        || props?.part?.toolInvocation?.result
        || props?.part?.result;
      if (result && typeof result === 'string' && result.toLowerCase().includes('error')) {
        this.log(`⚠️ Tool ${toolName} returned error`);
      }
    }
  }

  /** Buffer streaming deltas to avoid flooding the console */
  private bufferDelta(props: any): void {
    const delta = props?.delta || props?.part?.delta || '';
    if (!delta) return;
    this.deltaBuffer += delta;

    // Flush every 500ms
    if (!this.deltaTimer) {
      this.deltaTimer = setTimeout(() => this.flushDeltaBuffer(), 500);
    }
  }

  private flushDeltaBuffer(): void {
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer);
      this.deltaTimer = null;
    }
    if (this.deltaBuffer.length > 0) {
      // Just show that streaming is happening, not the actual content
      // (content goes through the normal output protocol)
      const chars = this.deltaBuffer.length;
      this.deltaBuffer = '';
      if (this.options.verbose) {
        this.log(`⚡ Streaming... (+${chars} chars)`);
      }
    }
  }

  private writeToFile(type: string, props: any): void {
    if (!this.eventsFile) return;
    try {
      const entry = {
        ts: Date.now(),
        type,
        properties: props,
      };
      fs.appendFileSync(this.eventsFile, JSON.stringify(entry) + '\n');
    } catch {
      // Non-critical — don't crash on file write errors
    }
  }

  private log(message: string): void {
    const prefix = this.options.workspace
      ? `[${this.options.workspace}]`
      : '[event]';

    // Group consecutive identical messages (like browser console)
    if (message === this.lastLogMessage) {
      this.lastLogRepeat++;
      // Overwrite the current line with updated count
      process.stderr.write(`\r${prefix} ${message} (${this.lastLogRepeat + 1})\n`);
      return;
    }

    // New message — reset tracking
    this.lastLogMessage = message;
    this.lastLogRepeat = 0;
    process.stderr.write(`${prefix} ${message}\n`);
  }

  private printSummary(): void {
    const duration = Math.round((Date.now() - this.stats.startTime) / 1000);
    const { totalEvents, toolsUsed, filesEdited, commandsRun, errors } = this.stats;

    this.log(`\n📊 ─── Agent Activity Summary ───`);
    this.log(`   Duration: ${duration}s | Events: ${totalEvents}`);

    if (toolsUsed.length > 0) {
      this.log(`   Tools used: ${toolsUsed.join(', ')}`);
    }
    if (filesEdited.length > 0) {
      this.log(`   Files edited: ${filesEdited.length} (${filesEdited.slice(0, 5).join(', ')}${filesEdited.length > 5 ? '...' : ''})`);
    }
    if (commandsRun > 0) {
      this.log(`   Commands run: ${commandsRun}`);
    }
    if (errors > 0) {
      this.log(`   ⚠️ Errors: ${errors}`);
    }
    this.log(`───────────────────────────────\n`);

    // Write summary to JSONL file too
    if (this.eventsFile) {
      const summary = {
        ts: Date.now(),
        type: '_summary',
        properties: {
          duration,
          totalEvents,
          toolsUsed,
          filesEdited,
          commandsRun,
          errors,
          byType: this.stats.byType,
        },
      };
      try {
        fs.appendFileSync(this.eventsFile, JSON.stringify(summary) + '\n');
      } catch { /* ignore */ }
    }
  }
}
