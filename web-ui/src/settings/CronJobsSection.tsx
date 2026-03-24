import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Eye,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { apiService, type ScheduledTaskInfo } from '../api';
import CronJobDetail from './CronJobDetail';

interface CronJobsSectionProps {
  isDark: boolean;
}

/** Group tasks by workspace_name */
function groupByWorkspace(tasks: ScheduledTaskInfo[]): Record<string, ScheduledTaskInfo[]> {
  const groups: Record<string, ScheduledTaskInfo[]> = {};
  for (const t of tasks) {
    const key = t.workspace_name || t.workspace_folder;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

function statusBadge(status: string, isDark: boolean) {
  const colors: Record<string, string> = {
    active: isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
    paused: isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700',
    completed: isDark ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-200 text-zinc-500',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[status] || ''}`}>
      {status}
    </span>
  );
}

function scheduleLabel(type: string, value: string): string {
  if (type === 'cron') return value;
  if (type === 'interval') {
    const ms = parseInt(value, 10);
    if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`;
    if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`;
    if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`;
    return `Every ${Math.round(ms / 1000)}s`;
  }
  if (type === 'once') return `Once: ${new Date(value).toLocaleString()}`;
  return value;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function timeUntil(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 60000) return 'in <1m';
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)}h`;
  return `in ${Math.floor(diff / 86400000)}d`;
}

export default function CronJobsSection({ isDark }: CronJobsSectionProps) {
  const [tasks, setTasks] = useState<ScheduledTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiService.getTasks();
      setTasks(data);
      // Auto-expand all workspaces on first load
      if (expandedWorkspaces.size === 0) {
        const names = new Set(data.map((t) => t.workspace_name || t.workspace_folder));
        setExpandedWorkspaces(names);
      }
    } catch {
      // server offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    const interval = setInterval(fetchTasks, 15_000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const toggleWorkspace = (name: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handlePause = async (id: string) => {
    setActionLoading(id);
    try {
      await apiService.pauseTask(id);
      showToast('Task paused');
      await fetchTasks();
    } catch { showToast('Failed to pause task', 'error'); }
    setActionLoading(null);
  };

  const handleResume = async (id: string) => {
    setActionLoading(id);
    try {
      await apiService.resumeTask(id);
      showToast('Task resumed');
      await fetchTasks();
    } catch { showToast('Failed to resume task', 'error'); }
    setActionLoading(null);
  };

  const handleTrigger = async (id: string) => {
    setActionLoading(id);
    try {
      await apiService.triggerTask(id);
      showToast('⚡ Task triggered — executing now');
      await fetchTasks();
    } catch (err: any) { showToast(err.message || 'Failed to trigger task', 'error'); }
    setActionLoading(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cron job? This cannot be undone.')) return;
    setActionLoading(id);
    try {
      await apiService.deleteTask(id);
      if (selectedTaskId === id) setSelectedTaskId(null);
      showToast('Task deleted');
      await fetchTasks();
    } catch { showToast('Failed to delete task', 'error'); }
    setActionLoading(null);
  };

  // Detail view
  if (selectedTaskId) {
    return (
      <CronJobDetail
        taskId={selectedTaskId}
        isDark={isDark}
        onBack={() => { setSelectedTaskId(null); void fetchTasks(); }}
        onDeleted={() => { setSelectedTaskId(null); void fetchTasks(); }}
      />
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Cron Jobs</h1>
        <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>Scheduled tasks across workspaces.</p>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        </div>
      </div>
    );
  }

  const grouped = groupByWorkspace(tasks);
  const workspaceNames = Object.keys(grouped).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Cron Jobs</h1>
        <button
          type="button"
          onClick={fetchTasks}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
          }`}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        {tasks.length} task{tasks.length !== 1 ? 's' : ''} across {workspaceNames.length} workspace{workspaceNames.length !== 1 ? 's' : ''}.
      </p>

      {tasks.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-xl border py-12 ${
          isDark ? 'border-zinc-800 bg-zinc-800/60 text-zinc-600' : 'border-zinc-300 bg-zinc-200 text-zinc-500'
        }`}>
          <Clock className="mb-2 h-6 w-6" />
          <p className="text-sm">No scheduled tasks</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
            Tasks are created via the agent's schedule_task tool.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {workspaceNames.map((wsName) => {
            const wsTasks = grouped[wsName];
            const isExpanded = expandedWorkspaces.has(wsName);
            const activeCount = wsTasks.filter((t) => t.status === 'active').length;

            return (
              <div key={wsName} className={`rounded-xl border overflow-hidden ${
                  isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'
                }`}>
                {/* Workspace header */}
                <button
                  type="button"
                  onClick={() => toggleWorkspace(wsName)}
                  className={`flex w-full items-center justify-between px-4 py-3 transition ${
                    isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''} ${
                      isDark ? 'text-zinc-500' : 'text-zinc-400'
                    }`} />
                    <span className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      {wsName}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {wsTasks.length} task{wsTasks.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeCount > 0 && (
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${
                        isDark ? 'text-emerald-400' : 'text-emerald-600'
                      }`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {activeCount} active
                      </span>
                    )}
                  </div>
                </button>

                {/* Task rows */}
                {isExpanded && (
                  <div className={`border-t ${isDark ? 'border-zinc-800' : 'border-zinc-100'}`}>
                    {wsTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isDark={isDark}
                        isLoading={actionLoading === task.id}
                        onView={() => setSelectedTaskId(task.id)}
                        onPause={() => handlePause(task.id)}
                        onResume={() => handleResume(task.id)}
                        onTrigger={() => handleTrigger(task.id)}
                        onDelete={() => handleDelete(task.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition-all animate-in slide-in-from-bottom-2 ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}


/** Individual task row in the list */
function TaskRow({
  task,
  isDark,
  isLoading,
  onView,
  onPause,
  onResume,
  onTrigger,
  onDelete,
}: {
  task: ScheduledTaskInfo;
  isDark: boolean;
  isLoading: boolean;
  onView: () => void;
  onPause: () => void;
  onResume: () => void;
  onTrigger: () => void;
  onDelete: () => void;
}) {
  const promptPreview = task.prompt.length > 80 ? task.prompt.slice(0, 80) + '…' : task.prompt;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition ${
      isDark ? 'hover:bg-zinc-800/40 border-b border-zinc-800/50 last:border-b-0' : 'hover:bg-zinc-50 border-b border-zinc-300 last:border-b-0'
    }`}>
      {/* Status dot */}
      <div className="shrink-0">
        <span className={`block h-2 w-2 rounded-full ${
          task.status === 'active' ? 'bg-emerald-400' : task.status === 'paused' ? 'bg-amber-400' : 'bg-zinc-500'
        }`} />
      </div>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-medium truncate ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            {promptPreview}
          </span>
          {statusBadge(task.status, isDark)}
        </div>
        <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {scheduleLabel(task.schedule_type, task.schedule_value)}
          </span>
          <span>Next: {timeUntil(task.next_run)}</span>
          <span>Last: {timeAgo(task.last_run)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isLoading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        ) : (
          <>
            <button
              type="button"
              onClick={onView}
              title="View details"
              className={`rounded-md p-1.5 transition ${isDark ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200' : 'hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700'}`}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onTrigger}
              title="Run now"
              className={`rounded-md p-1.5 transition ${isDark ? 'hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300' : 'hover:bg-emerald-50 text-zinc-500 hover:text-emerald-600'}`}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
            {task.status === 'active' ? (
              <button
                type="button"
                onClick={onPause}
                title="Pause"
                className={`rounded-md p-1.5 transition ${isDark ? 'hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300' : 'hover:bg-amber-50 text-zinc-500 hover:text-amber-600'}`}
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            ) : task.status === 'paused' ? (
              <button
                type="button"
                onClick={onResume}
                title="Resume"
                className={`rounded-md p-1.5 transition ${isDark ? 'hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300' : 'hover:bg-emerald-50 text-zinc-500 hover:text-emerald-600'}`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              className={`rounded-md p-1.5 transition ${isDark ? 'hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300' : 'hover:bg-rose-50 text-zinc-500 hover:text-rose-600'}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
