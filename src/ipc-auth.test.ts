import { describe, it, expect, beforeEach } from 'vitest';

import {
  _initTestDatabase,
  createTask,
  getAllTasks,
  getRegisteredWorkspace,
  getTaskById,
  setRegisteredWorkspace,
} from './db.js';
import { processTaskIpc, IpcDeps } from './ipc.js';
import { RegisteredWorkspace } from './types.js';

// Set up registered workspaces used across tests
const MAIN_WORKSPACE: RegisteredWorkspace = {
  name: 'Main',
  folder: 'main',
  trigger: 'always',
  added_at: '2024-01-01T00:00:00.000Z',
};

const OTHER_WORKSPACE: RegisteredWorkspace = {
  name: 'Other',
  folder: 'other-group',
  trigger: '@Bot',
  added_at: '2024-01-01T00:00:00.000Z',
};

const THIRD_WORKSPACE: RegisteredWorkspace = {
  name: 'Third',
  folder: 'third-group',
  trigger: '@Bot',
  added_at: '2024-01-01T00:00:00.000Z',
};

let workspaces: Record<string, RegisteredWorkspace>;
let deps: IpcDeps;

beforeEach(() => {
  _initTestDatabase();

  workspaces = {
    'main@g.us': MAIN_WORKSPACE,
    'other@g.us': OTHER_WORKSPACE,
    'third@g.us': THIRD_WORKSPACE,
  };

  // Populate DB as well
  setRegisteredWorkspace('main@g.us', MAIN_WORKSPACE);
  setRegisteredWorkspace('other@g.us', OTHER_WORKSPACE);
  setRegisteredWorkspace('third@g.us', THIRD_WORKSPACE);

  deps = {
    sendMessage: async () => {},
    sendImage: async () => {},
    registeredWorkspaces: () => workspaces,
    registerWorkspace: (jid: string, workspace: RegisteredWorkspace) => {
      workspaces[jid] = workspace;
      setRegisteredWorkspace(jid, workspace);
    },
    syncWorkspaceMetadata: async () => {},
    getAvailableWorkspaces: () => [],
    writeWorkspacesSnapshot: () => {},
  };
});

// --- schedule_task authorization ---

describe('schedule_task authorization', () => {
  it('main workspace can schedule for another workspace', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'do something',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    // Verify task was created in DB for the other workspace
    const allTasks = getAllTasks();
    expect(allTasks.length).toBe(1);
    expect(allTasks[0].workspace_folder).toBe('other-group');
  });

  it('non-main workspace can schedule for itself', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'self task',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        targetJid: 'other@g.us',
      },
      'other-group',
      false,
      deps,
    );

    const allTasks = getAllTasks();
    expect(allTasks.length).toBe(1);
    expect(allTasks[0].workspace_folder).toBe('other-group');
  });

  it('non-main workspace cannot schedule for another workspace', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'unauthorized',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        targetJid: 'main@g.us',
      },
      'other-group',
      false,
      deps,
    );

    const allTasks = getAllTasks();
    expect(allTasks.length).toBe(0);
  });

  it('rejects schedule_task for unregistered target JID', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'no target',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        targetJid: 'unknown@g.us',
      },
      'main',
      true,
      deps,
    );

    const allTasks = getAllTasks();
    expect(allTasks.length).toBe(0);
  });
});

// --- pause_task authorization ---

describe('pause_task authorization', () => {
  beforeEach(() => {
    createTask({
      id: 'task-main',
      workspace_folder: 'main',
      chat_jid: 'main@g.us',
      prompt: 'main task',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2025-06-01T00:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });
    createTask({
      id: 'task-other',
      workspace_folder: 'other-group',
      chat_jid: 'other@g.us',
      prompt: 'other task',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2025-06-01T00:00:00.000Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });
  });

  it('main workspace can pause any task', async () => {
    await processTaskIpc({ type: 'pause_task', taskId: 'task-other' }, 'main', true, deps);
    expect(getTaskById('task-other')!.status).toBe('paused');
  });

  it('non-main workspace can pause its own task', async () => {
    await processTaskIpc({ type: 'pause_task', taskId: 'task-other' }, 'other-group', false, deps);
    expect(getTaskById('task-other')!.status).toBe('paused');
  });

  it('non-main workspace cannot pause another workspaces task', async () => {
    await processTaskIpc({ type: 'pause_task', taskId: 'task-main' }, 'other-group', false, deps);
    expect(getTaskById('task-main')!.status).toBe('active');
  });
});

