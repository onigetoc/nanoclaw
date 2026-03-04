import { useMemo, useRef, useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { getProviderLogoUrl, getProviderBadgeColor, type UiModel } from '../utils/models';

interface ModelSelectorProps {
  isDark: boolean;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  availableModels: UiModel[];
}

export default function ModelSelector({ isDark, selectedModelId, onSelectModel, availableModels }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModel = availableModels.find((m) => m.id === selectedModelId) ?? availableModels[0];

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableModels;
    return availableModels.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q),
    );
  }, [query, availableModels]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, UiModel[]> = {};
    for (const model of filteredModels) {
      const providerName = model.provider.charAt(0).toUpperCase() + model.provider.slice(1);
      if (!groups[providerName]) {
        groups[providerName] = [];
      }
      groups[providerName].push(model);
    }
    return groups;
  }, [filteredModels]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (open && !containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!selectedModel) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-400 transition hover:text-zinc-200"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
          <img src={getProviderLogoUrl(selectedModel.provider)} alt={selectedModel.provider} className="h-3.5 w-3.5" loading="lazy" />
        </span>
        <span className="max-w-28 truncate">{selectedModel.name}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className={`absolute bottom-11 left-0 z-30 w-80 overflow-hidden rounded-xl border shadow-2xl ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
          <div className={`border-b p-2 ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              className={`h-9 w-full rounded-md border px-2 text-xs outline-none ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500' : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500'}`}
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5">
            {Object.entries(groupedModels).map(([providerName, models]) => (
              <div key={providerName} className="mb-1.5">
                <div className={`px-2 py-1 text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {providerName}
                </div>
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => { onSelectModel(model.id); setOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                      selectedModelId === model.id
                        ? isDark ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-900'
                        : isDark ? 'text-zinc-200 hover:bg-zinc-800/70' : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
                      <img src={getProviderLogoUrl(model.provider)} alt={model.provider} className="h-4 w-4" loading="lazy" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{model.name}</span>
                    <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${getProviderBadgeColor(model.provider, isDark)}`}>
                      {model.provider}
                    </span>
                    {selectedModelId === model.id && <Check className="ml-1 h-4 w-4" />}
                  </button>
                ))}
              </div>
            ))}

            {filteredModels.length === 0 && (
              <div className={`px-2 py-4 text-center text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                No models found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
