import { useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Activity,
  Layers,
  Cpu,
  Clock,
  Zap,
  Inbox,
  Rocket,
  FileText,
  Crosshair,
  XCircle,
  Flag,
  Wrench,
} from 'lucide-react';
import { apiService, type AgentExecution, type ExecutionStep } from '../api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityViewProps {
  executions: AgentExecution[];
  activeExecutions: AgentExecution[];
  onRefresh: () => void;
  isDark: boolean;
}

type FilterMode = 'all' | 'errors' | 'active';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASE_CONFIG: Record<string, { Icon: LucideIcon; color: string; darkColor: string }> = {
  queue:    { Icon: Inbox,        color: 'text-zinc-500',    darkColor: 'text-zinc-400' },
  init:     { Icon: Rocket,       color: 'text-blue-600',    darkColor: 'text-blue-400' },
  context:  { Icon: FileText,     color: 'text-indigo-600',  darkColor: 'text-indigo-400' },
  model:    { Icon: Crosshair,    color: 'text-amber-600',   darkColor: 'text-amber-400' },
  fallback: { Icon: AlertTriangle, color: 'text-orange-600', darkColor: 'text-orange-400' },
  response: { Icon: CheckCircle,  color: 'text-emerald-600', darkColor: 'text-emerald-400' },
  error:    { Icon: XCircle,      color: 'text-rose-600',    darkColor: 'text-rose-400' },
  done:     { Icon: Flag,         color: 'text-emerald-600', darkColor: 'text-emerald-400' },
  tool:     { Icon: Wrench,       color: 'text-purple-600',  darkColor: 'text-purple-400' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '—';
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

function isActive(exec: AgentExecution): boolean {
  return exec.status === 'started' || exec.status === 'running';
}

// ---------------------------------------------------------------------------
// StepTimeline — vertical timeline with colored dots and dotted line
// ---------------------------------------------------------------------------

function StepTimeline({ steps, isDark }: { steps: ExecutionStep[]; isDark: boolean }) {
  return (
    <div
      className="relative ml-3 border-l-2 border-dashed pl-4 py-1"
      style={{ borderColor: isDark ? '#3f3f46' : '#d4d4d8' }}
    >
      {steps.map((step, i) => {
        const cfg = PHASE_CONFIG[step.phase] || PHASE_CONFIG.init;
        const isLast = i === steps.length - 1;
        return (
          <div key={`${step.timestamp}-${i}`} className="relative mb-2 last:mb-0">
            <div
              className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full border-2"
              style={{
                borderColor: isDark ? '#52525b' : '#a1a1aa',
                backgroundColor:
                  step.phase === 'error'
                    ? '#f43f5e'
                    : step.phase === 'done'
                      ? '#10b981'
                      : isLast
                        ? '#f59e0b'
                        : isDark
                          ? '#27272a'
                          : '#e4e4e7',
              }}
            />
            <div className="flex items-start gap-2">
              <span className={`shrink-0 ${isDark ? cfg.darkColor : cfg.color}`}>
                <cfg.Icon className="h-4 w-4" />
              </span>
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


// ---------------------------------------------------------------------------
// MetadataRow — reusable row for agent metadata (from DebugSection pattern)
// ---------------------------------------------------------------------------

function MetadataRow({
  icon,
  label,
  value,
  isDark,
  mono,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isDark: boolean;
  mono?: boolean;
  error?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 rounded-md px-2 py-1 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-50'}`}>
      <span className={`mt-0.5 shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {label}
        </div>
        <div
          className={`mt-0.5 text-xs break-all ${mono ? 'font-mono' : ''} ${
            error
              ? isDark ? 'text-rose-300' : 'text-rose-600'
              : isDark ? 'text-zinc-200' : 'text-zinc-800'
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityRow — single execution entry with expand/collapse
// ---------------------------------------------------------------------------

function ActivityRow({ exec, isDark }: { exec: AgentExecution; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AgentExecution | null>(null);
  const [loading, setLoading] = useState(false);

  const active = isActive(exec);

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
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
  }, [expanded, detail, exec.id]);

  // Auto-refresh active executions when expanded
  // Steps now arrive in real-time via WebSocket → exec.steps prop.
  // Only poll as fallback every 5s for expanded active rows.
  useEffect(() => {
    if (!active || !expanded) return;
    const interval = setInterval(async () => {
      try {
        const d = await apiService.getExecutionDetail(exec.id);
        if (d) setDetail(d);
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [active, expanded, exec.id]);

  const displaySteps = detail?.steps || exec.steps || [];

  // Dot color for the timeline
  const dotColor =
    exec.status === 'error'
      ? '#f43f5e'
      : exec.status === 'completed'
        ? '#10b981'
        : '#f59e0b';

  return (
    <div className="relative flex">
      {/* Vertical timeline dot + line */}
      <div className="flex flex-col items-center mr-3 shrink-0" style={{ width: 20 }}>
        <div
          className="w-3 h-3 rounded-full border-2 mt-4 shrink-0"
          style={{
            borderColor: isDark ? '#52525b' : '#a1a1aa',
            backgroundColor: dotColor,
          }}
        />
        <div
          className="flex-1 w-0 border-l-2 border-dashed"
          style={{ borderColor: isDark ? '#3f3f46' : '#d4d4d8' }}
        />
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 border-b ${isDark ? 'border-zinc-800' : 'border-zinc-200'} pb-1`}>
        <button
          type="button"
          onClick={handleToggle}
          className={`w-full flex items-center gap-3 py-3 pr-2 text-left transition ${
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

          {/* Workspace + agentType */}
          <div className={`flex-1 min-w-0 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{exec.workspaceName}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-500'
              }`}>
                {exec.agentType}
              </span>
            </div>
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
            {active ? (
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

        {/* Expanded detail: metadata + step timeline */}
        {expanded && (
          <div className={`pb-3 pt-1 ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'} rounded-lg px-3 mb-2`}>
            {/* Metadata rows */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mb-3">
              <MetadataRow icon={<Layers className="h-3.5 w-3.5" />} label="Agent" value={exec.agentType} isDark={isDark} />
              <MetadataRow icon={<Cpu className="h-3.5 w-3.5" />} label="Model" value={exec.model || '—'} isDark={isDark} mono />
              <MetadataRow icon={<Clock className="h-3.5 w-3.5" />} label="Duration" value={formatDuration(exec.duration)} isDark={isDark} />
              {exec.sessionId && (
                <MetadataRow icon={<Zap className="h-3.5 w-3.5" />} label="Session" value={exec.sessionId} isDark={isDark} mono />
              )}
            </div>
            {exec.error && (
              <div className={`text-xs font-mono break-all mb-3 px-2 py-1.5 rounded-md ${
                isDark ? 'bg-rose-500/10 text-rose-300' : 'bg-rose-50 text-rose-600'
              }`}>
                {exec.error}
              </div>
            )}

            {/* Step timeline */}
            {loading ? (
              <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <Loader2 className="h-3 w-3 animate-spin" /> Loading trace…
              </div>
            ) : displaySteps.length > 0 ? (
              <StepTimeline steps={displaySteps} isDark={isDark} />
            ) : (
              <div className={`text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                No trace steps recorded.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// FilterToggle — "All" | "Errors" | "Active" buttons
// ---------------------------------------------------------------------------

function FilterToggle({
  current,
  onChange,
  isDark,
  errorCount,
  activeCount,
}: {
  current: FilterMode;
  onChange: (mode: FilterMode) => void;
  isDark: boolean;
  errorCount: number;
  activeCount: number;
}) {
  const modes: { key: FilterMode; label: string; accent: string; badge?: number }[] = [
    { key: 'all', label: 'All', accent: 'sky' },
    { key: 'errors', label: 'Errors', accent: 'rose', badge: errorCount },
    { key: 'active', label: 'Active', accent: 'amber', badge: activeCount },
  ];

  const accentClasses: Record<string, { dark: string; light: string }> = {
    sky:   { dark: 'text-sky-400 bg-sky-500/15',     light: 'text-sky-600 bg-sky-50' },
    rose:  { dark: 'text-rose-400 bg-rose-500/15',   light: 'text-rose-600 bg-rose-50' },
    amber: { dark: 'text-amber-400 bg-amber-500/15', light: 'text-amber-600 bg-amber-50' },
  };

  return (
    <div className="inline-flex gap-1.5">
      {modes.map(({ key, label, accent, badge }) => {
        const selected = current === key;
        const ac = accentClasses[accent];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 text-xs font-medium transition-all rounded-lg flex items-center gap-1.5 ${
              selected
                ? isDark ? ac.dark : ac.light
                : isDark
                  ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/60'
            }`}
          >
            {label}
            {badge != null && badge > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                selected
                  ? isDark ? 'bg-white/10' : 'bg-black/10'
                  : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-200 text-zinc-500'
              }`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorSummary — pink panel at top (from LogsSection pattern)
// ---------------------------------------------------------------------------

function ErrorSummary({ errors, isDark }: { errors: AgentExecution[]; isDark: boolean }) {
  if (errors.length === 0) return null;

  return (
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
        {errors.slice(0, 5).map((err) => (
          <div
            key={err.id}
            className={`rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800/60' : 'bg-zinc-50'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  {err.workspaceName}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isDark ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-200 text-zinc-500'
                }`}>
                  {err.agentType}
                </span>
              </div>
              <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {formatDate(err.timestamp)} {formatTime(err.timestamp)}
              </span>
            </div>
            <div className={`text-xs font-mono break-all ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>
              {err.error || 'Unknown error'}
            </div>
            <div className={`mt-1 text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
              {err.model} · {formatDuration(err.duration)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityView — main exported component
// ---------------------------------------------------------------------------

export default function ActivityView({
  executions,
  activeExecutions,
  onRefresh,
  isDark,
}: ActivityViewProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  // Auto-refresh active executions every 5s (fallback — WebSocket handles real-time)
  useEffect(() => {
    if (activeExecutions.length === 0) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeExecutions.length, onRefresh]);

  // Merge active + recent, active first, deduplicate by id
  const seen = new Set<string>();
  const all: AgentExecution[] = [];
  for (const e of activeExecutions) {
    if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
  }
  for (const e of executions) {
    if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
  }

  const errors = all.filter((e) => e.status === 'error');

  // Apply filter
  const filtered =
    filter === 'errors'
      ? all.filter((e) => e.status === 'error')
      : filter === 'active'
        ? all.filter((e) => isActive(e))
        : all;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Activity
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
      <p className={`text-sm mb-4 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Unified view of agent executions, metadata and errors. Click to expand details.
      </p>

      {/* Error summary panel */}
      <ErrorSummary errors={errors} isDark={isDark} />

      {/* Active executions highlight */}
      {activeExecutions.length > 0 && (
        <div className={`mb-4 rounded-xl border p-3 ${
          isDark ? 'border-amber-800/50 bg-amber-500/10' : 'border-amber-200 bg-amber-50'
        }`}>
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
            <span className={`text-sm font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              {activeExecutions.length} active execution{activeExecutions.length > 1 ? 's' : ''}
            </span>
            <span className={`text-[10px] ${isDark ? 'text-amber-400/60' : 'text-amber-600/60'}`}>
              auto-refreshing
            </span>
          </div>
        </div>
      )}

      {/* Filter toggles */}
      <div className="flex items-center gap-3 mb-4">
        <FilterToggle
          current={filter}
          onChange={setFilter}
          isDark={isDark}
          errorCount={errors.length}
          activeCount={activeExecutions.length}
        />
      </div>

      {/* Execution list with vertical timeline */}
      {filtered.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-xl border py-12 ${
          isDark ? 'border-zinc-800 bg-zinc-800/60 text-zinc-600' : 'border-zinc-300 bg-zinc-200 text-zinc-500'
        }`}>
          <Activity className="mb-2 h-6 w-6" />
          <p className="text-sm">
            {filter === 'all'
              ? 'No executions yet. Send a message to see activity.'
              : filter === 'errors'
                ? 'No errors found.'
                : 'No active executions.'}
          </p>
        </div>
      ) : (
        <div className={`rounded-xl border overflow-hidden px-4 pt-2 pb-2 ${
          isDark ? 'border-zinc-800' : 'border-zinc-200'
        }`}>
          {filtered.map((exec) => (
            <ActivityRow key={exec.id} exec={exec} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
}
