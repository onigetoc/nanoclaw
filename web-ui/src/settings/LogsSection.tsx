import { AlertTriangle, CheckCircle, Clock, FileWarning, RefreshCw } from 'lucide-react';
import type { AgentExecution } from '../api';

interface LogsSectionProps {
  executions: AgentExecution[];
  onRefresh: () => void;
  isDark: boolean;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LogsSection({ executions, onRefresh, isDark }: LogsSectionProps) {
  const errors = executions.filter((e) => e.status === 'error');
  const all = executions;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Logs
        </h1>
        <button
          type="button"
          onClick={onRefresh}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
            isDark
              ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Recent agent executions and errors.
      </p>

      {/* Error summary */}
      {errors.length > 0 && (
        <div
          className={`mb-6 rounded-xl border p-4 ${
            isDark ? 'border-rose-800/50 bg-rose-500/10' : 'border-rose-200 bg-rose-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={`h-4 w-4 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
            <span className={`text-sm font-semibold ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
              {errors.length} error{errors.length > 1 ? 's' : ''} in recent executions
            </span>
          </div>
          <div className="space-y-2 mt-3">
            {errors.slice(0, 10).map((err) => (
              <div
                key={err.id}
                className={`rounded-lg px-3 py-2 ${
                  isDark ? 'bg-zinc-900/80' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    {err.groupName}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {formatDate(err.timestamp)} {formatTime(err.timestamp)}
                  </span>
                </div>
                <div
                  className={`text-xs font-mono break-all ${isDark ? 'text-rose-300' : 'text-rose-600'}`}
                >
                  {err.error || 'Unknown error'}
                </div>
                <div className={`mt-1 text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {err.model} · {formatDuration(err.duration)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All executions */}
      {all.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center rounded-xl border py-12 ${
            isDark ? 'border-zinc-800 bg-zinc-900/80 text-zinc-600' : 'border-zinc-200 bg-white text-zinc-400'
          }`}
        >
          <FileWarning className="mb-2 h-6 w-6" />
          <p className="text-sm">No executions yet</p>
        </div>
      ) : (
        <div
          className={`rounded-xl border overflow-hidden ${
            isDark ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className={isDark ? 'bg-zinc-900/80' : 'bg-zinc-50'}>
                <th className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Status</th>
                <th className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Group</th>
                <th className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Model</th>
                <th className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Duration</th>
                <th className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Time</th>
              </tr>
            </thead>
            <tbody>
              {all.map((exec) => (
                <tr
                  key={exec.id}
                  className={`border-t ${
                    isDark ? 'border-zinc-800 hover:bg-zinc-800/40' : 'border-zinc-100 hover:bg-zinc-50'
                  }`}
                  title={exec.error || undefined}
                >
                  <td className="px-4 py-2.5">
                    {exec.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : exec.status === 'error' ? (
                      <AlertTriangle className="h-4 w-4 text-rose-400" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-400 animate-pulse" />
                    )}
                  </td>
                  <td className={`px-4 py-2.5 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    {exec.groupName}
                  </td>
                  <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {exec.model.split('/').pop() || exec.model}
                  </td>
                  <td className={`px-4 py-2.5 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {formatDuration(exec.duration)}
                  </td>
                  <td className={`px-4 py-2.5 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {formatDate(exec.timestamp)} {formatTime(exec.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
