import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bug,
  Cpu,
  Coins,
  Layers,
  Zap,
  Hash,
  Clock,
  Radio,
} from 'lucide-react';
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
    <div
      className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'}`}
    >
      <span
        className={`mt-0.5 shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
        >
          {label}
        </div>
        <div
          className={`mt-0.5 text-sm ${mono ? 'font-mono' : ''} ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}
        >
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
/** SVG circle showing context window usage percentage */
function ContextCircle({ percent, isDark }: { percent: number; isDark: boolean }) {
  const size = 56;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  const color =
    percent >= 80
      ? isDark ? '#f87171' : '#dc2626'
      : percent >= 50
        ? isDark ? '#fbbf24' : '#d97706'
        : isDark ? '#34d399' : '#059669';

  const trackColor = isDark ? '#27272a' : '#e4e4e7';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-[11px] font-semibold" style={{ color }}>
        {percent}%
      </span>
    </div>
  );
}

function MetadataCard({
  metadata,
  timestamp,
  isDark,
}: {
  metadata: MessageMetadata;
  timestamp: string;
  isDark: boolean;
}) {
  const tokens = metadata.tokens;

  return (
    <div
      className={`rounded-lg border ${isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-300 bg-zinc-100'}`}
    >
      <div className="space-y-0.5 p-1">
        <MetadataRow
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Agent"
          value={metadata.agent}
          isDark={isDark}
        />
        <MetadataRow
          icon={<Cpu className="h-3.5 w-3.5" />}
          label="Model"
          value={metadata.modelID}
          isDark={isDark}
          mono
        />
        <MetadataRow
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Provider"
          value={metadata.providerID}
          isDark={isDark}
          mono
        />
        <MetadataRow
          icon={<Hash className="h-3.5 w-3.5" />}
          label="Mode"
          value={metadata.mode}
          isDark={isDark}
        />

        {tokens && (
          <div
            className={`flex items-start gap-2.5 rounded-md px-3 py-2 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'}`}
          >
            <span
              className={`mt-0.5 shrink-0 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
            >
              <Hash className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
              >
                Tokens
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <span className={isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                  <span
                    className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
                  >
                    in{' '}
                  </span>
                  {tokens.input?.toLocaleString() ?? '—'}
                </span>
                <span className={isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                  <span
                    className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
                  >
                    out{' '}
                  </span>
                  {tokens.output?.toLocaleString() ?? '—'}
                </span>
                {tokens.reasoning > 0 && (
                  <span
                    className={isDark ? 'text-purple-400' : 'text-purple-600'}
                  >
                    <span
                      className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
                    >
                      reasoning{' '}
                    </span>
                    {tokens.reasoning.toLocaleString()}
                  </span>
                )}
                {(tokens.cacheRead ?? 0) > 0 && (
                  <span
                    className={isDark ? 'text-sky-400' : 'text-sky-600'}
                  >
                    <span
                      className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
                    >
                      cached{' '}
                    </span>
                    {(tokens.cacheRead ?? 0).toLocaleString()}
                  </span>
                )}
                <span
                  className={isDark ? 'text-emerald-400' : 'text-emerald-600'}
                >
                  <span
                    className={`text-[10px] uppercase ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
                  >
                    used{' '}
                  </span>
                  {(tokens.input + tokens.output + tokens.reasoning).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        <MetadataRow
          icon={<Coins className="h-3.5 w-3.5" />}
          label="Cost"
          value={formatCost(metadata.cost)}
          isDark={isDark}
          mono
        />
      </div>

      <div
        className={`border-t px-3 py-1.5 text-[10px] ${isDark ? 'border-zinc-800 text-zinc-600' : 'border-zinc-200 text-zinc-400'}`}
      >
        {new Date(timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default function DebugPanel({
  messages,
  onClose,
  isDark,
  chatFolder,
}: DebugPanelProps) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(null);
  const [contextLimitMap, setContextLimitMap] = useState<Record<string, number>>({});

  // Fetch context window limit from OpenCode providers (once)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiService.getOpenCodeProviders();
        if (cancelled) return;
        // Find the active model's context limit from any provider
        const allModels = (data.providers || []).flatMap((p: any) =>
          Object.values(p.models || {}) as any[]
        );
        // We'll match against the latest metadata modelID later
        // For now store the full map and pick the biggest reasonable default
        // Actually, store all limits keyed by model ID
        const limitMap: Record<string, number> = {};
        for (const m of allModels) {
          if (m.id && m.limit?.context) limitMap[m.id] = m.limit.context;
        }
        // Store in a ref-like pattern via state
        setContextLimitMap(limitMap);
      } catch { /* OpenCode server not available */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Update timestamp whenever messages change
  useEffect(() => {
    setLastRefreshedAt(new Date());
    
    // Detect if message history was cleared (e.g., /new command)
    if (messages.length < lastMessageCount) {
      console.log('📊 Message history cleared, resetting stats');
    }
    setLastMessageCount(messages.length);
  }, [messages, lastMessageCount]);

  // Poll sessions every 5s to get live session ID
  useEffect(() => {
    if (!chatFolder) {
      setSessionId(null);
      return;
    }

    let cancelled = false;
    const fetchSession = async () => {
      try {
        const sessions = await apiService.getSessions();
        if (!cancelled) {
          const newSessionId = sessions[chatFolder] ?? null;
          // Detect session change
          if (newSessionId && previousSessionId && newSessionId !== previousSessionId) {
            console.log('🔄 Session changed, resetting stats');
          }
          setPreviousSessionId(newSessionId);
          setSessionId(newSessionId);
        }
      } catch {
        /* ignore */
      }
    };

    void fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatFolder, previousSessionId]);

  // Find the index of the last /new command
  let lastNewIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].content.trim() === '/new' || messages[i].content.includes('New session created')) {
      lastNewIndex = i;
      break;
    }
  }

  // Only count messages AFTER the last /new command
  const messagesAfterNew = lastNewIndex >= 0 ? messages.slice(lastNewIndex + 1) : messages;
  
  // Only show bot messages with metadata from messages after /new
  const botMessages = messagesAfterNew.filter((m) => m.is_bot_message && m.metadata);

  // Always show the latest response
  const activeMsg = botMessages[botMessages.length - 1];

  // Aggregate stats from messages after /new only
  const totalCost = botMessages.reduce(
    (sum, m) => sum + (m.metadata?.cost ?? 0),
    0,
  );
  const totalUsed = botMessages.reduce((sum, m) => {
    const t = m.metadata?.tokens;
    if (!t) return sum;
    return sum + t.input + t.output + t.reasoning;
  }, 0);
  const totalCached = botMessages.reduce((sum, m) => {
    return sum + (m.metadata?.tokens?.cacheRead ?? 0);
  }, 0);
  const responseCount = botMessages.length;

  // Compute context usage percentage
  // Use the HIGHEST tokens.input seen in the session — this represents the peak
  // context window usage. Each OpenCode response's tokens.input = total context
  // sent to the model for that turn (prompt + full history). It should grow over
  // the session; if it dips, OpenCode may have compacted, but the peak is what
  // matters for knowing how close we are to the limit.
  const contextInfo = useMemo(() => {
    if (botMessages.length === 0) return { percent: 0, inputTokens: 0, limit: 0, lastInput: 0 };

    // Find peak context size and also keep the latest for display
    // Context size = input + cacheRead (cached tokens are still part of the context window)
    let peakInput = 0;
    let lastInput = 0;
    let modelId: string | undefined;
    for (const m of botMessages) {
      const inp = (m.metadata?.tokens?.input ?? 0) + (m.metadata?.tokens?.cacheRead ?? 0);
      if (inp > peakInput) peakInput = inp;
      lastInput = inp;
      if (m.metadata?.modelID) modelId = m.metadata.modelID;
    }

    // Try to find context limit for this model
    let limit = 0;
    if (modelId && contextLimitMap[modelId]) {
      limit = contextLimitMap[modelId];
    } else if (modelId) {
      // Try partial match (provider/model vs just model)
      const modelShort = modelId.split('/').pop();
      for (const [key, val] of Object.entries(contextLimitMap)) {
        if (key.includes(modelId) || modelId.includes(key) ||
            (modelShort && key.split('/').pop() === modelShort)) {
          limit = val;
          break;
        }
      }
    }
    const percent = limit > 0 ? Math.round((peakInput / limit) * 100) : 0;
    return { percent: Math.min(percent, 100), inputTokens: peakInput, limit, lastInput };
  }, [botMessages, contextLimitMap]);

  return (
    <aside
      className={`flex w-72 shrink-0 flex-col border-l ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-300 bg-zinc-200'}`}
    >
      {/* Header */}
      <div
        className={`flex h-16 items-center justify-between border-b px-4 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}
      >
        <div className="flex items-start gap-2 mt-1">
          <Bug
            className={`h-4 w-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}
          />
          <div>
            <h2 className="text-sm font-semibold">Debug</h2>
            <div
              className={`flex items-center gap-1 text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}
            >
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
      <div
        className={`flex items-start gap-2.5 border-b px-4 py-2.5 ${isDark ? 'border-zinc-800' : 'border-zinc-300 bg-zinc-200/80'}`}
      >
        <Radio
          className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${sessionId ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : isDark ? 'text-zinc-600' : 'text-zinc-400'}`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}
          >
            Session
          </div>
          <div
            className={`mt-0.5 truncate font-mono text-xs ${sessionId ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : isDark ? 'text-zinc-600' : 'text-zinc-400'}`}
            title={sessionId ?? undefined}
          >
            {sessionId ?? 'No active session'}
          </div>
        </div>
      </div>

      {/* Aggregate stats bar */}
      {responseCount > 0 && (
        <div
          className={`flex items-center gap-3 border-b px-4 py-2.5 text-[11px] ${isDark ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400' : 'border-zinc-300 bg-white text-zinc-600'}`}
        >
          <span title="Total responses">{responseCount} responses</span>
          <span className={isDark ? 'text-zinc-700' : 'text-zinc-300'}>|</span>
          <span title="Total tokens utilisés">{totalUsed.toLocaleString()} tok</span>
          {totalCached > 0 && (
            <>
              <span className={isDark ? 'text-zinc-700' : 'text-zinc-300'}>|</span>
              <span title="Tokens en cache (gratuits ou réduits)" className={isDark ? 'text-sky-400/70' : 'text-sky-600/70'}>{totalCached.toLocaleString()} cached</span>
            </>
          )}
          {totalCost > 0 && (
            <>
              <span className={isDark ? 'text-zinc-700' : 'text-zinc-300'}>
                |
              </span>
              <span title="Total cost">{formatCost(totalCost)}</span>
            </>
          )}
        </div>
      )}

      {/* Context usage circle */}
      {contextInfo.percent > 0 && (
        <div
          className={`flex items-center gap-3 border-b px-4 py-3 ${isDark ? 'border-zinc-800' : 'border-zinc-300 bg-zinc-200/70'}`}
        >
          <ContextCircle percent={contextInfo.percent} isDark={isDark} />
          <div className="min-w-0 flex-1">
            <div
              className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
            >
              Context Window
            </div>
            <div className={`mt-0.5 text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              {(contextInfo.inputTokens / 1000).toFixed(1)}k / {(contextInfo.limit / 1000).toFixed(0)}k tokens
              {contextInfo.lastInput > 0 && contextInfo.lastInput !== contextInfo.inputTokens && (
                <span className={`ml-1 text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  (now: {(contextInfo.lastInput / 1000).toFixed(1)}k)
                </span>
              )}
            </div>
            <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {contextInfo.percent >= 80 ? '⚠ Near limit' : contextInfo.percent >= 50 ? 'Moderate usage' : 'Healthy'}
            </div>
          </div>
        </div>
      )}

      {/* Content — always show latest response only */}
      <div className="flex-1 overflow-y-auto">
        {!activeMsg?.metadata ? (
          <div
            className={`flex flex-col items-center justify-center h-full px-4 text-center ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}
          >
            <Bug className="mb-2 h-6 w-6" />
            <p className="text-xs">No metadata yet</p>
            <p className="mt-1 text-[10px]">
              Send a message to see agent debug info
            </p>
          </div>
        ) : (
          <div className="p-3">
            <MetadataCard
              metadata={activeMsg.metadata}
              timestamp={activeMsg.timestamp}
              isDark={isDark}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
