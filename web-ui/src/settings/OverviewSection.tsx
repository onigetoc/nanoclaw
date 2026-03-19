import { Activity, Clock, Cpu, Users, Moon, Shield, AlertTriangle, Container, CheckCircle, XCircle } from 'lucide-react';
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
  // Show loading state while data is being fetched
  if (!data) {
    return (
      <div>
        <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Overview
        </h1>
        <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
          System status and quick health read.
        </p>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        </div>
      </div>
    );
  }

  const sys = data.system;
  const stats = data.stats;
  const sysInfo = data.systemInfo;

  // Determine container mode display
  const getContainerModeDisplay = () => {
    if (!sysInfo) return null;
    
    const modeLabels = {
      'apple-container': 'Apple Container',
      'docker': 'Docker',
      'direct': 'Direct Mode',
    };
    
    const modeIcons = {
      'apple-container': <Container className="h-4 w-4" />,
      'docker': <Container className="h-4 w-4" />,
      'direct': <AlertTriangle className="h-4 w-4" />,
    };
    
    return {
      label: modeLabels[sysInfo.containerMode],
      icon: modeIcons[sysInfo.containerMode],
    };
  };

  const containerMode = getContainerModeDisplay();

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
          label="Workspaces"
          value={sys?.registeredWorkspaces ?? '—'}
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

      {/* System Info & Sessions - 2 columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* System Info Card */}
        {sysInfo && (
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
              System Information
            </h3>
            
            {/* Grid 2x2 responsive */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {/* Platform */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Platform
                </span>
                <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  {sysInfo.platformName}
                </span>
              </div>

              {/* Container Mode */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Container Mode
                </span>
                <div className="flex items-center gap-2">
                  {containerMode && (
                    <span
                      className={
                        sysInfo.containerMode === 'direct'
                          ? isDark ? 'text-amber-400' : 'text-amber-600'
                          : isDark ? 'text-emerald-400' : 'text-emerald-600'
                      }
                    >
                      {containerMode.icon}
                    </span>
                  )}
                  <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    {containerMode?.label}
                  </span>
                </div>
              </div>

              {/* Security Level */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Security Level
                </span>
                <div className="flex items-center gap-2">
                  <Shield
                    className={`h-4 w-4 ${
                      sysInfo.securityLevel === 'high'
                        ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                        : sysInfo.securityLevel === 'medium'
                          ? isDark ? 'text-amber-400' : 'text-amber-600'
                          : isDark ? 'text-rose-400' : 'text-rose-600'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium capitalize ${
                      sysInfo.securityLevel === 'high'
                        ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                        : sysInfo.securityLevel === 'medium'
                          ? isDark ? 'text-amber-400' : 'text-amber-600'
                          : isDark ? 'text-rose-400' : 'text-rose-600'
                    }`}
                  >
                    {sysInfo.securityLevel}
                  </span>
                </div>
              </div>

              {/* Docker Status (Windows/Linux only) */}
              {sysInfo.platform !== 'darwin' && sysInfo.dockerInstalled !== undefined && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Docker Status
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      sysInfo.dockerFunctional === true
                        ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                        : sysInfo.dockerFunctional === false
                          ? isDark ? 'text-rose-400' : 'text-rose-600'
                          : isDark ? 'text-amber-400' : 'text-amber-600'
                    }`}
                  >
                    {sysInfo.dockerInstalled
                      ? sysInfo.dockerFunctional === true
                        ? 'Functional'
                        : sysInfo.dockerFunctional === false
                          ? 'Not Functional'
                          : sysInfo.dockerRunning
                            ? 'Running'
                            : 'Not Running'
                      : 'Not Installed'}
                  </span>
                </div>
              )}

              {/* Node.js Version */}
              {sysInfo.nodeVersion && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Node.js
                  </span>
                  <span className={`text-sm font-medium font-mono ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    {sysInfo.nodeVersion}
                  </span>
                </div>
              )}

              {/* OpenCode Version & Status */}
              {(sysInfo.opencodeVersion || sysInfo.opencodeFunctional !== undefined) && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    OpenCode
                  </span>
                  <div className="flex items-center gap-2">
                    {sysInfo.opencodeFunctional !== undefined && (
                      sysInfo.opencodeFunctional ? (
                        <CheckCircle className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      ) : (
                        <XCircle className={`h-4 w-4 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
                      )
                    )}
                    <span
                      className={`text-sm font-medium font-mono ${
                        sysInfo.opencodeFunctional
                          ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                          : isDark ? 'text-rose-400' : 'text-rose-600'
                      }`}
                    >
                      {sysInfo.opencodeVersion || (sysInfo.opencodeFunctional ? 'Installed' : 'Not Found')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Recommendation (full width) */}
            {sysInfo.recommendation && (
              <div
                className={`rounded-lg border p-3 ${
                  isDark
                    ? 'border-amber-800/50 bg-amber-500/10'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                      isDark ? 'text-amber-400' : 'text-amber-600'
                    }`}
                  />
                  <p
                    className={`text-xs ${
                      isDark ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  >
                    {sysInfo.recommendation}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sessions */}
        {data.sessions && Object.keys(data.sessions).length > 0 && (
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
    </div>
  );
}
