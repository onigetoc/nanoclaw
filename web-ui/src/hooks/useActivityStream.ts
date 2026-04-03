import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService, type ActivityEvent, type ActivityFile } from '../api';

export interface ActivityStatsData {
  totalEvents: number;
  duration: number;
  filesEdited: string[];
  commandsRun: number;
  errors: number;
  toolsUsed: Map<string, number>;
  isActive: boolean;
}

function computeStats(events: ActivityEvent[]): ActivityStatsData {
  const toolsUsed = new Map<string, number>();
  const filesEdited: string[] = [];
  let commandsRun = 0;
  let errors = 0;
  let isActive = false;

  for (const ev of events) {
    if (ev.type === 'session.created') isActive = true;
    if (ev.type === 'session.idle') isActive = false;
    if (ev.type === 'session.error') errors++;
    if (ev.type === 'file.edited') {
      const p = (ev.properties?.file as string) ?? (ev.properties?.path as string);
      if (p && !filesEdited.includes(p)) filesEdited.push(p);
    }
    if (ev.type === 'command.executed') commandsRun++;
    if (ev.type === 'message.part.updated') {
      const part = ev.properties?.part as Record<string, unknown> | undefined;

      // OpenCode actual format: part.type === "tool"
      if (part?.type === 'tool') {
        const toolName = part.tool as string | undefined;
        const stateObj = part.state as Record<string, unknown> | undefined;
        const status = stateObj?.status as string | undefined;
        if (toolName && (status === 'pending' || status === 'running')) {
          const clean = toolName.startsWith('mcp__eureclaw__')
            ? toolName.slice('mcp__eureclaw__'.length)
            : toolName.startsWith('mcp__')
              ? toolName.slice('mcp__'.length)
              : toolName;
          // Count once per pending (or running if pending was missed)
          if (status === 'pending') {
            toolsUsed.set(clean, (toolsUsed.get(clean) ?? 0) + 1);
          }
        }
      }

      // Legacy format: part.type === "tool-invocation"
      if (part?.type === 'tool-invocation') {
        const invocation = part?.toolInvocation as Record<string, unknown> | undefined;
        const toolName = (invocation?.toolName as string) ?? (part?.toolName as string);
        const state = (invocation?.state as string) ?? (part?.state as string);
        if (toolName && state === 'call') {
          const clean = toolName.startsWith('mcp__eureclaw__')
            ? toolName.slice('mcp__eureclaw__'.length)
            : toolName.startsWith('mcp__')
              ? toolName.slice('mcp__'.length)
              : toolName;
          toolsUsed.set(clean, (toolsUsed.get(clean) ?? 0) + 1);
        }
      }
    }
  }

  const duration = events.length >= 2
    ? (events[events.length - 1].ts - events[0].ts) / 1000
    : 0;

  return { totalEvents: events.length, duration, filesEdited, commandsRun, errors, toolsUsed, isActive };
}

export function useActivityStream(jid: string | null, enabled: boolean) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<ActivityStatsData>(() => computeStats([]));
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableFiles, setAvailableFiles] = useState<ActivityFile[]>([]);
  const [mode, setMode] = useState<'live' | 'history'>('live');
  const eventsRef = useRef<ActivityEvent[]>([]);

  // Load available JSONL files
  useEffect(() => {
    if (!jid || !enabled) return;
    apiService.getActivityFiles(jid)
      .then(setAvailableFiles)
      .catch(() => setAvailableFiles([]));
  }, [jid, enabled]);

  // SSE connection management
  useEffect(() => {
    if (!jid || !enabled || mode !== 'live') {
      apiService.disconnectFromActivityStream();
      setIsConnected(false);
      return;
    }

    setEvents([]);
    eventsRef.current = [];
    setStats(computeStats([]));
    setError(null);
    setIsConnected(true);

    apiService.connectToActivityStream(jid);

    const unsub = apiService.onActivityEvent((event) => {
      if (event.type === 'error') {
        setError(((event as unknown) as Record<string, unknown>).message as string || 'Stream error');
        return;
      }
      eventsRef.current = [...eventsRef.current, event];
      setEvents(eventsRef.current);
      setStats(computeStats(eventsRef.current));
    });

    return () => {
      unsub();
      apiService.disconnectFromActivityStream();
      setIsConnected(false);
    };
  }, [jid, enabled, mode]);

  // Load history from a specific JSONL file
  const loadHistory = useCallback(async (filename: string) => {
    if (!jid) return;
    setIsLoading(true);
    setError(null);
    setMode('history');
    try {
      const loaded = await apiService.getActivityEvents(jid, filename);
      eventsRef.current = loaded;
      setEvents(loaded);
      setStats(computeStats(loaded));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, [jid]);

  const switchToLive = useCallback(() => {
    setMode('live');
    setEvents([]);
    eventsRef.current = [];
    setStats(computeStats([]));
  }, []);

  return {
    events,
    stats,
    isConnected,
    isLoading,
    error,
    availableFiles,
    mode,
    loadHistory,
    switchToLive,
  };
}
