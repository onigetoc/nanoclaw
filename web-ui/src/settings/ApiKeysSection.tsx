import { useState, useEffect, useCallback } from 'react';
import { Check, Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react';
import { apiService, type ProviderInfo } from '../api';

interface ApiKeysSectionProps {
  isDark: boolean;
}

export default function ApiKeysSection({ isDark }: ApiKeysSectionProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [showRestart, setShowRestart] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const data = await apiService.getAuthProviders();
      setProviders(data);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchProviders(); }, [fetchProviders]);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

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
      await fetchProviders();
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
      await fetchProviders();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to remove key' });
    } finally {
      setRemoving(null);
    }
  };

  const configured = providers.filter((p) => p.configured);
  const unconfigured = providers.filter((p) => !p.configured);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        API Keys
      </h1>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Manage OpenCode provider API keys. Keys are stored securely on the host machine.
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

      {/* Restart button */}
      {showRestart && (
        <div className={`mb-4 rounded-lg border p-4 ${isDark ? 'border-amber-700/30 bg-amber-500/10' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                Restart Required
              </p>
              <p className={`text-xs mt-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600'}`}>
                API key changes require a server restart. This may interrupt active conversations or scheduled tasks.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRestart}
              disabled={restarting}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                restarting
                  ? isDark ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : isDark ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-600 text-white hover:bg-amber-500'
              }`}
            >
              {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Restart'}
            </button>
          </div>
        </div>
      )}

      {/* Add key form */}
      <div className={`rounded-xl border p-4 mb-6 ${isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'}`}>
        <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          Add / Update Key
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
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.label} {p.configured ? '(configured)' : ''}
              </option>
            ))}
          </select>

          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={
                selectedProvider
                  ? providers.find((p) => p.provider === selectedProvider)?.placeholder || 'Paste your API key...'
                  : 'Select a provider first'
              }
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
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedProvider || !keyInput.trim() || saving}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              !selectedProvider || !keyInput.trim() || saving
                ? isDark ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : isDark ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Key'}
          </button>
        </div>
      </div>

      {/* Configured providers */}
      {configured.length > 0 && (
        <div className={`rounded-xl border ${isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'}`}>
          <h3 className={`px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Configured
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
                className={`rounded-md p-1.5 transition ${
                  isDark ? 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400' : 'text-zinc-400 hover:bg-rose-50 hover:text-rose-500'
                }`}
                title="Remove key"
              >
                {removing === p.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unconfigured providers */}
      {unconfigured.length > 0 && (
        <div className={`mt-4 rounded-xl border ${isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-white'}`}>
          <h3 className={`px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Available
          </h3>
          {unconfigured.map((p) => (
            <div
              key={p.provider}
              className={`flex items-center gap-3 px-4 py-2.5 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-50'}`}
            >
              <span className={`h-2 w-2 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-zinc-300'}`} />
              <span className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
