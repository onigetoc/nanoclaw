import { useState, useEffect } from 'react';
import { Check, RefreshCw, Info } from 'lucide-react';
import { apiService } from '../api';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

interface ProviderInfo {
  id: string;
  name: string;
  models: ModelInfo[];
}

interface ModelsSectionProps {
  isDark: boolean;
}

export default function ModelsSection({ isDark }: ModelsSectionProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [popularProviders, setPopularProviders] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('eureclaw_selected_models');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSelectedProviders(new Set(parsed.providers || []));
        setSelectedModels(new Set(parsed.models || []));
      } catch (e) {
        console.error('Failed to parse saved selections:', e);
      }
    }
  }, []);

  // Save to localStorage whenever selections change
  useEffect(() => {
    if (selectedProviders.size > 0 || selectedModels.size > 0) {
      localStorage.setItem('eureclaw_selected_models', JSON.stringify({
        providers: Array.from(selectedProviders),
        models: Array.from(selectedModels),
      }));
    }
  }, [selectedProviders, selectedModels]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getProviders();
      setProviders(data.providers);
      setPopularProviders(data.popular);

      // Only pre-select if no saved selections
      const saved = localStorage.getItem('eureclaw_selected_models');
      if (!saved) {
        // Pre-select popular providers and their models
        const popularSet = new Set(data.popular);
        const preSelectedProviders = new Set<string>();
        const preSelectedModels = new Set<string>();

        for (const provider of data.providers) {
          if (popularSet.has(provider.id) || provider.id === 'opencode') {
            preSelectedProviders.add(provider.id);
            for (const model of provider.models) {
              preSelectedModels.add(model.id);
            }
          }
        }

        setSelectedProviders(preSelectedProviders);
        setSelectedModels(preSelectedModels);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshCache = async () => {
    try {
      setRefreshing(true);
      await apiService.clearModelsCache();
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh cache');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleProvider = (providerId: string) => {
    const newSelected = new Set(selectedProviders);
    const provider = providers.find((p) => p.id === providerId);

    if (newSelected.has(providerId)) {
      newSelected.delete(providerId);
      if (provider) {
        const newModels = new Set(selectedModels);
        for (const model of provider.models) {
          newModels.delete(model.id);
        }
        setSelectedModels(newModels);
      }
    } else {
      newSelected.add(providerId);
      if (provider) {
        const newModels = new Set(selectedModels);
        for (const model of provider.models) {
          newModels.add(model.id);
        }
        setSelectedModels(newModels);
      }
    }

    setSelectedProviders(newSelected);
  };

  const toggleModel = (modelId: string) => {
    const newSelected = new Set(selectedModels);
    if (newSelected.has(modelId)) {
      newSelected.delete(modelId);
    } else {
      newSelected.add(modelId);
    }
    setSelectedModels(newSelected);
  };

  const selectedProvidersData = providers.filter((p) => selectedProviders.has(p.id));
  const availableModels = selectedProvidersData.flatMap((p) =>
    p.models.filter((m) => selectedModels.has(m.id))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Providers & Models Selection</h1>
          <p className={`mt-1 text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Choose which AI providers and models appear in your chat interface
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshCache}
          disabled={refreshing}
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            isDark
              ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          } ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Refresh cache (re-fetch from models.dev)"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Info Box */}
      <div className={`rounded-lg border p-4 ${isDark ? 'border-blue-900/50 bg-blue-950/30' : 'border-blue-200 bg-blue-50'}`}>
        <div className="flex items-start gap-2">
          <Info className={`mt-0.5 h-4 w-4 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          <div className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
            <p className="font-medium">How It Works</p>
            <ul className="mt-2 space-y-1">
              <li>• Select providers to see their available models</li>
              <li>• Choose specific models you want to use in your chats</li>
              <li>• Selected models appear in the chat interface model dropdown</li>
              <li>• Model data is cached for 24 hours (auto-refresh or use button above)</li>
            </ul>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        </div>
      ) : error ? (
        <div className={`rounded-lg border p-6 text-center ${isDark ? 'border-red-900 bg-red-950/50 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <p className="font-medium">Failed to load providers</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            onClick={loadProviders}
            className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium transition ${
              isDark ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Provider Selection */}
          <div className={`rounded-lg border p-4 ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
            <h3 className="mb-3 text-sm font-semibold">Providers ({selectedProviders.size} selected)</h3>
            <div className="space-y-1">
              {providers.map((provider) => {
                const isSelected = selectedProviders.has(provider.id);
                const isPopular = popularProviders.includes(provider.id) || provider.id === 'opencode';
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => toggleProvider(provider.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? isDark
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-blue-50 text-blue-700'
                        : isDark
                        ? 'hover:bg-zinc-800 text-zinc-300'
                        : 'hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                        isSelected
                          ? isDark ? 'border-blue-500 bg-blue-500' : 'border-blue-600 bg-blue-600'
                          : isDark ? 'border-zinc-600' : 'border-zinc-300'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span>{provider.name}</span>
                      {isPopular && (
                        <span className={`rounded px-1.5 py-0.5 text-xs ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                          Popular
                        </span>
                      )}
                    </div>
                    <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {provider.models.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Model Selection */}
          <div className={`lg:col-span-2 rounded-lg border p-4 ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
            <h3 className="mb-3 text-sm font-semibold">
              Models ({availableModels.length} selected)
            </h3>
            {selectedProvidersData.length === 0 ? (
              <div className={`rounded-lg border p-8 text-center ${isDark ? 'border-zinc-800 text-zinc-500' : 'border-zinc-200 text-zinc-400'}`}>
                Select a provider to see available models
              </div>
            ) : (
              <div className="space-y-4">
                {selectedProvidersData.map((provider) => (
                  <div key={provider.id}>
                    <h4 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {provider.name}
                    </h4>
                    <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {provider.models.map((model) => {
                        const isSelected = selectedModels.has(model.id);
                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => toggleModel(model.id)}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                              isSelected
                                ? isDark
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-green-50 text-green-700'
                                : isDark
                                ? 'hover:bg-zinc-800 text-zinc-300'
                                : 'hover:bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                isSelected
                                  ? isDark ? 'border-green-500 bg-green-500' : 'border-green-600 bg-green-600'
                                  : isDark ? 'border-zinc-600' : 'border-zinc-300'
                              }`}>
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate">{model.name}</div>
                                <div className={`truncate text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                  {model.id}
                                </div>
                              </div>
                            </div>
                            {model.context_length && (
                              <span className={`ml-2 shrink-0 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                {(model.context_length / 1000).toFixed(0)}k
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
