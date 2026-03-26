import { useState, useEffect } from 'react';

interface CronBuilderProps {
  value: string;
  onChange: (expression: string) => void;
  isDark: boolean;
}

const DAYS_OF_WEEK = [
  { value: '*', label: 'Every day' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
  { value: '1-5', label: 'Weekdays (Mon-Fri)' },
  { value: '0,6', label: 'Weekends (Sat-Sun)' },
];

const MONTHS = [
  { value: '*', label: 'Every month' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const KNOWN_DOW = new Set(DAYS_OF_WEEK.map((d) => d.value));
const KNOWN_MONTHS = new Set(MONTHS.map((m) => m.value));

function parseCron(expr: string) {
  const parts = expr.trim().split(/\s+/);
  return {
    minute: parts[0] || '*',
    hour: parts[1] || '*',
    dayOfMonth: parts[2] || '*',
    month: parts[3] || '*',
    dayOfWeek: parts[4] || '*',
  };
}

// Check if a cron expression can be represented by the visual builder.
// Complex expressions like "0 9 * * 1,3,5" need raw mode.
function isSimpleExpression(expr: string): boolean {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCron(expr);

  // Check minute: must be a plain number, *, or */N
  if (minute !== '*' && !minute.match(/^\d+$/) && !minute.match(/^\*\/\d+$/)) return false;

  // Check hour: must be a plain number or *
  if (hour !== '*' && !hour.match(/^\d+$/)) return false;

  // Check dayOfMonth: must be * (we don't support day-of-month in visual)
  if (dayOfMonth !== '*') return false;

  // Check month: must be in our known list
  if (!KNOWN_MONTHS.has(month)) return false;

  // Check dayOfWeek: must be in our known list
  if (!KNOWN_DOW.has(dayOfWeek)) return false;

  return true;
}

function describeCron(expr: string): string {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCron(expr);
  const parts: string[] = [];

  if (minute === '*' && hour === '*') {
    parts.push('Every minute');
  } else if (minute.startsWith('*/')) {
    parts.push('Every ' + minute.slice(2) + ' minutes');
  } else if (hour === '*') {
    parts.push('At minute ' + minute + ' of every hour');
  } else {
    parts.push('At ' + hour.padStart(2, '0') + ':' + minute.padStart(2, '0'));
  }

  const dow = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek);
  if (dayOfWeek !== '*') {
    parts.push(dow ? dow.label : 'day ' + dayOfWeek);
  }

  if (dayOfMonth !== '*') parts.push('on day ' + dayOfMonth);

  const mo = MONTHS.find((m) => m.value === month);
  if (month !== '*') parts.push('in ' + (mo ? mo.label : 'month ' + month));

  return parts.join(', ');
}

export default function CronBuilder({ value, onChange, isDark }: CronBuilderProps) {
  // Auto-detect: if expression is too complex for visual, start in raw mode
  const [rawMode, setRawMode] = useState(!isSimpleExpression(value));
  const [rawValue, setRawValue] = useState(value);

  // Visual state
  const parsed = parseCron(value);
  const [minute, setMinute] = useState(parsed.minute);
  const [hour, setHour] = useState(parsed.hour);
  const [month, setMonth] = useState(parsed.month);
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek);
  const [useEveryN, setUseEveryN] = useState(parsed.minute.startsWith('*/'));
  const [everyNMinutes, setEveryNMinutes] = useState(
    parsed.minute.startsWith('*/') ? parsed.minute.slice(2) : '5',
  );

  // Sync from parent when value changes externally
  useEffect(() => {
    const p = parseCron(value);
    setRawValue(value);
    setMinute(p.minute);
    setHour(p.hour);
    setMonth(p.month);
    setDayOfWeek(p.dayOfWeek);
    setUseEveryN(p.minute.startsWith('*/'));
    if (p.minute.startsWith('*/')) setEveryNMinutes(p.minute.slice(2));
    // Auto-switch to raw if expression is complex
    if (!isSimpleExpression(value)) setRawMode(true);
  }, [value]);

  const emit = (m: string, h: string, dom: string, mo: string, dow: string) => {
    const expr = [m, h, dom, mo, dow].join(' ');
    setRawValue(expr);
    onChange(expr);
  };

  const selectClass = 'rounded-lg border px-2 py-1.5 text-sm outline-none transition ' + (
    isDark
      ? 'border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500'
      : 'border-zinc-300 bg-white text-zinc-800 focus:border-emerald-500'
  );
  const numInputClass = 'rounded-lg border px-2 py-1.5 text-sm outline-none transition w-16 text-center ' + (
    isDark
      ? 'border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500'
      : 'border-zinc-300 bg-white text-zinc-800 focus:border-emerald-500'
  );
  const rawInputClass = 'w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition ' + (
    isDark
      ? 'border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500'
      : 'border-zinc-300 bg-white text-zinc-800 focus:border-emerald-500'
  );
  const labelClass = 'text-[10px] font-semibold uppercase tracking-wider mb-1 block ' + (
    isDark ? 'text-zinc-500' : 'text-zinc-400'
  );

  const currentExpr = rawMode
    ? rawValue
    : (useEveryN ? '*/' + everyNMinutes : minute) + ' ' + hour + ' * ' + month + ' ' + dayOfWeek;

  return (
    <div className="space-y-3">
      {/* Mode toggle: Visual / Raw */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (rawMode && isSimpleExpression(rawValue)) {
              // Switching to visual: sync state from raw
              const p = parseCron(rawValue);
              setMinute(p.minute);
              setHour(p.hour);
              setMonth(p.month);
              setDayOfWeek(p.dayOfWeek);
              setUseEveryN(p.minute.startsWith('*/'));
              if (p.minute.startsWith('*/')) setEveryNMinutes(p.minute.slice(2));
            }
            setRawMode(false);
          }}
          disabled={rawMode && !isSimpleExpression(rawValue)}
          className={'rounded-md px-2.5 py-1 text-[11px] font-medium transition ' + (
            !rawMode
              ? isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
              : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
          ) + (rawMode && !isSimpleExpression(rawValue) ? ' opacity-40 cursor-not-allowed' : '')}
        >
          Visual
        </button>
        <button
          type="button"
          onClick={() => setRawMode(true)}
          className={'rounded-md px-2.5 py-1 text-[11px] font-medium transition ' + (
            rawMode
              ? isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
              : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
          )}
        >
          Raw (Mode Expert)
        </button>
        {rawMode && !isSimpleExpression(rawValue) && (
          <span className={'text-[10px] ' + (isDark ? 'text-amber-400/70' : 'text-amber-600')}>
            Complex expression — visual mode unavailable
          </span>
        )}
      </div>

      {rawMode ? (
        /* ---- RAW MODE ---- */
        <div>
          <input
            type="text"
            value={rawValue}
            onChange={(e) => {
              setRawValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="0 9 * * 1,3,5"
            className={rawInputClass}
          />
          <p className={'text-[11px] mt-1.5 ' + (isDark ? 'text-zinc-600' : 'text-zinc-400')}>
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      ) : (
        /* ---- VISUAL MODE ---- */
        <div className="space-y-3">
          {/* Frequency toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!useEveryN}
                onChange={() => {
                  setUseEveryN(false);
                  const m = minute === '*' ? '0' : minute;
                  if (minute === '*') setMinute('0');
                  emit(m, hour, '*', month, dayOfWeek);
                }}
                className="accent-emerald-500"
              />
              <span className={'text-xs ' + (isDark ? 'text-zinc-300' : 'text-zinc-700')}>At specific time</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={useEveryN}
                onChange={() => {
                  setUseEveryN(true);
                  emit('*/' + everyNMinutes, hour, '*', month, dayOfWeek);
                }}
                className="accent-emerald-500"
              />
              <span className={'text-xs ' + (isDark ? 'text-zinc-300' : 'text-zinc-700')}>Every N minutes</span>
            </label>
          </div>

          {/* Time inputs */}
          <div className="flex flex-wrap items-end gap-3">
            {useEveryN ? (
              <div>
                <label className={labelClass}>Every</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={59}
                    value={everyNMinutes}
                    onChange={(e) => {
                      const v = e.target.value || '5';
                      setEveryNMinutes(v);
                      emit('*/' + v, hour, '*', month, dayOfWeek);
                    }}
                    className={numInputClass}
                  />
                  <span className={'text-xs ' + (isDark ? 'text-zinc-400' : 'text-zinc-500')}>min</span>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Hour</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour === '*' ? '' : hour}
                    placeholder="*"
                    onChange={(e) => {
                      const v = e.target.value || '*';
                      setHour(v);
                      emit(minute, v, '*', month, dayOfWeek);
                    }}
                    className={numInputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Minute</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute === '*' ? '' : minute}
                    placeholder="0"
                    onChange={(e) => {
                      const v = e.target.value || '0';
                      setMinute(v);
                      emit(v, hour, '*', month, dayOfWeek);
                    }}
                    className={numInputClass}
                  />
                </div>
              </>
            )}

            <div>
              <label className={labelClass}>Day of week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => {
                  setDayOfWeek(e.target.value);
                  const m = useEveryN ? '*/' + everyNMinutes : minute;
                  emit(m, hour, '*', month, e.target.value);
                }}
                className={selectClass}
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Month</label>
              <select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  const m = useEveryN ? '*/' + everyNMinutes : minute;
                  emit(m, hour, '*', e.target.value, dayOfWeek);
                }}
                className={selectClass}
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Preview bar — always visible */}
      <div className={'flex items-center gap-3 rounded-lg px-3 py-2 ' + (
        isDark ? 'bg-zinc-900/60' : 'bg-zinc-100'
      )}>
        <code className={'text-xs font-mono ' + (isDark ? 'text-emerald-400' : 'text-emerald-700')}>
          {currentExpr}
        </code>
        <span className={'text-[11px] ' + (isDark ? 'text-zinc-500' : 'text-zinc-400')}>
          — {describeCron(currentExpr)}
        </span>
      </div>
    </div>
  );
}
