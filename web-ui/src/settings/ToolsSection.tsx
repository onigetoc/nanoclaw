import { useState, useEffect } from 'react';
import { apiService, type OpenCodeStatus, type SkillInfo, type AgentInfo } from '../api';

interface ToolsSectionProps {
  isDark: boolean;
}

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

function SectionCard({ title, count, isDark, children }: {
  title: string; count: number; isDark: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-5 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{title}</h3>
        <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{count} total</span>
      </div>
      {children}
    </div>
  );
}

export default function ToolsSection({ isDark }: ToolsSectionProps) {
  const [status, setStatus] = useState<OpenCodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiService.getOpenCodeStatus();
        if (!cancelled) { setStatus(data); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

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

  const emptyRow = (msg: string) => (
    <div className={`py-3 text-center text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>{msg}</div>
  );

  return (
    <div className="space-y-6">
      {/* Skills */}
      <SectionCard title="🛠 Skills" count={status.skills.length} isDark={isDark}>
        {status.skills.length === 0 ? emptyRow('No skills discovered') : (
          <div className="space-y-1.5">
            {status.skills.map((sk) => {
              const src = sourceLabel(sk.source);
              return (
                <div key={sk.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{sk.name}</span>
                    <p className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{sk.description}</p>
                  </div>
                  <Badge label={src.label} color={src.color} isDark={isDark} />
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Agents */}
      <SectionCard title="🤖 Agents" count={status.agents.length} isDark={isDark}>
        {status.agents.length === 0 ? emptyRow('No agents found') : (
          <div className="space-y-1.5">
            {status.agents.map((ag) => {
              const mode = agentModeLabel(ag.mode);
              const src = agentSourceLabel(ag.source);
              return (
                <div key={ag.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{ag.name}</span>
                    <p className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{ag.description}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge label={mode.label} color={mode.color} isDark={isDark} />
                    <Badge label={src.label} color={src.color} isDark={isDark} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Plugins & MCP side by side */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Plugins */}
        <SectionCard title="🔌 Plugins" count={status.plugins.length} isDark={isDark}>
          {status.plugins.length === 0 ? emptyRow('No plugins installed') : (
            <div className="space-y-1.5">
              {status.plugins.map((p) => (
                <div key={p.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                  <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{p.name}</span>
                  {p.version && <Badge label={`v${p.version}`} color="zinc" isDark={isDark} />}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* MCP Servers */}
        <SectionCard title="🔗 MCP Servers" count={status.mcpServers.length} isDark={isDark}>
          {status.mcpServers.length === 0 ? emptyRow('No MCP servers configured') : (
            <div className="space-y-1.5">
              {status.mcpServers.map((m) => (
                <div key={m.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{m.name}</span>
                    {m.command && <p className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{m.command}</p>}
                  </div>
                  <Badge label={m.disabled ? 'Disabled' : 'Active'} color={m.disabled ? 'rose' : 'emerald'} isDark={isDark} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
