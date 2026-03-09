import { useState, useEffect } from 'react';
import { Check, RefreshCw, Info } from 'lucide-react';
import { getModelsDevData, clearModelsCache, loadSelections, saveSelections, getOpenCodeFreeModels } from '../services/models-cache';

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
  const [selectedProviderId, setSelectedProviderId] = useState<string>('opencode'); // Single provider selection
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    loadProviders();
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadSelections();
    if (saved.models.length > 0) {
      setSelectedModels(new Set(saved.models));
    }
  }, []);

  // Save to localStorage whenever selections change
  useEffect(() => {
    if (selectedModels.size > 0) {
      saveSelections({
        providers: [], // Not used anymore
        models: Array.from(selectedModels),
      });
      // Trigger custom event so App.tsx can reload models immediately
      window.dispatchEvent(new CustomEvent('eureclaw-models-changed'));
    }
  }, [selectedModels]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch directly from models.dev (browser-side)
      const modelsDevData = await getModelsDevData();
      
      // Transform to ProviderInfo array
      const providersArray: ProviderInfo[] = [];
      
      // Get OpenCode free models dynamically
      const openCodeFree = getOpenCodeFreeModels(modelsDevData);
      
      // Add OpenCode first with dynamic free models
      const openCodeModels = [
        { id: 'opencode/big-pickle', name: 'Big Pickle', provider: 'opencode' },
        { id: 'opencode/gpt-5-nano', name: 'GPT-5 Nano', provider: 'opencode' },
        ...openCodeFree.map(m => ({ 
          id: m.id, 
          name: `${m.name} (Free)`, 
          provider: 'opencode' 
        })),
      ];
      
      providersArray.push({
        id: 'opencode',
        name: 'OpenCode',
        models: openCodeModels,
      });
      
      // Transform models.dev data
      for (const [providerId, providerData] of Object.entries(modelsDevData)) {
        if (providerId === 'opencode') continue; // Already added above
        
        const models: ModelInfo[] = Object.values(providerData.models).map((m) => ({
          id: m.id,
          name: m.name,
          provider: providerId,
          context_length: m.limit?.context,
          pricing: m.cost ? {
            prompt: m.cost.input,
            completion: m.cost.output,
          } : undefined,
        }));
        
        providersArray.push({
          id: providerId,
          name: providerData.name,
          models,
        });
      }
      
      setProviders(providersArray);
      
      // Popular providers
      const popular = ['openai', 'anthropic', 'google', 'x-ai', 'meta', 'mistral', 'cohere'];
      setPopularProviders(popular);

      // Load saved selections or pre-select free models
      const saved = loadSelections();
      if (saved.models.length > 0) {
        setSelectedModels(new Set(saved.models));
      } else {
        // Pre-select only OpenCode free models
        const freeModelIds = new Set(openCodeFree.map(m => m.id));
        setSelectedModels(freeModelIds);
        // Save immediately and notify
        if (freeModelIds.size > 0) {
          saveSelections({
            providers: [],
            models: Array.from(freeModelIds),
          });
          window.dispatchEvent(new CustomEvent('eureclaw-models-changed'));
        }
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
      clearModelsCache();
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh cache');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleProvider = (providerId: string) => {
    setSelectedProviderId(providerId);
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

  const toggleAllModelsForProvider = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    const providerModelIds = provider.models.map(m => m.id);
    const allSelected = providerModelIds.every(id => selectedModels.has(id));

    const newSelected = new Set(selectedModels);
    if (allSelected) {
      // Deselect all
      for (const id of providerModelIds) {
        newSelected.delete(id);
      }
    } else {
      // Select all
      for (const id of providerModelIds) {
        newSelected.add(id);
      }
    }
    setSelectedModels(newSelected);
  };

  const filteredProviders = providers.filter(p => 
    p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
    p.id.toLowerCase().includes(providerSearch.toLowerCase())
  );

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  
  // Filter models based on search
  const filteredModels = selectedProvider?.models.filter(m =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  ) ?? [];
  
  const totalSelectedModels = selectedModels.size;

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
          {/* Left: Provider Selection (single selection, no checkboxes) */}
          <div className={`rounded-lg border p-4 ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
            <h3 className="mb-3 text-sm font-semibold">Providers</h3>
            
            {/* Search input with clear button */}
            <div className="relative mb-2">
              <input
                type="text"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                placeholder="Search providers..."
                className={`w-full rounded-lg border px-3 py-2 pr-8 text-sm ${
                  isDark
                    ? 'border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500'
                    : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
              {providerSearch && (
                <button
                  type="button"
                  onClick={() => setProviderSearch('')}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition ${
                    isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* Scrollable provider list */}
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {filteredProviders.map((provider) => {
                const isSelected = selectedProviderId === provider.id;
                const isPopular = popularProviders.includes(provider.id) || provider.id === 'opencode';
                const hasSelectedModels = provider.models.some(m => selectedModels.has(m.id));
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => toggleProvider(provider.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? isDark
                          ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50'
                          : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : isDark
                        ? 'hover:bg-zinc-800 text-zinc-300'
                        : 'hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{provider.name}</span>
                      {isPopular && (
                        <span className={`rounded px-1.5 py-0.5 text-xs ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasSelectedModels && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" title="Has selected models" />
                      )}
                      <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {provider.models.length}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Model Selection with checkboxes */}
          <div className={`lg:col-span-2 rounded-lg border p-4 ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Models ({totalSelectedModels} selected)
              </h3>
            </div>
            
            {/* Model search input */}
            {selectedProvider && (
              <div className="relative mb-3">
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Filter models..."
                  className={`w-full rounded-lg border px-3 py-2 pr-8 text-sm ${
                    isDark
                      ? 'border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500'
                      : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400'
                  }`}
                />
                {modelSearch && (
                  <button
                    type="button"
                    onClick={() => setModelSearch('')}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition ${
                      isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            
            {!selectedProvider ? (
              <div className={`rounded-lg border p-8 text-center ${isDark ? 'border-zinc-800 text-zinc-500' : 'border-zinc-200 text-zinc-400'}`}>
                Select a provider from the left to see available models
              </div>
            ) : (
              <div className="max-h-96 space-y-4 overflow-y-auto">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {selectedProvider.name}
                    </h4>
                    <button
                      type="button"
                      onClick={() => toggleAllModelsForProvider(selectedProvider.id)}
                      className={`rounded px-2 py-1 text-xs font-medium transition ${
                        isDark
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                      }`}
                    >
                      {selectedProvider.models.every(m => selectedModels.has(m.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  {filteredModels.length === 0 ? (
                    <div className={`rounded-lg border p-6 text-center ${isDark ? 'border-zinc-800 text-zinc-500' : 'border-zinc-200 text-zinc-400'}`}>
                      <p className="text-sm">No models match your search</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {filteredModels.map((model) => {
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
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
