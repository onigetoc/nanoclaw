import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import {
  DATA_DIR,
  IPC_POLL_INTERVAL,
  MAIN_WORKSPACE_FOLDER,
  TIMEZONE,
} from './config.js';
import { AvailableWorkspace } from './container-runner.js';
import { createTask, deleteTask, getTaskById, updateTask } from './db.js';
import { logger } from './logger.js';
import { RegisteredWorkspace } from './types.js';

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  sendImage: (jid: string, filePath: string, options?: { caption?: string }) => Promise<void>;
  registeredWorkspaces: () => Record<string, RegisteredWorkspace>;
  registerWorkspace: (jid: string, workspace: RegisteredWorkspace) => void;
  syncWorkspaceMetadata: (force: boolean) => Promise<void>;
  getAvailableWorkspaces: () => AvailableWorkspace[];
  writeWorkspacesSnapshot: (
    workspaceFolder: string,
    isMain: boolean,
    availableWorkspaces: AvailableWorkspace[],
    registeredJids: Set<string>,
  ) => void;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all workspace IPC directories (identity determined by directory)
    let workspaceFolders: string[];
    try {
      workspaceFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredWorkspaces = deps.registeredWorkspaces();

    for (const sourceWorkspace of workspaceFolders) {
      const isMain = sourceWorkspace === MAIN_WORKSPACE_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceWorkspace, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceWorkspace, 'tasks');

      // Process messages from this workspace's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this workspace can send to this chatJid
                const targetWorkspace = registeredWorkspaces[data.chatJid];
                if (
                  isMain ||
                  (targetWorkspace && targetWorkspace.folder === sourceWorkspace)
                ) {
                  await deps.sendMessage(data.chatJid, data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceWorkspace },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceWorkspace },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              } else if (data.type === 'send_image' && data.chatJid && data.filePath) {
                // Authorization: verify this workspace can send to this chatJid
                const targetWorkspace = registeredWorkspaces[data.chatJid];
                if (
                  isMain ||
                  (targetWorkspace && targetWorkspace.folder === sourceWorkspace)
                ) {
                  await deps.sendImage(data.chatJid, data.filePath, { caption: data.caption });
                  logger.info(
                    { chatJid: data.chatJid, filePath: data.filePath, sourceWorkspace },
                    'IPC image sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceWorkspace },
                    'Unauthorized IPC image attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceWorkspace, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceWorkspace}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceWorkspace },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this workspace's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source workspace identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceWorkspace, isMain, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceWorkspace, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceWorkspace}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceWorkspace }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-workspace namespaces)');
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_workspace
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    containerConfig?: RegisteredWorkspace['containerConfig'];
  },
  sourceWorkspace: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
  deps: IpcDeps,
): Promise<void> {
  const registeredWorkspaces = deps.registeredWorkspaces();

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target workspace from JID
        const targetJid = data.targetJid as string;
        const targetWorkspaceEntry = registeredWorkspaces[targetJid];

        if (!targetWorkspaceEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target workspace not registered',
          );
          break;
        }

        const targetFolder = targetWorkspaceEntry.folder;

        // Authorization: non-main workspaces can only schedule for themselves
        if (!isMain && targetFolder !== sourceWorkspace) {
          logger.warn(
            { sourceWorkspace, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'workspace' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          workspace_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode === 'group' ? 'workspace' : contextMode as 'workspace' | 'isolated',
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceWorkspace, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.workspace_folder === sourceWorkspace)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceWorkspace },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceWorkspace },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.workspace_folder === sourceWorkspace)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceWorkspace },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceWorkspace },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.workspace_folder === sourceWorkspace)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceWorkspace },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceWorkspace },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_workspaces':
      // Only main workspace can request a refresh
      if (isMain) {
        logger.info(
          { sourceWorkspace },
          'Workspace metadata refresh requested via IPC',
        );
        await deps.syncWorkspaceMetadata(true);
        // Write updated snapshot immediately
        const availableWorkspaces = deps.getAvailableWorkspaces();
        deps.writeWorkspacesSnapshot(
          sourceWorkspace,
          true,
          availableWorkspaces,
          new Set(Object.keys(registeredWorkspaces)),
        );
      } else {
        logger.warn(
          { sourceWorkspace },
          'Unauthorized refresh_workspaces attempt blocked',
        );
      }
      break;

    case 'register_workspace':
      // Only main workspace can register new workspaces
      if (!isMain) {
        logger.warn(
          { sourceWorkspace },
          'Unauthorized register_workspace attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        deps.registerWorkspace(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_workspace request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
