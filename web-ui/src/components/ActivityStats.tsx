import type { ActivityStatsData } from '../hooks/useActivityStream';

interface ActivityStatsProps {
  stats: ActivityStatsData;
  isDark: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function ActivityStats({ stats, isDark }: ActivityStatsProps) {
  const toolEntries = Array.from(stats.toolsUsed.entries());

  return (
    <div
      className={`border-b px-3 py-2 ${
        isDark ? 'border-zinc-800' : 'border-zinc-300'
      }`}
    >
      {/* Counters row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <Stat
          label="Events"
          value={stats.totalEvents}
          isDark={isDark}
        />
        <Stat
          label="Duration"
          value={formatDuration(stats.duration)}
          isDark={isDark}
        />
        <Stat
          label="Files"
          value={stats.filesEdited.length}
          isDark={isDark}
        />
        <Stat label="Cmds" value={stats.commandsRun} isDark={isDark} />
        <Stat
          label="Errors"
          value={stats.errors}
          isDark={isDark}
          highlight={stats.errors > 0}
        />
      </div>

      {/* Tool badges */}
      {toolEntries.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {toolEntries.map(([name, count]) => (
            <span
              key={name}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                isDark
                  ? 'bg-zinc-800 text-zinc-400'
                  : 'bg-zinc-200 text-zinc-600'
              }`}
              title={`${name}: ${count} call${count > 1 ? 's' : ''}`}
            >
              {name}
              <span
                className={`rounded-sm px-1 ${
                  isDark ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-300 text-zinc-700'
                }`}
              >
                {count}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small stat display */
function Stat({
  label,
  value,
  isDark,
  highlight,
}: {
  label: string;
  value: string | number;
  isDark: boolean;
  highlight?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={isDark ? 'text-zinc-500' : 'text-zinc-400'}>
        {label}
      </span>
      <span
        className={`font-medium tabular-nums ${
          highlight
            ? 'text-red-400'
            : isDark
              ? 'text-zinc-200'
              : 'text-zinc-800'
        }`}
      >
        {value}
      </span>
    </span>
  );
}
