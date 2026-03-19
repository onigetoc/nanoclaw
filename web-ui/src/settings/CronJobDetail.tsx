import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Save,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { apiService, type ScheduledTaskInfo, type TaskRunLogEntry } from '../api';

interface CronJobDetailProps {
  taskId: string;
  isDark: boolean;
  onBack: () => void;
  onDeleted: () => void;
}

export default function CronJobDetail({ taskId, isDark, onBack, onDeleted }: CronJobDetailProps) {
  const [task, setTask] = useState<ScheduledTaskInfo | null>(null);
  const [logs, setLogs] = useState<TaskRunLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditingState] = useState(false);
  const editingRef = useRef(false);
  const setEditing = (v: boolean) => { editingRef.current = v; setEditingState(v); };
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Edit form state
  const [editPrompt, setEditPrompt] = useState('');
  const [editScheduleType, setEditScheduleType] = useState('');
  const [editScheduleValue, setEditScheduleValue] = useState('');

  const fetchDetail = useCallback(async () => {
    try {
      const data = await apiService.getTask(taskId);
      setTask(data.task);
      setLogs(data.logs);
      // Only update edit fields when NOT actively editing (avoid overwriting user input)
      if (!editingRef.current) {
        setEditPrompt(data.task.prompt);
        setEditScheduleType(data.task.schedule_type);
        setEditScheduleValue(data.task.schedule_value);
      }
    } catch { /* */ }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    void fetchDetail();
    const interval = setInterval(fetchDetail, 10_000);
    return () => clearInterval(interval);
  }, [fetchDetail]);

  const handleSave = async () => {
    setActionLoading(true);
    try {
      await apiService.updateTask(taskId, {
        prompt: editPrompt,
        schedule_type: editScheduleType,
        schedule_value: editScheduleValue,
      });
      setEditing(false);
      showToast('Task updated');
      await fetchDetail();
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
    }
    setActionLoading(false);
  };

  const handlePauseResume = async () => {
    if (!task) return;
    setActionLoading(true);
    try {
      if (task.status === 'active') {
        await apiService.pauseTask(taskId);
        showToast('Task paused');
      } else {
        await apiService.resumeTask(taskId);
        showToast('Task resumed');
      }
      await fetchDetail();
    } catch { showToast('Action failed', 'error'); }
    setActionLoading(false);
  };

  const handleTrigger = async () => {
    setActionLoading(true);
    try {
      await apiService.triggerTask(taskId);
      showToast('⚡ Task triggered — executing now');
      await fetchDetail();
    } catch { showToast('Failed to trigger task', 'error'); }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this cron job permanently?')) return;
    setActionLoading(true);
    try {
      await apiService.deleteTask(taskId);
      onDeleted();
    } catch { showToast('Failed to delete', 'error'); }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className={isDark ? 'text-zinc-500' : 'text-zinc-400'}>Task not found.</p>
        <button type="button" onClick={onBack} className="mt-2 text-sm text-emerald-400 hover:underline">
          ← Back to list
        </button>
      </div>
    );
  }

  const cardClass = `rounded-xl border p-5 ${isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-200 bg-white'}`;
  const labelClass = `text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`;
  const valueClass = `text-sm ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`;
  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
    isDark
      ? 'border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500'
      : 'border-zinc-300 bg-white text-zinc-800 focus:border-emerald-500'
  }`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className={`rounded-lg p-2 transition ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Task Detail</h1>
          <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {task.workspace_name} · {task.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleTrigger}
            disabled={actionLoading}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isDark ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <Play className="h-3 w-3" /> Run Now
          </button>
          <button
            type="button"
            onClick={handlePauseResume}
            disabled={actionLoading}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              task.status === 'active'
                ? isDark ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                : isDark ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {task.status === 'active' ? <><Pause className="h-3 w-3" /> Pause</> : <><RefreshCw className="h-3 w-3" /> Resume</>}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={actionLoading}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isDark ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={cardClass}>
          <div className={labelClass}>Status</div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${
              task.status === 'active' ? 'bg-emerald-400' : task.status === 'paused' ? 'bg-amber-400' : 'bg-zinc-500'
            }`} />
            <span className={`text-sm font-medium capitalize ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {task.status}
            </span>
          </div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Schedule</div>
          <div className={valueClass}>
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono ${
              isDark ? 'bg-zinc-800 text-emerald-300' : 'bg-zinc-100 text-emerald-700'
            }`}>
              {task.schedule_type}: {task.schedule_value}
            </span>
          </div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Next Run</div>
          <div className={valueClass}>
            {task.next_run ? new Date(task.next_run).toLocaleString() : '—'}
          </div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Last Run</div>
          <div className={valueClass}>
            {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
          </div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Context Mode</div>
          <div className={valueClass}>{task.context_mode}</div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Created</div>
          <div className={valueClass}>{new Date(task.created_at).toLocaleString()}</div>
        </div>
      </div>

      {/* Prompt */}
      <div className={`${cardClass} mb-6`}>
        <div className={labelClass}>Prompt</div>
        {editing ? (
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={4}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        ) : (
          <p className={`text-sm whitespace-pre-wrap ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
            {task.prompt}
          </p>
        )}
      </div>

      {/* Edit schedule */}
      {editing && (
        <div className={`${cardClass} mb-6`}>
          <div className={labelClass}>Schedule</div>
          <div className="flex items-center gap-3 mt-1">
            <select
              value={editScheduleType}
              onChange={(e) => setEditScheduleType(e.target.value)}
              className={inputClass}
              style={{ maxWidth: 140 }}
            >
              <option value="cron">Cron</option>
              <option value="interval">Interval</option>
              <option value="once">Once</option>
            </select>
            <input
              type="text"
              value={editScheduleValue}
              onChange={(e) => setEditScheduleValue(e.target.value)}
              placeholder={editScheduleType === 'cron' ? '*/30 * * * *' : editScheduleType === 'interval' ? '3600000' : '2026-04-01T10:00:00Z'}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={actionLoading}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isDark ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <Save className="h-3 w-3" /> Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Last result */}
      {task.last_result && (
        <div className={`${cardClass} mb-6`}>
          <div className={labelClass}>Last Result</div>
          <p className={`text-xs font-mono whitespace-pre-wrap ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {task.last_result}
          </p>
        </div>
      )}

      {/* Run history */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <div className={labelClass}>Run History</div>
          <span className={`text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
            {logs.length} run{logs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {logs.length === 0 ? (
          <p className={`text-sm text-center py-6 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
            No runs yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'
                }`}
              >
                {log.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    {new Date(log.run_at).toLocaleString()}
                  </div>
                  {log.error && (
                    <div className="text-[11px] text-rose-400 truncate mt-0.5">{log.error}</div>
                  )}
                  {log.result && !log.error && (
                    <div className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {log.result}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 text-xs tabular-nums ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {log.duration_ms >= 60000
                    ? `${(log.duration_ms / 60000).toFixed(1)}m`
                    : log.duration_ms >= 1000
                      ? `${(log.duration_ms / 1000).toFixed(1)}s`
                      : `${log.duration_ms}ms`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
