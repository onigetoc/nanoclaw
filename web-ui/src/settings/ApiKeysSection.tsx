import { useState, useEffect, useCallback } from 'react';
import { Check, Eye, EyeOff, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { apiService, type ProviderInfo, type ScannedKey } from '../api';
import EnvVarsSection from './EnvVarsSection';

interface ApiKeysSectionProps {
  isDark: boolean;
}

/** Static provider list for the manual Add/Update dropdown (no fetch needed) */
const MANUAL_PROVIDERS = [
  { provider: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
  { provider: 'google', label: 'Google (Gemini)', placeholder: 'AIza...' },
  { provider: 'openai', label: 'OpenAI (GPT)', placeholder: 'sk-...' },
  { provider: 'groq', label: 'Groq', placeholder: 'gsk_...' },
  { provider: 'mistral', label: 'Mistral', placeholder: '' },
  { provider: 'cohere', label: 'Cohere', placeholder: '' },
  { provider: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  { provider: 'xai', label: 'xAI (Grok)', placeholder: 'xai-...' },
  { provider: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' },
  { provider: 'together', label: 'Together AI', placeholder: '' },
  { provider: 'fireworks', label: 'Fireworks AI', placeholder: '' },
  { provider: 'perplexity', label: 'Perplexity', placeholder: 'pplx-...' },
  { provider: 'cerebras', label: 'Cerebras', placeholder: '' },
  { provider: 'sambanova', label: 'SambaNova', placeholder: '' },
];

export default function ApiKeysSection({ isDark }: ApiKeysSectionProps) {
  const [configured, setConfigured] = useState<ProviderInfo[]>([]);
  const [loadingConfigured, setLoadingConfigured] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [showRestart, setShowRestart] = useState(false);

  // Scan state
  const [scannedKeys, setScannedKeys] = useState<ScannedKey[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const fetchConfigured = useCallback(async () => {
    try {
      const data = await apiService.getAuthProviders();
      setConfigured(data.filter((p) => p.configured));
    } catch { /* offline */ }
    finally { setLoadingConfigured(false); }
  }, []);

  useEffect(() => { void fetchConfigured(); }, [fetchConfigured]);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  const handleScan = async () => {
    setScanning(true);
    setFeedback(null);
    try {
      const keys = await apiService.scanApiKeys();
      setScannedKeys(keys);
      if (keys.length === 0) {
        setFeedback({ type: 'error', msg: 'No API keys found in system environment variables.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Scan failed' });
    } finally {
      setScanning(false);
    }
  };

  const handleAddScanned = async (envVar: string) => {
    setAddingKey(envVar);
    setFeedback(null);
    try {
      const result = await apiService.addScannedKey(envVar);
      setFeedback({ type: 'success', msg: result.message });
      setShowRestart(true);
      // Refresh both lists
      await fetchConfigured();
      // Update scan results to reflect the change
      setScannedKeys((prev) =>
        prev?.map((k) => k.envVar === envVar ? { ...k, alreadyConfigured: true } : k) ?? null
      );
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to add key' });
    } finally {
      setAddingKey(null);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider || !keyInput.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await apiService.setAuthProvider(selectedProvider, keyInput.trim());
      setFeedback({ type: 'success', msg: result.message });
      setKeyInput('');
      setSelectedProvider('');
      setShowKey(false);
      setShowRestart(true);
      await fetchConfigured();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to save key' });
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    setFeedback(null);
    try {
      const result = await apiService.restartOpenCodeServer();
      setFeedback({ type: 'success', msg: result.message });
      setShowRestart(false);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to restart server' });
    } finally {
      setRestarting(false);
    }
  };

  const handleRemove = async (provider: string) => {
    setRemoving(provider);
    setFeedback(null);
    try {
      const result = await apiService.removeAuthProvider(provider);
      setFeedback({ type: 'success', msg: result.message });
      await fetchConfigured();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to remove key' });
    } finally {
      setRemoving(null);
    }
  };

  if (loadingConfigured) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const selectedPlaceholder = MANUAL_PROVIDERS.find((p) => p.provider === selectedProvider)?.placeholder || 'Paste your API key...';

  return (
    <div>
      <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        API Keys
      </h1>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Manage your LLM provider API keys. Scan your system or add them manually.
      </p>

      {/* Feedback */}
      {feedback && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
          feedback.type === 'success'
            ? isDark ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-700/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : isDark ? 'bg-rose-500/10 text-rose-300 border border-rose-700/30' : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          {feedback.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {/* Restart banner */}
      {showRestart && (
        <div className={`mb-4 rounded-lg border p-4 ${isDark ? 'border-amber-700/30 bg-amber-500/10' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                EureClaw Reload Required
              </p>
              <p className={`text-xs mt-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600'}`}>
                New API keys require reloading EureClaw to take effect.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRestart}
              disabled={restarting}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition ${
                restarting
                  ? 'cursor-not-allowed ' + (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                  : isDark ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-600 text-white hover:bg-amber-500'
              }`}
            >
              {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reload EureClaw'}
            </button>
          </div>
        </div>
      )}

      {/* Add / Update API Key */}
      <div className={`rounded-xl border p-4 mb-6 ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`}>
        <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          Add / Update API Key
        </h3>

        <div className="flex items-center gap-2">
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className={`rounded-lg border px-3 py-2 text-sm ${
              isDark
                ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                : 'border-zinc-300 bg-zinc-50 text-zinc-800'
            }`}
          >
            <option value="">Select a provider...</option>
            {MANUAL_PROVIDERS.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.label}
              </option>
            ))}
          </select>

          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={selectedProvider ? selectedPlaceholder : 'Select a provider first'}
              disabled={!selectedProvider}
              className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm font-mono ${
                isDark
                  ? 'border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600 disabled:opacity-40'
                  : 'border-zinc-300 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 disabled:opacity-40'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className={`cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedProvider || !keyInput.trim() || saving}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition ${
              !selectedProvider || !keyInput.trim() || saving
                ? 'cursor-not-allowed bg-zinc-800 text-zinc-600' + (isDark ? '' : ' bg-zinc-100 text-zinc-400')
                : isDark ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Key'}
          </button>
        </div>
      </div>

      {/* Scan API Keys */}
      <div className={`rounded-xl border p-4 mb-6 ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <h3 className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            Detect System API Keys
          </h3>
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className={`cursor-pointer flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              scanning
                ? 'cursor-not-allowed ' + (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                : isDark ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scanning ? 'Scanning...' : 'Scan API Keys'}
          </button>
        </div>
        <p className={`text-xs mb-3 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Scan the host machine's environment variables for known LLM provider API keys.
        </p>

        {/* Scan results */}
        {scannedKeys !== null && (
          <div className={`mt-3 rounded-lg border ${isDark ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-300 bg-zinc-100'}`}>
            {scannedKeys.length === 0 ? (
              <p className={`px-4 py-3 text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                No API keys found in system environment.
              </p>
            ) : (
              scannedKeys.map((key) => (
                <div
                  key={key.envVar}
                  className={`flex items-center justify-between px-4 py-2.5 ${isDark ? 'border-b border-zinc-700 last:border-0' : 'border-b border-zinc-200 last:border-0'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                        {key.label}
                      </span>
                      {key.alreadyConfigured && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          configured
                        </span>
                      )}
                    </div>
                    <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {key.envVar} = {key.masked}
                    </p>
                  </div>
                  {!key.alreadyConfigured && (
                    <button
                      type="button"
                      onClick={() => handleAddScanned(key.envVar)}
                      disabled={addingKey === key.envVar}
                      className={`cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        addingKey === key.envVar
                          ? 'cursor-not-allowed ' + (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                          : isDark ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {addingKey === key.envVar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Add to EureClaw
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Configured providers */}
      {configured.length > 0 && (
        <div className={`rounded-xl border mb-6 ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`}>
          <h3 className={`px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Configured in EureClaw
          </h3>
          {configured.map((p) => (
            <div
              key={p.provider}
              className={`flex items-center justify-between px-4 py-2.5 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-50'}`}
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]" />
                <span className={`text-sm ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{p.label}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(p.provider)}
                disabled={removing === p.provider}
                className={`cursor-pointer rounded-md p-1.5 transition ${
                  isDark ? 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400' : 'text-zinc-400 hover:bg-rose-50 hover:text-rose-500'
                } ${removing === p.provider ? 'cursor-not-allowed opacity-50' : ''}`}
                title="Remove key"
              >
                {removing === p.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Separator */}
      <div className={`my-8 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} />

      {/* Environment Variables section — at the bottom */}
      <EnvVarsSection isDark={isDark} />
    </div>
  );
}
