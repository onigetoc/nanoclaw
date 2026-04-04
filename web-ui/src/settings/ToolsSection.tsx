import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Wrench,
  Link,
  Puzzle,
} from 'lucide-react';
import { apiService, type OpenCodeStatus, type SkillInfo, type AgentInfo } from '../api';

interface ToolsSectionProps {
  isDark: boolean;
}

type ToolsTab = 'agents' | 'skills' | 'mcp' | 'plugins';

function Badge({ label, color, isDark }: { label: string; color: string; isDark: boolean }) {
  const colors: Record<string, string> = {
    emerald: isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
    blue: isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700',
    amber: isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700',
    purple: isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700',
    zinc: isDark ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-200 text-zinc-600',
    rose: isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[color] || colors.zinc}`}>
      {label}
    </span>
  );
}

function sourceLabel(source: SkillInfo['source']): { label: string; color: string } {
  switch (source) {
    case 'project': return { label: 'Project', color: 'emerald' };
    case 'project-claude': return { label: 'Project (Claude)', color: 'blue' };
    case 'global': return { label: 'Global', color: 'purple' };
    case 'global-claude': return { label: 'Global (Claude)', color: 'amber' };
  }
}

function agentModeLabel(mode: string): { label: string; color: string } {
  if (mode === 'primary') return { label: 'Primary', color: 'emerald' };
  return { label: 'Subagent', color: 'blue' };
}

function agentSourceLabel(source: AgentInfo['source']): { label: string; color: string } {
  switch (source) {
    case 'config': return { label: 'Config', color: 'amber' };
    case 'file': return { label: 'File', color: 'purple' };
    case 'registry': return { label: 'Registry', color: 'zinc' };
  }
}

/* ------------------------------------------------------------------ */
/* Toggle Switch                                                       */
/* ------------------------------------------------------------------ */

function ToggleSwitch({
  enabled,
  onToggle,
  isDark,
  busy,
}: {
  enabled: boolean;
  onToggle: () => void;
  isDark: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        busy ? 'opacity-50 cursor-wait' : ''
      } ${enabled
        ? 'bg-emerald-500'
        : isDark ? 'bg-zinc-600' : 'bg-zinc-300'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tab Bar                                                             */
/* ------------------------------------------------------------------ */

function TabBar({
  current,
  onChange,
  isDark,
  counts,
}: {
  current: ToolsTab;
  onChange: (tab: ToolsTab) => void;
  isDark: boolean;
  counts: Record<ToolsTab, number>;
}) {
  const tabs: { key: ToolsTab; label: string; Icon: React.ComponentType<{ className?: string }>; accent: string }[] = [
    { key: 'agents', label: 'Agents', Icon: Bot, accent: 'emerald' },
    { key: 'skills', label: 'Skills', Icon: Wrench, accent: 'blue' },
    { key: 'mcp', label: 'MCP', Icon: Link, accent: 'purple' },
    { key: 'plugins', label: 'Plugins', Icon: Puzzle, accent: 'amber' },
  ];

  const accentClasses: Record<string, { dark: string; light: string }> = {
    emerald: { dark: 'text-emerald-400 bg-emerald-500/15', light: 'text-emerald-600 bg-emerald-50' },
    blue:    { dark: 'text-blue-400 bg-blue-500/15',       light: 'text-blue-600 bg-blue-50' },
    purple:  { dark: 'text-purple-400 bg-purple-500/15',   light: 'text-purple-600 bg-purple-50' },
    amber:   { dark: 'text-amber-400 bg-amber-500/15',     light: 'text-amber-600 bg-amber-50' },
  };

  return (
    <div className="inline-flex gap-1.5">
      {tabs.map(({ key, label, Icon, accent }) => {
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
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                selected
                  ? isDark ? 'bg-white/10' : 'bg-black/10'
                  : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-200 text-zinc-500'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab Content Panels                                                  */
/* ------------------------------------------------------------------ */

function EmptyRow({ msg, isDark }: { msg: string; isDark: boolean }) {
  return (
    <div className={`py-8 text-center text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
      {msg}
    </div>
  );
}

