import { useState, useEffect } from 'react';
import { X, Bug, Cpu, Coins, Layers, Zap, Hash, Clock, Radio } from 'lucide-react';
import { apiService, type Message, type MessageMetadata } from './api';

interface DebugPanelProps {
  messages: Message[];
  onClose: () => void;
  isDark: boolean;
  chatFolder?: string | null;
}

interface MetadataRowProps {
  icon: React.ReactNode;
  label: string;
  value: string | number | undefined | null;
  isDark: boolean;
  mono?: boolean;
}

function MetadataRow({ icon, label, value, isDark, mono }: MetadataRowProps) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'}`}>
      <span className={`mt-0.5 shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {label}
        </div>
        <div className={`mt-0.5 text-sm ${mono ? 'font-mono' : ''} ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function formatCost(cost: number | undefined): string | undefined {
  if (cost === undefined || cost === null) return undefined;
  if (cost === 0) return '$0.00';
  if (cost < 0.001) return `$${cost.toFixed(6)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(4)}`;
}

function MetadataCard({ metadata, timestamp, isDark }: { metadata: MessageMetadata; timestamp: string; isDark: boolean }) {
  const tokens = metadata.tokens;

  return (
    <div className={`rounded-lg border ${isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'}`}>
      <div className="space-y-0.5 p-1">
        <MetadataRow icon={<Layers className="h-3.5 w-3.5" />} label="Agent" value={metadata.agent} isDark={isDark} />
        <MetadataRow icon={<Cpu className="h-3.5 w-3.5" />} label="Model" value={metadata.modelID} isDark={isDark} mono />
        <MetadataRow icon={<Zap className="h-3.5 w-3.5" />} label="Provider" value={metadata.providerID} isDark={isDark} mono />
        <MetadataRow icon={<Hash className="h-3.5 w-3.5" />} label="Mode" value={metadata.mode} isDark={isDark} />

        {tokens && (
          <div className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'}`}>
            <span className={`mt-0.5 shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <Hash className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Tokens
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <span className={isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                  <span className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>in </span>
                  {tokens.input?.toLocaleString() ?? '—'}
                </span>
                <span className={isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                  <span className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>out </span>
                  {tokens.output?.toLocaleString() ?? '—'}
                </span>
                {tokens.reasoning > 0 && (
                  <span className={isDark ? 'text-purple-400' : 'text-purple-600'}>
                    <span className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>reasoning </span>
                    {tokens.reasoning.toLocaleString()}
                  </span>
                )}
                <span className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>
                  <span className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>total </span>
                  {tokens.total?.toLocaleString() ?? '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        <MetadataRow icon={<Coins className="h-3.5 w-3.5" />} label="Cost" value={formatCost(metadata.cost)} isDark={isDark} mono />
      </div>

      <div className={`border-t px-3 py-1.5 text-[10px] ${isDark ? 'border-zinc-800 text-zinc-600' : 'border-zinc-200 text-zinc-400'}`}>
        {new Date(timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default function DebugPanel({ messages, onClose, isDark, chatFolder }: DebugPanelProps) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Update timestamp whenever messages change
  useEffect(() => {
    setLastRefreshedAt(new Date());
  }, [messages]);

  // Poll sessions every 5s to get live session ID
  useEffect(() => {
    if (!chatFolder) { setSessionId(null); return; }

    let cancelled = false;
    const fetchSession = async () => {
      try {
        const sessions = await apiService.getSessions();
        if (!cancelled) setSessionId(sessions[chatFolder] ?? null);
      } catch { /* ignore */ }
    };

    void fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [chatFolder]);

  // Only show bot messages with metadata
  const botMessages = messages.filter((m) => m.is_bot_message && m.metadata);

  // Always show the latest response
  const activeMsg = botMessages[botMessages.length - 1];

  // Aggregate stats
  const totalCost = botMessages.reduce((sum, m) => sum + (m.metadata?.cost ?? 0), 0);
  const totalTokens = botMessages.reduce((sum, m) => {
    const t = m.metadata?.tokens;
    return sum + (t?.total ?? ((t?.input ?? 0) + (t?.output ?? 0)));
  }, 0);

  return (
    <aside className={`flex w-72 shrink-0 flex-col border-l ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
      {/* Header */}
      <div className={`flex h-16 items-center justify-between border-b px-4 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <div className="flex items-center gap-2">
          <Bug className={`h-4 w-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <div>
            <h2 className="text-sm font-semibold">Debug</h2>
            <div className={`flex items-center gap-1 text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <Clock className="h-2.5 w-2.5" />
              <span>Last update: {lastRefreshedAt.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition ${isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Live Session ID */}
      <div className={`flex items-center gap-2.5 border-b px-4 py-2.5 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <Radio className={`h-3.5 w-3.5 shrink-0 ${sessionId ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-zinc-600' : 'text-zinc-400')}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Session
          </div>
          <div className={`mt-0.5 truncate font-mono text-xs ${sessionId ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-zinc-600' : 'text-zinc-400')}`} title={sessionId ?? undefined}>
            {sessionId ?? 'No active session'}
          </div>
        </div>
      </div>

      {/* Aggregate stats bar */}
      {botMessages.length > 0 && (
        <div className={`flex items-center gap-3 border-b px-4 py-2.5 text-[11px] ${isDark ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400' : 'border-zinc-200 bg-zinc-100 text-zinc-500'}`}>
          <span title="Total responses">{botMessages.length} responses</span>
          <span className={isDark ? 'text-zinc-700' : 'text-zinc-300'}>|</span>
          <span title="Total tokens">{totalTokens.toLocaleString()} tok</span>
          {totalCost > 0 && (
            <>
              <span className={isDark ? 'text-zinc-700' : 'text-zinc-300'}>|</span>
              <span title="Total cost">{formatCost(totalCost)}</span>
            </>
          )}
        </div>
      )}

      {/* Content — always show latest response only */}
      <div className="flex-1 overflow-y-auto">
        {!activeMsg?.metadata ? (
          <div className={`flex flex-col items-center justify-center h-full px-4 text-center ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
            <Bug className="mb-2 h-6 w-6" />
            <p className="text-xs">No metadata yet</p>
            <p className="mt-1 text-[10px]">Send a message to see agent debug info</p>
          </div>
        ) : (
          <div className="p-3">
            <MetadataCard metadata={activeMsg.metadata} timestamp={activeMsg.timestamp} isDark={isDark} />
          </div>
        )}
      </div>
    </aside>
  );
}