// --- resume_task authorization ---

describe('resume_task authorization', () => {
  beforeEach(() => {
    createTask({
      id: 'task-paused',
      workspace_folder: 'other-group',
      chat_jid: 'other@g.us',
      prompt: 'paused task',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: '2025-06-01T00:00:00.000Z',
      status: 'paused',
      created_at: '2024-01-01T00:00:00.000Z',
    });
  });

  it('main workspace can resume any task', async () => {
    await processTaskIpc({ type: 'resume_task', taskId: 'task-paused' }, 'main', true, deps);
    expect(getTaskById('task-paused')!.status).toBe('active');
  });

  it('non-main workspace can resume its own task', async () => {
    await processTaskIpc({ type: 'resume_task', taskId: 'task-paused' }, 'other-group', false, deps);
    expect(getTaskById('task-paused')!.status).toBe('active');
  });

  it('non-main workspace cannot resume another workspaces task', async () => {
    await processTaskIpc({ type: 'resume_task', taskId: 'task-paused' }, 'third-group', false, deps);
    expect(getTaskById('task-paused')!.status).toBe('paused');
  });
});

// --- cancel_task authorization ---

describe('cancel_task authorization', () => {
  it('main workspace can cancel any task', async () => {
    createTask({
      id: 'task-to-cancel',
      workspace_folder: 'other-group',
      chat_jid: 'other@g.us',
      prompt: 'cancel me',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    await processTaskIpc({ type: 'cancel_task', taskId: 'task-to-cancel' }, 'main', true, deps);
    expect(getTaskById('task-to-cancel')).toBeUndefined();
  });

  it('non-main workspace can cancel its own task', async () => {
    createTask({
      id: 'task-own',
      workspace_folder: 'other-group',
      chat_jid: 'other@g.us',
      prompt: 'my task',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    await processTaskIpc({ type: 'cancel_task', taskId: 'task-own' }, 'other-group', false, deps);
    expect(getTaskById('task-own')).toBeUndefined();
  });

  it('non-main workspace cannot cancel another workspaces task', async () => {
    createTask({
      id: 'task-foreign',
      workspace_folder: 'main',
      chat_jid: 'main@g.us',
      prompt: 'not yours',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00.000Z',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    await processTaskIpc({ type: 'cancel_task', taskId: 'task-foreign' }, 'other-group', false, deps);
    expect(getTaskById('task-foreign')).toBeDefined();
  });
});

// --- register_workspace authorization ---

describe('register_workspace authorization', () => {
  it('non-main workspace cannot register a workspace', async () => {
    await processTaskIpc(
      {
        type: 'register_workspace',
        jid: 'new@g.us',
        name: 'New Group',
        folder: 'new-group',
        trigger: '@Bot',
      },
      'other-group',
      false,
      deps,
    );

    // registeredWorkspaces should not have changed
    expect(workspaces['new@g.us']).toBeUndefined();
  });
});

// --- refresh_workspaces authorization ---

describe('refresh_workspaces authorization', () => {
  it('non-main workspace cannot trigger refresh', async () => {
    // This should be silently blocked (no crash, no effect)
    await processTaskIpc({ type: 'refresh_workspaces' }, 'other-group', false, deps);
    // If we got here without error, the auth gate worked
  });
});

// --- IPC message authorization ---
// Tests the authorization pattern from startIpcWatcher (ipc.ts).
// The logic: isMain || (targetWorkspace && targetWorkspace.folder === sourceWorkspace)

describe('IPC message authorization', () => {
  // Replicate the exact check from the IPC watcher
  function isMessageAuthorized(
    sourceWorkspace: string,
    isMain: boolean,
    targetChatJid: string,
    registeredWorkspaces: Record<string, RegisteredWorkspace>,
  ): boolean {
    const targetWorkspace = registeredWorkspaces[targetChatJid];
    return isMain || (!!targetWorkspace && targetWorkspace.folder === sourceWorkspace);
  }

  it('main workspace can send to any workspace', () => {
    expect(isMessageAuthorized('main', true, 'other@g.us', workspaces)).toBe(true);
    expect(isMessageAuthorized('main', true, 'third@g.us', workspaces)).toBe(true);
  });

  it('non-main workspace can send to its own chat', () => {
    expect(isMessageAuthorized('other-group', false, 'other@g.us', workspaces)).toBe(true);
  });

  it('non-main workspace cannot send to another workspace chat', () => {
    expect(isMessageAuthorized('other-group', false, 'main@g.us', workspaces)).toBe(false);
    expect(isMessageAuthorized('other-group', false, 'third@g.us', workspaces)).toBe(false);
  });

  it('non-main workspace cannot send to unregistered JID', () => {
    expect(isMessageAuthorized('other-group', false, 'unknown@g.us', workspaces)).toBe(false);
  });

  it('main workspace can send to unregistered JID', () => {
    // Main is always authorized regardless of target
    expect(isMessageAuthorized('main', true, 'unknown@g.us', workspaces)).toBe(true);
  });
});

// --- schedule_task with cron and interval types ---

describe('schedule_task schedule types', () => {
  it('creates task with cron schedule and computes next_run', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'cron task',
        schedule_type: 'cron',
        schedule_value: '0 9 * * *', // every day at 9am
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    const tasks = getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].schedule_type).toBe('cron');
    expect(tasks[0].next_run).toBeTruthy();
    // next_run should be a valid ISO date in the future
    expect(new Date(tasks[0].next_run!).getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  it('rejects invalid cron expression', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'bad cron',
        schedule_type: 'cron',
        schedule_value: 'not a cron',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    expect(getAllTasks()).toHaveLength(0);
  });

  it('creates task with interval schedule', async () => {
    const before = Date.now();

    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'interval task',
        schedule_type: 'interval',
        schedule_value: '3600000', // 1 hour
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    const tasks = getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].schedule_type).toBe('interval');
    // next_run should be ~1 hour from now
    const nextRun = new Date(tasks[0].next_run!).getTime();
    expect(nextRun).toBeGreaterThanOrEqual(before + 3600000 - 1000);
    expect(nextRun).toBeLessThanOrEqual(Date.now() + 3600000 + 1000);
  });

  it('rejects invalid interval (non-numeric)', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'bad interval',
        schedule_type: 'interval',
        schedule_value: 'abc',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    expect(getAllTasks()).toHaveLength(0);
  });

  it('rejects invalid interval (zero)', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'zero interval',
        schedule_type: 'interval',
        schedule_value: '0',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    expect(getAllTasks()).toHaveLength(0);
  });

  it('rejects invalid once timestamp', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'bad once',
        schedule_type: 'once',
        schedule_value: 'not-a-date',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    expect(getAllTasks()).toHaveLength(0);
  });
});

