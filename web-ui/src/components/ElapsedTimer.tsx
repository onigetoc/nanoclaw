import { useState, useEffect, useRef } from 'react';

/** Tiny component that shows elapsed seconds since a given ISO timestamp. */
export function ElapsedTimer({ startTime, isDark }: { startTime: string; isDark: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    // Reset start time when the timestamp prop changes (new status event)
    startRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (elapsed < 2) return null; // Don't show for very short durations
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const display = mins > 0 ? `${mins}m${secs.toString().padStart(2, '0')}s` : `${secs}s`;

  return (
    <span className={`ml-auto tabular-nums ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
      {display}
    </span>
  );
}
