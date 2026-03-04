import { Activity, Clock, Cpu, Users, Moon } from 'lucide-react';
import type { MonitoringData } from '../api';

interface OverviewSectionProps {
  data: MonitoringData | null;
  serverOnline: boolean;
  isDark: boolean;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  isDark,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={color || (isDark ? 'text-zinc-500' : 'text-zinc-400')}>{icon}</span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            isDark ? 'text-zinc-500' : 'text-zinc-400'
          }`}
        >
          {label}
        </span>
      </div>
      <div className={`text-2xl font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        {value}
      </div>
      {sub && (
        <div className={`mt-1 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>{sub}</div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function OverviewSection({ data, serverOnline, isDark }: OverviewSectionProps) {
  const sys = data?.system;
  const stats = data?.stats;

  return (
    <div>
      <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        Overview
      </h1>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        System status and quick health read.
      </p>

      {/* Status banner */}
      <div
        className={`mb-6 flex items-center gap-3 rounded-xl border p-4 ${
          serverOnline
            ? isDark
              ? 'border-emerald-800/50 bg-emerald-500/10'
              : 'border-emerald-200 bg-emerald-50'
            : isDark
              ? 'border-rose-800/50 bg-rose-500/10'
              : 'border-rose-200 bg-rose-50'
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full ${
            serverOnline
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
              : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]'
          }`}
        />
        <span
          className={`text-sm font-medium ${
            serverOnline
              ? isDark ? 'text-emerald-300' : 'text-emerald-700'
              : isDark ? 'text-rose-300' : 'text-rose-700'
          }`}
        >
          {serverOnline ? 'Connected' : 'Server Offline'}
        </span>
        {sys?.isSleeping && (
          <span className={`ml-auto flex items-center gap-1 text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
            <Moon className="h-3.5 w-3.5" /> Sleeping
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Uptime"
          value={sys ? formatUptime(sys.uptime) : '—'}
          isDark={isDark}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Groups"
          value={sys?.registeredGroups ?? '—'}
          isDark={isDark}
        />
        <StatCard
          icon={<Cpu className="h-4 w-4" />}
          label="Active Agents"
          value={sys?.activeAgents ?? 0}
          isDark={isDark}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Executions"
          value={stats?.totalExecutions ?? 0}
          sub={stats ? `${stats.successRate.toFixed(0)}% success` : undefined}
          isDark={isDark}
        />
      </div>

      {/* Sessions */}
      {data?.sessions && Object.keys(data.sessions).length > 0 && (
        <div
          className={`rounded-xl border p-4 ${
            isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'
          }`}
        >
          <h3
            className={`mb-3 text-xs font-semibold uppercase tracking-wider ${
              isDark ? 'text-zinc-500' : 'text-zinc-400'
            }`}
          >
            Active Sessions
          </h3>
          <div className="space-y-2">
            {Object.entries(data.sessions).map(([folder, sessionId]) => (
              <div
                key={folder}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  isDark ? 'bg-zinc-800/60' : 'bg-zinc-100'
                }`}
              >
                <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  {folder}
                </span>
                <span
                  className={`truncate max-w-[200px] font-mono text-xs ${
                    isDark ? 'text-emerald-400' : 'text-emerald-600'
                  }`}
                  title={sessionId}
                >
                  {sessionId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
