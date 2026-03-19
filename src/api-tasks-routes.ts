/**
 * API Task/Cron Routes — manage scheduled tasks from the web UI.
 *
 * Endpoints:
 *   GET    /tasks            — list all tasks (optionally filter by workspace)
 *   GET    /tasks/:id        — get task details + recent run logs
 *   POST   /tasks            — create a new task
 *   PUT    /tasks/:id        — update a task
 *   DELETE /tasks/:id        — delete a task
 *   POST   /tasks/:id/pause  — pause a task
 *   POST   /tasks/:id/resume — resume a task
 *   POST   /tasks/:id/run    — trigger immediate execution
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { CronExpressionParser } from 'cron-parser';
import {
  getAllTasks,
  getTaskById,
  getTasksForWorkspace,
  createTask,
  updateTask,
  deleteTask,
  getTaskRunLogs,
} from './db.js';
import { getRegisteredWorkspaces } from './state.js';
import { TIMEZONE } from './config.js';
import { logger } from './logger.js';

/** Callback to trigger a task immediately — set by startup after scheduler is ready */
let triggerTaskFn: ((taskId: string) => { success: boolean; error?: string }) | null = null;

export function setTriggerTaskFunction(fn: (taskId: string) => { success: boolean; error?: string }): void {
  triggerTaskFn = fn;
}

function computeNextRun(scheduleType: string, scheduleValue: string): string | null {
  if (scheduleType === 'cron') {
    const interval = CronExpressionParser.parse(scheduleValue, { tz: TIMEZONE });
    return interval.next().toISOString();
  }
  if (scheduleType === 'interval') {
    const ms = parseInt(scheduleValue, 10);
    return new Date(Date.now() + ms).toISOString();
  }
  if (scheduleType === 'once') {
    return scheduleValue; // ISO date string
  }
  return null;
}

export function registerTaskRoutes(fastify: FastifyInstance, authenticate: any): void {

  /** List all tasks, optionally filtered by workspace */
  fastify.get('/tasks', { preHandler: authenticate }, async (request: FastifyRequest) => {
    const { workspace } = request.query as { workspace?: string };
    const tasks = workspace ? getTasksForWorkspace(workspace) : getAllTasks();

    // Enrich with workspace name
    const workspaces = getRegisteredWorkspaces();
    const workspaceMap = new Map<string, string>();
    for (const ws of Object.values(workspaces)) {
      workspaceMap.set(ws.folder, ws.name);
    }

    const enriched = tasks.map((t) => ({
      ...t,
      workspace_name: workspaceMap.get(t.workspace_folder) || t.workspace_folder,
    }));

    return { tasks: enriched };
  });

  /** Get task details + run logs */
  fastify.get('/tasks/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const task = getTaskById(id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }

    const workspaces = getRegisteredWorkspaces();
    const ws = Object.values(workspaces).find((w) => w.folder === task.workspace_folder);

    const logs = getTaskRunLogs(id, 50);

    return {
      task: { ...task, workspace_name: ws?.name || task.workspace_folder },
      logs,
    };
  });

  /** Create a new task */
  fastify.post('/tasks', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const workspaceFolder = (body?.workspace_folder as string || '').trim();
    const chatJid = (body?.chat_jid as string || '').trim();
    const prompt = (body?.prompt as string || '').trim();
    const scheduleType = (body?.schedule_type as string || '').trim();
    const scheduleValue = (body?.schedule_value as string || '').trim();
    const contextMode = (body?.context_mode as string || 'isolated').trim();

    if (!workspaceFolder || !chatJid || !prompt || !scheduleType || !scheduleValue) {
      reply.code(400).send({ error: 'Missing required fields: workspace_folder, chat_jid, prompt, schedule_type, schedule_value' });
      return;
    }

    if (!['cron', 'interval', 'once'].includes(scheduleType)) {
      reply.code(400).send({ error: 'schedule_type must be cron, interval, or once' });
      return;
    }

    // Validate cron expression
    if (scheduleType === 'cron') {
      try {
        CronExpressionParser.parse(scheduleValue, { tz: TIMEZONE });
      } catch {
        reply.code(400).send({ error: 'Invalid cron expression' });
        return;
      }
    }

    const id = crypto.randomBytes(8).toString('hex');
    const nextRun = computeNextRun(scheduleType, scheduleValue);

    createTask({
      id,
      workspace_folder: workspaceFolder,
      chat_jid: chatJid,
      prompt,
      schedule_type: scheduleType as 'cron' | 'interval' | 'once',
      schedule_value: scheduleValue,
      context_mode: contextMode as 'workspace' | 'isolated',
      next_run: nextRun,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    logger.info({ taskId: id, workspace: workspaceFolder }, 'Task created via web UI');
    return { success: true, id };
  });

  /** Update a task */
  fastify.put('/tasks/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const task = getTaskById(id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const updates: Record<string, unknown> = {};

    if (body?.prompt !== undefined) updates.prompt = (body.prompt as string).trim();
    if (body?.schedule_type !== undefined) updates.schedule_type = (body.schedule_type as string).trim();
    if (body?.schedule_value !== undefined) updates.schedule_value = (body.schedule_value as string).trim();

    // Validate cron if changed
    const newType = (updates.schedule_type as string) || task.schedule_type;
    const newValue = (updates.schedule_value as string) || task.schedule_value;
    if (newType === 'cron') {
      try {
        CronExpressionParser.parse(newValue, { tz: TIMEZONE });
      } catch {
        reply.code(400).send({ error: 'Invalid cron expression' });
        return;
      }
    }

    // Recompute next_run if schedule changed
    if (updates.schedule_type || updates.schedule_value) {
      updates.next_run = computeNextRun(newType, newValue);
    }

    updateTask(id, updates as any);
    logger.info({ taskId: id }, 'Task updated via web UI');
    return { success: true };
  });

  /** Delete a task */
  fastify.delete('/tasks/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const task = getTaskById(id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }
    deleteTask(id);
    logger.info({ taskId: id }, 'Task deleted via web UI');
    return { success: true };
  });

  /** Pause a task */
  fastify.post('/tasks/:id/pause', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const task = getTaskById(id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }
    updateTask(id, { status: 'paused' });
    return { success: true };
  });

  /** Resume a task */
  fastify.post('/tasks/:id/resume', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const task = getTaskById(id);
    if (!task) {
      reply.code(404).send({ error: 'Task not found' });
      return;
    }

    // Recompute next_run
    const nextRun = computeNextRun(task.schedule_type, task.schedule_value);
    updateTask(id, { status: 'active', next_run: nextRun });
    return { success: true };
  });

  /** Trigger immediate execution */
  fastify.post('/tasks/:id/run', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (!triggerTaskFn) {
      reply.code(503).send({ error: 'Scheduler not ready yet — try again in a few seconds' });
      return;
    }

    const result = triggerTaskFn(id);
    if (!result.success) {
      reply.code(result.error === 'Task not found' ? 404 : 500).send({ error: result.error });
      return;
    }
    logger.info({ taskId: id }, 'Task triggered immediately via web UI');
    return { success: true, message: 'Task enqueued for immediate execution' };
  });
}
