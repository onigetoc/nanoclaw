import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { ActivityEvent } from '../api';
import EventTimelineItem from './EventTimelineItem';

interface GroupedEvent {
  event: ActivityEvent;
  count: number;
}

/** Group consecutive events that have the same type + label. */
function groupConsecutive(events: ActivityEvent[]): GroupedEvent[] {
  if (events.length === 0) return [];
  const groups: GroupedEvent[] = [];
  let current: GroupedEvent = { event: events[0], count: 1 };

  for (let i = 1; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === current.event.type && ev.label === current.event.label) {
      current.count++;
      current.event = ev; // keep latest timestamp
    } else {
      groups.push(current);
      current = { event: ev, count: 1 };
    }
  }
  groups.push(current);
  return groups;
}

interface EventTimelineProps {
  events: ActivityEvent[];
  isDark: boolean;
}

export default function EventTimeline({ events, isDark }: EventTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const grouped = useMemo(() => groupConsecutive(events), [events]);

  const checkAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  // Auto-scroll to bottom when new events arrive (only if user is at bottom)
  useEffect(() => {
    const el = containerRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div
        className={`flex flex-1 items-center justify-center text-sm ${
          isDark ? 'text-zinc-500' : 'text-zinc-400'
        }`}
      >
        No events yet
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={checkAtBottom}
      className="flex-1 overflow-y-auto"
    >
      {grouped.map((g, i) => (
        <EventTimelineItem
          key={`${g.event.ts}-${i}`}
          event={g.event}
          count={g.count}
          isDark={isDark}
        />
      ))}
    </div>
  );
}