// --- context_mode defaulting ---

describe('schedule_task context_mode', () => {
  it('accepts context_mode=workspace', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'workspace context',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        context_mode: 'workspace',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    const tasks = getAllTasks();
    expect(tasks[0].context_mode).toBe('workspace');
  });

  it('accepts context_mode=isolated', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'isolated context',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        context_mode: 'isolated',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    const tasks = getAllTasks();
    expect(tasks[0].context_mode).toBe('isolated');
  });

  it('defaults invalid context_mode to isolated', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'bad context',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        context_mode: 'bogus' as any,
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    const tasks = getAllTasks();
    expect(tasks[0].context_mode).toBe('isolated');
  });

  it('defaults missing context_mode to isolated', async () => {
    await processTaskIpc(
      {
        type: 'schedule_task',
        prompt: 'no context mode',
        schedule_type: 'once',
        schedule_value: '2025-06-01T00:00:00.000Z',
        targetJid: 'other@g.us',
      },
      'main',
      true,
      deps,
    );

    const tasks = getAllTasks();
    expect(tasks[0].context_mode).toBe('isolated');
  });
});

// --- register_workspace success path ---

describe('register_workspace success', () => {
  it('main workspace can register a new workspace', async () => {
    await processTaskIpc(
      {
        type: 'register_workspace',
        jid: 'new@g.us',
        name: 'New Group',
        folder: 'new-group',
        trigger: '@Bot',
      },
      'main',
      true,
      deps,
    );

    // Verify workspace was registered in DB
    const workspace = getRegisteredWorkspace('new@g.us');
    expect(workspace).toBeDefined();
    expect(workspace!.name).toBe('New Group');
    expect(workspace!.folder).toBe('new-group');
    expect(workspace!.trigger).toBe('@Bot');
  });

  it('register_workspace rejects request with missing fields', async () => {
    await processTaskIpc(
      {
        type: 'register_workspace',
        jid: 'partial@g.us',
        name: 'Partial',
        // missing folder and trigger
      },
      'main',
      true,
      deps,
    );

    expect(getRegisteredWorkspace('partial@g.us')).toBeUndefined();
  });
});
