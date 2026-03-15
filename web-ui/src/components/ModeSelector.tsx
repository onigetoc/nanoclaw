import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface ModeSelectorProps {
  isDark: boolean;
  selectedMode: string;
  onSelectMode: (mode: string) => void;
  availableModes: Array<{ id: string; name: string; description: string }>;
}

export default function ModeSelector({ isDark, selectedMode, onSelectMode, availableModes }: ModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModeObj = availableModes.find((m) => m.id === selectedMode) ?? availableModes[0];

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (open && !containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!selectedModeObj) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-400 transition hover:text-zinc-200"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="max-w-28 truncate">{selectedModeObj.name}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className={`absolute bottom-11 left-0 z-30 w-64 overflow-hidden rounded-xl border shadow-2xl ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
          <div className="p-1.5">
            {availableModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => { onSelectMode(mode.id); setOpen(false); }}
                className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                  selectedMode === mode.id
                    ? isDark ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-900'
                    : isDark ? 'text-zinc-200 hover:bg-zinc-800/70' : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{mode.name}</div>
                  <div className={`mt-0.5 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {mode.description}
                  </div>
                </div>
                {selectedMode === mode.id && <Check className="ml-1 h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
