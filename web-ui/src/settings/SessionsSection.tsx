import { Radio } from 'lucide-react';

interface SessionsSectionProps {
  sessions: Record<string, string> | undefined;
  isDark: boolean;
}

export default function SessionsSection({ sessions, isDark }: SessionsSectionProps) {
  // Show loading state while data is being fetched
  if (sessions === undefined) {
    return (
      <div>
        <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Sessions
        </h1>
        <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
          Active OpenCode sessions per workspace.
        </p>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        </div>
      </div>
    );
  }

  const entries = Object.entries(sessions);

  return (
    <div>
      <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        Sessions
      </h1>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Active OpenCode sessions per workspace.
      </p>

      {entries.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center rounded-xl border py-12 ${
            isDark ? 'border-zinc-800 bg-zinc-900/80 text-zinc-600' : 'border-zinc-200 bg-white text-zinc-400'
          }`}
        >
          <Radio className="mb-2 h-6 w-6" />
          <p className="text-sm">No active sessions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(([folder, sessionId]) => (
            <div
              key={folder}
              className={`rounded-xl border p-4 ${
                isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Radio className={`h-4 w-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  {folder}
                </span>
              </div>
              <div
                className={`rounded-lg px-3 py-2 font-mono text-xs break-all ${
                  isDark ? 'bg-zinc-800/60 text-emerald-300' : 'bg-zinc-100 text-emerald-700'
                }`}
              >
                {sessionId}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
