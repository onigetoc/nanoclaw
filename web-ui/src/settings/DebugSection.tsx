import { Bug, Cpu, Coins, Hash, Layers, Zap } from 'lucide-react';
import type { AgentExecution } from '../api';

interface DebugSectionProps {
  executions: AgentExecution[];
  isDark: boolean;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function DebugSection({ executions, isDark }: DebugSectionProps) {
  // Show last 5 completed executions with metadata
  const recent = executions.filter((e) => e.status === 'completed' || e.status === 'error').slice(0, 5);

  return (
    <div>
      <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        Debug
      </h1>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Agent metadata and execution details.
      </p>

      {recent.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center rounded-xl border py-12 ${
            isDark ? 'border-zinc-800 bg-zinc-900/80 text-zinc-600' : 'border-zinc-200 bg-white text-zinc-400'
          }`}
        >
          <Bug className="mb-2 h-6 w-6" />
          <p className="text-sm">No executions yet</p>
          <p className="mt-1 text-[10px]">Send a message to see agent debug info</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recent.map((exec) => (
            <div
              key={exec.id}
              className={`rounded-xl border p-4 ${
                isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium ${
                      exec.status === 'completed'
                        ? isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                        : isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {exec.status}
                  </span>
                  <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    {exec.groupName}
                  </span>
                </div>
                <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {new Date(exec.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div className="space-y-1.5">
                <Row icon={<Layers className="h-3.5 w-3.5" />} label="Agent" value={exec.agentType} isDark={isDark} />
                <Row icon={<Cpu className="h-3.5 w-3.5" />} label="Model" value={exec.model} isDark={isDark} mono />
                <Row icon={<Hash className="h-3.5 w-3.5" />} label="Duration" value={formatDuration(exec.duration)} isDark={isDark} />
                {exec.sessionId && (
                  <Row icon={<Zap className="h-3.5 w-3.5" />} label="Session" value={exec.sessionId} isDark={isDark} mono />
                )}
                {exec.error && (
                  <Row icon={<Coins className="h-3.5 w-3.5" />} label="Error" value={exec.error} isDark={isDark} error />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  icon, label, value, isDark, mono, error,
}: {
  icon: React.ReactNode; label: string; value: string; isDark: boolean; mono?: boolean; error?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3 py-1.5 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-50'}`}>
      <span className={`mt-0.5 shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {label}
        </div>
        <div
          className={`mt-0.5 text-sm break-all ${mono ? 'font-mono text-xs' : ''} ${
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
