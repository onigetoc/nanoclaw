import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Zap, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { apiService, type AgentExecution, type ExecutionStep } from '../api';

interface ExecutionTraceProps {
  executions: AgentExecution[];
  activeExecutions: AgentExecution[];
  onRefresh: () => void;
  isDark: boolean;
}

const PHASE_CONFIG: Record<string, { icon: string; color: string; darkColor: string }> = {
  queue: { icon: '📥', color: 'text-zinc-500', darkColor: 'text-zinc-400' },
  init: { icon: '🚀', color: 'text-blue-600', darkColor: 'text-blue-400' },
  context: { icon: '📄', color: 'text-indigo-600', darkColor: 'text-indigo-400' },
  model: { icon: '🎯', color: 'text-amber-600', darkColor: 'text-amber-400' },
  fallback: { icon: '⚠️', color: 'text-orange-600', darkColor: 'text-orange-400' },
  response: { icon: '✅', color: 'text-emerald-600', darkColor: 'text-emerald-400' },
  error: { icon: '❌', color: 'text-rose-600', darkColor: 'text-rose-400' },
  done: { icon: '🏁', color: 'text-emerald-600', darkColor: 'text-emerald-400' },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
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

function StepTimeline({ steps, isDark }: { steps: ExecutionStep[]; isDark: boolean }) {
  return (
    <div className="relative ml-3 border-l-2 border-dashed pl-4 py-1"
      style={{ borderColor: isDark ? '#3f3f46' : '#d4d4d8' }}>
      {steps.map((step, i) => {
        const cfg = PHASE_CONFIG[step.phase] || PHASE_CONFIG.init;
        const isLast = i === steps.length - 1;
        return (
          <div key={`${step.timestamp}-${i}`} className="relative mb-2 last:mb-0">
            {/* Dot on the timeline */}
            <div className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full border-2"
              style={{
                borderColor: isDark ? '#52525b' : '#a1a1aa',
                backgroundColor: step.phase === 'error' ? '#f43f5e'
                  : step.phase === 'done' ? '#10b981'
                  : isLast ? '#f59e0b'
                  : isDark ? '#27272a' : '#e4e4e7',
              }}
            />
            <div className="flex items-start gap-2">
              <span className="text-sm shrink-0">{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-xs ${isDark ? cfg.darkColor : cfg.color}`}>
                  {step.message}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {formatTime(step.timestamp)}
                  </span>
                  {step.durationMs != null && step.durationMs > 0 && (
                    <span className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      ({formatDuration(step.durationMs)})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExecutionRow({ exec, isDark }: { exec: AgentExecution; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AgentExecution | null>(null);
  const [loading, setLoading] = useState(false);

  const isActive = exec.status === 'started' || exec.status === 'running';

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail && exec.id) {
      setLoading(true);
      try {
        const d = await apiService.getExecutionDetail(exec.id);
        if (d) setDetail(d);
      } catch { /* ignore */ }
      setLoading(false);
    }
  }, [expanded, detail, exec.id]);

  // Auto-refresh active executions
  useEffect(() => {
    if (!isActive || !expanded) return;
    const interval = setInterval(async () => {
      try {
        const d = await apiService.getExecutionDetail(exec.id);
        if (d) setDetail(d);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [isActive, expanded, exec.id]);

  const displaySteps = detail?.steps || exec.steps || [];

  return (
    <div className={`border-b last:border-b-0 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
          isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-zinc-50'
        }`}
      >
        {/* Status icon */}
        <div className="shrink-0">
          {exec.status === 'completed' ? (
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          ) : exec.status === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          ) : (
            <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
          )}
        </div>

        {/* Workspace */}
        <div className={`flex-1 min-w-0 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          <span className="text-sm">{exec.workspaceName}</span>
          {exec.error && (
            <div className={`text-[10px] truncate mt-0.5 ${isDark ? 'text-rose-400' : 'text-rose-500'}`}>
              {exec.error.slice(0, 80)}
            </div>
          )}
        </div>

        {/* Model */}
        <div className={`shrink-0 font-mono text-[11px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {exec.model ? (exec.model.split('/').pop() || exec.model) : '—'}
        </div>

        {/* Duration */}
        <div className={`shrink-0 text-xs w-16 text-right ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {isActive ? (
            <span className="text-amber-400 animate-pulse">running</span>
          ) : (
            formatDuration(exec.duration)
          )}
        </div>

        {/* Time */}
        <div className={`shrink-0 text-[11px] w-20 text-right ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {formatDate(exec.timestamp)} {formatTime(exec.timestamp)}
        </div>

        {/* Expand arrow */}
        <div className="shrink-0">
          {expanded ? (
            <ChevronDown className={`h-3.5 w-3.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
          ) : (
            <ChevronRight className={`h-3.5 w-3.5 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`} />
          )}
        </div>
      </button>

      {/* Expanded step timeline */}
      {expanded && (
        <div className={`px-4 pb-4 pt-1 ${isDark ? 'bg-zinc-900/50' : 'bg-zinc-50/50'}`}>
          {loading ? (
            <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading trace…
            </div>
          ) : displaySteps.length > 0 ? (
            <StepTimeline steps={displaySteps} isDark={isDark} />
          ) : (
            <div className={`text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
              No trace steps recorded for this execution.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExecutionTrace({ executions, activeExecutions, onRefresh, isDark }: ExecutionTraceProps) {
  // Merge active + recent, active first, deduplicate by id
  const seen = new Set<string>();
  const all: AgentExecution[] = [];
  for (const e of activeExecutions) {
    if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
  }
  for (const e of executions) {
    if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Execution Trace
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
        Click an execution to see the step-by-step trace. Active executions auto-refresh.
      </p>

      {/* Active executions highlight */}
      {activeExecutions.length > 0 && (
        <div className={`mb-4 rounded-xl border p-3 ${
          isDark ? 'border-amber-800/50 bg-amber-500/10' : 'border-amber-200 bg-amber-50'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Zap className={`h-4 w-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
            <span className={`text-sm font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              {activeExecutions.length} active execution{activeExecutions.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {all.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-xl border py-12 ${
          isDark ? 'border-zinc-800 bg-zinc-800/60 text-zinc-600' : 'border-zinc-300 bg-zinc-200 text-zinc-500'
        }`}>
          <ArrowRight className="mb-2 h-6 w-6" />
          <p className="text-sm">No executions yet. Send a message to see the trace.</p>
        </div>
      ) : (
        <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
          {all.map((exec) => (
            <ExecutionRow key={exec.id} exec={exec} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
}
