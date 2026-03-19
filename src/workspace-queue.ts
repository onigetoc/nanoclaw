import { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

import { DATA_DIR, MAX_CONCURRENT_CONTAINERS } from './config.js';
import { logger } from './logger.js';

interface QueuedTask {
  id: string;
  workspaceJid: string;
  fn: () => Promise<void>;
}

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5000;

interface WorkspaceState {
  active: boolean;
  activeStartedAt: number | null;
  pendingMessages: boolean;
  pendingTasks: QueuedTask[];
  process: ChildProcess | null;
  containerName: string | null;
  workspaceFolder: string | null;
  retryCount: number;
  messagePreferences?: {
    model?: string;
    agent?: string;
  };
}

// Max time a workspace can stay active before the watchdog resets it (5 minutes)
const WATCHDOG_TIMEOUT_MS = 5 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 30 * 1000;

export class WorkspaceQueue {
  private workspaces = new Map<string, WorkspaceState>();
  private activeCount = 0;
  private waitingWorkspaces: string[] = [];
  private processMessagesFn: ((workspaceJid: string) => Promise<boolean>) | null =
    null;
  private shuttingDown = false;
  private statusCallback: ((chatJid: string, status: 'queued' | 'processing' | 'done', detail?: string) => void) | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start watchdog to auto-reset stuck workspaces
    this.watchdogTimer = setInterval(() => this.watchdog(), WATCHDOG_INTERVAL_MS);
  }

  private watchdog(): void {
    if (this.shuttingDown) return;
    const now = Date.now();
    for (const [jid, state] of this.workspaces) {
      if (state.active && state.activeStartedAt && (now - state.activeStartedAt) > WATCHDOG_TIMEOUT_MS) {
        logger.warn(
          { workspaceJid: jid, activeForMs: now - state.activeStartedAt },
          'Watchdog: workspace stuck in active state, force-resetting',
        );
        this.resetWorkspace(jid);
      }
    }
  }

  setStatusCallback(fn: (chatJid: string, status: 'queued' | 'processing' | 'done', detail?: string) => void): void {
    this.statusCallback = fn;
  }

  /**
   * Get the status of all workspaces for monitoring/UI display.
   */
  getWorkspaceStatuses(): Array<{ jid: string; status: 'active' | 'queued' | 'idle'; workspaceFolder: string | null }> {
    const result: Array<{ jid: string; status: 'active' | 'queued' | 'idle'; workspaceFolder: string | null }> = [];
    for (const [jid, state] of this.workspaces) {
      let status: 'active' | 'queued' | 'idle' = 'idle';
      if (state.active) {
        status = 'active';
      } else if (state.pendingMessages || state.pendingTasks.length > 0 || this.waitingWorkspaces.includes(jid)) {
        status = 'queued';
      }
      result.push({ jid, status, workspaceFolder: state.workspaceFolder });
    }
    return result;
  }

  private getWorkspace(workspaceJid: string): WorkspaceState {
    let state = this.workspaces.get(workspaceJid);
    if (!state) {
      state = {
        active: false,
        activeStartedAt: null,
        pendingMessages: false,
        pendingTasks: [],
        process: null,
        containerName: null,
        workspaceFolder: null,
        retryCount: 0,
      };
      this.workspaces.set(workspaceJid, state);
    }
    return state;
  }

  setProcessMessagesFn(fn: (workspaceJid: string) => Promise<boolean>): void {
    this.processMessagesFn = fn;
  }

  setMessagePreferences(workspaceJid: string, preferences: { model?: string; agent?: string }): void {
    const state = this.getWorkspace(workspaceJid);
    state.messagePreferences = preferences;
  }

  getMessagePreferences(workspaceJid: string): { model?: string; agent?: string } | undefined {
    const state = this.workspaces.get(workspaceJid);
    return state?.messagePreferences;
  }

  clearMessagePreferences(workspaceJid: string): void {
    const state = this.workspaces.get(workspaceJid);
    if (state) {
      state.messagePreferences = undefined;
    }
  }

  enqueueMessageCheck(workspaceJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getWorkspace(workspaceJid);

    if (state.active) {
      state.pendingMessages = true;
      logger.debug({ workspaceJid }, 'Container active, message queued');
      this.statusCallback?.(workspaceJid, 'queued', 'Agent is busy, message queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingMessages = true;
      if (!this.waitingWorkspaces.includes(workspaceJid)) {
        this.waitingWorkspaces.push(workspaceJid);
      }
      logger.debug(
        { workspaceJid, activeCount: this.activeCount },
        'At concurrency limit, message queued',
      );
      this.statusCallback?.(workspaceJid, 'queued', `Waiting for available slot (${this.activeCount}/${MAX_CONCURRENT_CONTAINERS} active)`);
      return;
    }

    this.runForWorkspace(workspaceJid, 'messages');
  }

  enqueueTask(workspaceJid: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getWorkspace(workspaceJid);

    // Prevent double-queuing of the same task
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      logger.debug({ workspaceJid, taskId }, 'Task already queued, skipping');
      return;
    }

    if (state.active) {
      state.pendingTasks.push({ id: taskId, workspaceJid, fn });
      logger.debug({ workspaceJid, taskId }, 'Container active, task queued');
      this.statusCallback?.(workspaceJid, 'queued', 'Agent is busy, task queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, workspaceJid, fn });
      if (!this.waitingWorkspaces.includes(workspaceJid)) {
        this.waitingWorkspaces.push(workspaceJid);
      }
      logger.debug(
        { workspaceJid, taskId, activeCount: this.activeCount },
        'At concurrency limit, task queued',
      );
      this.statusCallback?.(workspaceJid, 'queued', `Task queued, waiting for slot (${this.activeCount}/${MAX_CONCURRENT_CONTAINERS} active)`);
      return;
    }

    // Run immediately
    this.runTask(workspaceJid, { id: taskId, workspaceJid, fn });
  }

  registerProcess(workspaceJid: string, proc: ChildProcess, containerName: string, workspaceFolder?: string): void {
    const state = this.getWorkspace(workspaceJid);
    state.process = proc;
    state.containerName = containerName;
    if (workspaceFolder) state.workspaceFolder = workspaceFolder;
  }

  /**
   * Send a follow-up message to the active container via IPC file.
   * Returns true if the message was written, false if no active container.
   */
  sendMessage(workspaceJid: string, text: string): boolean {
    const state = this.getWorkspace(workspaceJid);
    if (!state.active || !state.workspaceFolder) return false;

    const inputDir = path.join(DATA_DIR, 'ipc', state.workspaceFolder, 'input');
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
      const filepath = path.join(inputDir, filename);
      const tempPath = `${filepath}.tmp`;
      // Include model/agent preferences so the agent-runner can switch models mid-session
      const prefs = state.messagePreferences;
      const payload: Record<string, unknown> = { type: 'message', text };
      if (prefs?.model) payload.model = prefs.model;
      if (prefs?.agent) payload.agent = prefs.agent;
      fs.writeFileSync(tempPath, JSON.stringify(payload));
      fs.renameSync(tempPath, filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Signal the active container to wind down by writing a close sentinel.
   */
  closeStdin(workspaceJid: string): void {
    const state = this.getWorkspace(workspaceJid);
    if (!state.active || !state.workspaceFolder) return;

    const inputDir = path.join(DATA_DIR, 'ipc', state.workspaceFolder, 'input');
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, '_close'), '');
    } catch {
      // ignore
    }
  }

  private async runForWorkspace(
    workspaceJid: string,
    reason: 'messages' | 'drain',
  ): Promise<void> {
    const state = this.getWorkspace(workspaceJid);
    state.active = true;
    state.activeStartedAt = Date.now();
    state.pendingMessages = false;
    this.activeCount++;

    logger.debug(
      { workspaceJid, reason, activeCount: this.activeCount },
      'Starting container for workspace',
    );

    try {
      if (this.processMessagesFn) {
        const success = await this.processMessagesFn(workspaceJid);
        if (success) {
          state.retryCount = 0;
        } else {
          this.scheduleRetry(workspaceJid, state);
        }
      }
    } catch (err) {
      logger.error({ workspaceJid, err }, 'Error processing messages for workspace');
      this.scheduleRetry(workspaceJid, state);
    } finally {
      state.active = false;
      state.activeStartedAt = null;
      state.process = null;
      state.containerName = null;
      state.workspaceFolder = null;
      this.activeCount--;
      this.drainWorkspace(workspaceJid);
    }
  }

  private async runTask(workspaceJid: string, task: QueuedTask): Promise<void> {
    const state = this.getWorkspace(workspaceJid);
    state.active = true;
    state.activeStartedAt = Date.now();
    this.activeCount++;

    logger.debug(
      { workspaceJid, taskId: task.id, activeCount: this.activeCount },
      'Running queued task',
    );

    try {
      await task.fn();
    } catch (err) {
      logger.error({ workspaceJid, taskId: task.id, err }, 'Error running task');
    } finally {
      state.active = false;
      state.activeStartedAt = null;
      state.process = null;
      state.containerName = null;
      state.workspaceFolder = null;
      this.activeCount--;
      this.drainWorkspace(workspaceJid);
    }
  }

  private scheduleRetry(workspaceJid: string, state: WorkspaceState): void {
    state.retryCount++;
    if (state.retryCount > MAX_RETRIES) {
      logger.error(
        { workspaceJid, retryCount: state.retryCount },
        'Max retries exceeded, dropping messages (will retry on next incoming message)',
      );
      state.retryCount = 0;
      return;
    }

    const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
    logger.info(
      { workspaceJid, retryCount: state.retryCount, delayMs },
      'Scheduling retry with backoff',
    );
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.enqueueMessageCheck(workspaceJid);
      }
    }, delayMs);
  }

  private drainWorkspace(workspaceJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getWorkspace(workspaceJid);

    // Tasks first (they won't be re-discovered from SQLite like messages)
    if (state.pendingTasks.length > 0) {
      const task = state.pendingTasks.shift()!;
      this.runTask(workspaceJid, task);
      return;
    }

    // Then pending messages
    if (state.pendingMessages) {
      this.runForWorkspace(workspaceJid, 'drain');
      return;
    }

    // Nothing pending for this workspace; check if other workspaces are waiting for a slot
    this.drainWaiting();
  }

  private drainWaiting(): void {
    while (
      this.waitingWorkspaces.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextJid = this.waitingWorkspaces.shift()!;
      const state = this.getWorkspace(nextJid);

      // Prioritize tasks over messages
      if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextJid, task);
      } else if (state.pendingMessages) {
        this.runForWorkspace(nextJid, 'drain');
      }
      // If neither pending, skip this workspace
    }
  }

  /**
   * Force-reset a workspace that is stuck in active state.
   * Called by /new command and watchdog to unblock frozen workspaces.
   */
  resetWorkspace(workspaceJid: string): void {
    const state = this.workspaces.get(workspaceJid);
    if (!state) return;

    const wasActive = state.active;
    if (wasActive) {
      state.active = false;
      this.activeCount = Math.max(0, this.activeCount - 1);
      logger.info(
        { workspaceJid, activeCount: this.activeCount },
        'Force-reset workspace from active state',
      );
    }

    // Kill the process if still running
    if (state.process && !state.process.killed) {
      try {
        state.process.kill('SIGTERM');
      } catch {
        // ignore
      }
    }

    state.process = null;
    state.containerName = null;
    state.activeStartedAt = null;
    state.pendingMessages = false;
    state.pendingTasks = [];
    state.retryCount = 0;

    // Remove from waiting list
    const idx = this.waitingWorkspaces.indexOf(workspaceJid);
    if (idx !== -1) this.waitingWorkspaces.splice(idx, 1);

    // Broadcast done status so UI clears the green indicator
    this.statusCallback?.(workspaceJid, 'done');

    // Allow other waiting workspaces to proceed
    if (wasActive) {
      this.drainWaiting();
    }
  }

  async shutdown(_gracePeriodMs: number): Promise<void> {
    this.shuttingDown = true;

    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    // Count active containers but don't kill them — they'll finish on their own
    // via idle timeout or container timeout. The --rm flag cleans them up on exit.
    // This prevents WhatsApp reconnection restarts from killing working agents.
    const activeContainers: string[] = [];
    for (const [, state] of this.workspaces) {
      if (state.process && !state.process.killed && state.containerName) {
        activeContainers.push(state.containerName);
      }
    }

    logger.info(
      { activeCount: this.activeCount, detachedContainers: activeContainers },
      'WorkspaceQueue shutting down (containers detached, not killed)',
    );
  }
}
