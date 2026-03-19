import { ChildProcess } from 'child_process';
import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';
import path from 'path';

import {
  WORKSPACES_DIR,
  IDLE_TIMEOUT,
  MAIN_WORKSPACE_FOLDER,
  SCHEDULER_POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import { ContainerOutput, runContainerAgent, shouldUseDirectMode, writeTasksSnapshot } from './container-runner.js';
import { runDirectAgent } from './direct-runner.js';
import {
  getAllTasks,
  getDueTasks,
  getTaskById,
  logTaskRun,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { WorkspaceQueue } from './workspace-queue.js';
import { logger } from './logger.js';
import { RegisteredWorkspace, ScheduledTask } from './types.js';
import { isSleeping } from './commands/sleep-manager.js';

/**
 * Format a scheduled task error into a user-readable message.
 */
function formatTaskErrorForUser(taskPrompt: string, error: string): string {
  const shortPrompt = taskPrompt.length > 80 ? taskPrompt.slice(0, 80) + '…' : taskPrompt;
  return `⚠️ Scheduled task failed: "${shortPrompt}"\n\n\`Error: ${error}\``;
}

export interface SchedulerDependencies {
  registeredWorkspaces: () => Record<string, RegisteredWorkspace>;
  getSessions: () => Record<string, string>;
  queue: WorkspaceQueue;
  onProcess: (workspaceJid: string, proc: ChildProcess, containerName: string, workspaceFolder: string) => void;
  sendMessage: (jid: string, text: string) => Promise<void>;
}

async function runTask(
  task: ScheduledTask,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  const workspaceDir = path.join(WORKSPACES_DIR, task.workspace_folder);
  fs.mkdirSync(workspaceDir, { recursive: true });

  logger.info(
    { taskId: task.id, workspace: task.workspace_folder },
    'Running scheduled task',
  );

  const workspaces = deps.registeredWorkspaces();
  const workspace = Object.values(workspaces).find(
    (w) => w.folder === task.workspace_folder,
  );

  if (!workspace) {
    logger.error(
      { taskId: task.id, workspaceFolder: task.workspace_folder },
      'Workspace not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Workspace not found: ${task.workspace_folder}`,
    });
    return;
  }

  // Update tasks snapshot for container to read (filtered by workspace)
  const isMain = task.workspace_folder === MAIN_WORKSPACE_FOLDER;
  const tasks = getAllTasks();
  writeTasksSnapshot(
    task.workspace_folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      workspaceFolder: t.workspace_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  let result: string | null = null;
  let error: string | null = null;

  // For workspace context mode, use the workspace's current session
  const sessions = deps.getSessions();
  const sessionId =
    task.context_mode === 'workspace' ? sessions[task.workspace_folder] : undefined;

  // Idle timer: writes _close sentinel after IDLE_TIMEOUT of no output,
  // so the container exits instead of hanging at waitForIpcMessage forever.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Scheduled task idle timeout, closing container stdin');
      deps.queue.closeStdin(task.chat_jid);
    }, IDLE_TIMEOUT);
  };

  try {
    // Use direct mode on Windows/Linux, container mode on macOS
    const runAgentFn = shouldUseDirectMode() ? runDirectAgent : runContainerAgent;
    
    const output = await runAgentFn(
      workspace,
      {
        prompt: task.prompt,
        sessionId,
        workspaceFolder: task.workspace_folder,
        chatJid: task.chat_jid,
        isMain,
        isScheduledTask: true,
      },
      (proc, containerName) => deps.onProcess(task.chat_jid, proc, containerName, task.workspace_folder),
      async (streamedOutput: ContainerOutput) => {
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // Forward result to user (sendMessage handles formatting)
          await deps.sendMessage(task.chat_jid, streamedOutput.result);
          // Only reset idle timer on actual results, not session-update markers
          resetIdleTimer();
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
          // Send error to user so they see what happened with their scheduled task
          const errorMsg = formatTaskErrorForUser(task.prompt, error);
          await deps.sendMessage(task.chat_jid, errorMsg);
        }
      },
    );

    if (idleTimer) clearTimeout(idleTimer);

    if (output.status === 'error') {
      error = output.error || 'Unknown error';
      // If no streamed error was sent yet, notify the user
      if (!result) {
        const errorMsg = formatTaskErrorForUser(task.prompt, error);
        await deps.sendMessage(task.chat_jid, errorMsg);
      }
    } else if (output.result) {
      // Messages are sent via MCP tool (IPC), result text is just logged
      result = output.result;
    }

    logger.info(
      { taskId: task.id, durationMs: Date.now() - startTime },
      'Task completed',
    );
  } catch (err) {
    if (idleTimer) clearTimeout(idleTimer);
    error = err instanceof Error ? err.message : String(err);
    logger.error({ taskId: task.id, error }, 'Task failed');
    // Notify user about the scheduled task failure
    const errorMsg = formatTaskErrorForUser(task.prompt, error);
    try {
      await deps.sendMessage(task.chat_jid, errorMsg);
    } catch (sendErr) {
      logger.error({ taskId: task.id, sendErr }, 'Failed to send task error to user');
    }
  }

  const durationMs = Date.now() - startTime;

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: error ? 'error' : 'success',
    result,
    error,
  });

  let nextRun: string | null = null;
  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    nextRun = interval.next().toISOString();
  } else if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    nextRun = new Date(Date.now() + ms).toISOString();
  }
  // 'once' tasks have no next run

  const resultSummary = error
    ? `Error: ${error}`
    : result
      ? result.slice(0, 200)
      : 'Completed';
  updateTaskAfterRun(task.id, nextRun, resultSummary);
}

let schedulerRunning = false;
let schedulerDeps: SchedulerDependencies | null = null;

export function startSchedulerLoop(deps: SchedulerDependencies): void {
  if (schedulerRunning) {
    logger.debug('Scheduler loop already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;
  schedulerDeps = deps;
  logger.info('Scheduler loop started');

  const loop = async () => {
    try {
      // Skip processing if bot is sleeping
      if (isSleeping()) {
        setTimeout(loop, SCHEDULER_POLL_INTERVAL);
        return;
      }

      const dueTasks = getDueTasks();
      if (dueTasks.length > 0) {
        logger.info({ count: dueTasks.length }, 'Found due tasks');
      }

      for (const task of dueTasks) {
        // Re-check task status in case it was paused/cancelled
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          continue;
        }

        deps.queue.enqueueTask(
          currentTask.chat_jid,
          currentTask.id,
          () => runTask(currentTask, deps),
        );
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop');
    }

    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}

/**
 * Trigger a task for immediate execution, bypassing the poll interval.
 * Called from the web UI "Run Now" button.
 */
export function triggerTaskNow(taskId: string): { success: boolean; error?: string } {
  if (!schedulerDeps) {
    return { success: false, error: 'Scheduler not initialized' };
  }

  const task = getTaskById(taskId);
  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  logger.info({ taskId }, 'Task triggered immediately via web UI');

  // Ensure task is active so it can run
  if (task.status !== 'active') {
    updateTask(taskId, { status: 'active' });
    task.status = 'active';
  }

  const deps = schedulerDeps;
  deps.queue.enqueueTask(
    task.chat_jid,
    task.id,
    () => runTask(task, deps),
  );

  return { success: true };
}