function AgentsPanel({ agents, isDark }: { agents: AgentInfo[]; isDark: boolean }) {
  if (agents.length === 0) return <EmptyRow msg="No agents found" isDark={isDark} />;
  return (
    <div className="space-y-1.5">
      {agents.map((ag) => {
        const mode = agentModeLabel(ag.mode);
        const src = agentSourceLabel(ag.source);
        return (
          <div
            key={ag.name}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
              isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'
            }`}
          >
            <div className="min-w-0 flex-1">
              <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {ag.name}
              </span>
              <p className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {ag.description}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0 ml-2">
              <Badge label={mode.label} color={mode.color} isDark={isDark} />
              <Badge label={src.label} color={src.color} isDark={isDark} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkillsPanel({ skills, isDark }: { skills: SkillInfo[]; isDark: boolean }) {
  if (skills.length === 0) return <EmptyRow msg="No skills discovered" isDark={isDark} />;
  return (
    <div className="space-y-1.5">
      {skills.map((sk) => {
        const src = sourceLabel(sk.source);
        return (
          <div
            key={sk.name}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
              isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'
            }`}
          >
            <div className="min-w-0 flex-1">
              <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {sk.name}
              </span>
              <p className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {sk.description}
              </p>
            </div>
            <Badge label={src.label} color={src.color} isDark={isDark} />
          </div>
        );
      })}
    </div>
  );
}

function McpPanel({
  servers,
  isDark,
  onToggle,
  busyServers,
}: {
  servers: OpenCodeStatus['mcpServers'];
  isDark: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  busyServers: Set<string>;
}) {
  if (servers.length === 0) return <EmptyRow msg="No MCP servers configured" isDark={isDark} />;
  return (
    <div className="space-y-1.5">
      {servers.map((m) => (
        <div
          key={m.name}
          className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'
          }`}
        >
          <div className="min-w-0 flex-1">
            <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {m.name}
            </span>
            {m.command && (
              <p className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {m.command}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className={`text-[10px] ${
              m.disabled
                ? isDark ? 'text-rose-400' : 'text-rose-500'
                : isDark ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              {m.disabled ? 'Off' : 'On'}
            </span>
            <ToggleSwitch
              enabled={!m.disabled}
              onToggle={() => onToggle(m.name, m.disabled)}
              isDark={isDark}
              busy={busyServers.has(m.name)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PluginsPanel({ plugins, isDark }: { plugins: OpenCodeStatus['plugins']; isDark: boolean }) {
  if (plugins.length === 0) return <EmptyRow msg="No plugins installed" isDark={isDark} />;
  return (
    <div className="space-y-1.5">
      {plugins.map((p) => (
        <div
          key={p.name}
          className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'
          }`}
        >
          <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            {p.name}
          </span>
          {p.version && <Badge label={`v${p.version}`} color="zinc" isDark={isDark} />}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function ToolsSection({ isDark }: ToolsSectionProps) {
  const [status, setStatus] = useState<OpenCodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ToolsTab>('agents');
  const [busyServers, setBusyServers] = useState<Set<string>>(new Set());

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiService.getOpenCodeStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleMcpToggle = useCallback(async (name: string, currentlyDisabled: boolean) => {
    setBusyServers((prev) => new Set(prev).add(name));
    try {
      await apiService.toggleMcpServer(name, currentlyDisabled); // enable if currently disabled
      // Optimistic update
      setStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          mcpServers: prev.mcpServers.map((m) =>
            m.name === name ? { ...m, disabled: !currentlyDisabled } : m
          ),
        };
      });
    } catch (err) {
      // Reload on error to get real state
      void loadStatus();
    } finally {
      setBusyServers((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }, [loadStatus]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-20 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
        Loading tools status...
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className={`rounded-xl border p-6 text-center ${isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-200 text-zinc-500'}`}>
        {error || 'No data available'}
      </div>
    );
  }

  const counts: Record<ToolsTab, number> = {
    agents: status.agents.length,
    skills: status.skills.length,
    mcp: status.mcpServers.length,
    plugins: status.plugins.length,
  };

  return (
    <div>
      {/* Sticky tab bar — pt-6 fills the parent's py-6 gap so content can't peek above */}
      <div
        className={`sticky -top-6 z-20 pt-6 pb-4 ${
          isDark ? 'bg-zinc-900' : 'bg-zinc-100'
        }`}
      >
        <TabBar current={activeTab} onChange={setActiveTab} isDark={isDark} counts={counts} />
      </div>

      {/* Content */}
      <div>
        {activeTab === 'agents' && <AgentsPanel agents={status.agents} isDark={isDark} />}
        {activeTab === 'skills' && <SkillsPanel skills={status.skills} isDark={isDark} />}
        {activeTab === 'mcp' && (
          <McpPanel
            servers={status.mcpServers}
            isDark={isDark}
            onToggle={handleMcpToggle}
            busyServers={busyServers}
          />
        )}
        {activeTab === 'plugins' && <PluginsPanel plugins={status.plugins} isDark={isDark} />}
      </div>
    </div>
  );
}
