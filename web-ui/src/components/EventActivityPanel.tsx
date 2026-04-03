import { useActivityStream } from '../hooks/useActivityStream';
import EventTimeline from './EventTimeline';
import ActivityStats from './ActivityStats';

interface EventActivityPanelProps {
  jid: string;
  isDark: boolean;
  onClose: () => void;
}

export default function EventActivityPanel({
  jid,
  isDark,
  onClose,
}: EventActivityPanelProps) {
  const {
    events,
    stats,
    isConnected,
    isLoading,
    error,
    availableFiles,
    mode,
    loadHistory,
    switchToLive,
  } = useActivityStream(jid, true);

  return (
    <aside
      className={`flex w-[400px] shrink-0 flex-col border-l ${
        isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-300 bg-zinc-200'
      }`}
    >
      {/* Header */}
      <div
        className={`flex h-14 items-center justify-between border-b px-3 ${
          isDark ? 'border-zinc-800' : 'border-zinc-300'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Connection dot */}
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mode toggle */}
          <div
            className={`flex rounded-md border text-[11px] ${
              isDark ? 'border-zinc-700' : 'border-zinc-300'
            }`}
          >
            <button
              type="button"
              onClick={switchToLive}
              className={`px-2 py-1 rounded-l-md transition ${
                mode === 'live'
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-emerald-100 text-emerald-700'
                  : isDark
                    ? 'text-zinc-400 hover:bg-zinc-800'
                    : 'text-zinc-500 hover:bg-zinc-100'
              }`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => {
                if (availableFiles.length > 0) {
                  void loadHistory(availableFiles[0].filename);
                }
              }}
              className={`px-2 py-1 rounded-r-md transition ${
                mode === 'history'
                  ? isDark
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-blue-100 text-blue-700'
                  : isDark
                    ? 'text-zinc-400 hover:bg-zinc-800'
                    : 'text-zinc-500 hover:bg-zinc-100'
              }`}
            >
              History
            </button>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition ${
              isDark
                ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
            }`}
            title="Close activity panel"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* History file selector */}
      {mode === 'history' && availableFiles.length > 0 && (
        <div
          className={`border-b px-3 py-2 ${
            isDark ? 'border-zinc-800' : 'border-zinc-300'
          }`}
        >
          <select
            className={`w-full rounded border px-2 py-1 text-xs ${
              isDark
                ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
                : 'border-zinc-300 bg-white text-zinc-700'
            }`}
            onChange={(e) => void loadHistory(e.target.value)}
            defaultValue={availableFiles[0]?.filename}
          >
            {availableFiles.map((f) => (
              <option key={f.filename} value={f.filename}>
                {f.filename} ({(f.size / 1024).toFixed(1)}KB)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      <ActivityStats stats={stats} isDark={isDark} />

      {/* Error message */}
      {error && (
        <div
          className={`px-3 py-2 text-xs ${
            isDark
              ? 'bg-red-950/40 text-red-400'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {error}
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        </div>
      )}

      {/* Timeline */}
      <EventTimeline events={events} isDark={isDark} />
    </aside>
  );
}
