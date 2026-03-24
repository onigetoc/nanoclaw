import { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, Trash2, X, Variable, Info } from 'lucide-react';
import { apiService, type EnvVarEntry } from '../api';

interface EnvVarsSectionProps {
  isDark: boolean;
}

/** Sanitize input into a valid env var name */
function sanitize(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-\.]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/^[0-9_]+/, '')
    .replace(/_{2,}/g, '_');
}

export default function EnvVarsSection({ isDark }: EnvVarsSectionProps) {
  const [variables, setVariables] = useState<EnvVarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [varName, setVarName] = useState('');
  const [varValue, setVarValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchVars = useCallback(async () => {
    try {
      const data = await apiService.getEnvVars();
      setVariables(data);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchVars(); }, [fetchVars]);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  const handleNameChange = (raw: string) => {
    setVarName(sanitize(raw));
  };

  const handleSave = async () => {
    const name = varName.trim();
    const value = varValue.trim();
    if (!name || !value) return;

    if (!/^[A-Z][A-Z0-9_]{1,100}$/.test(name)) {
      setFeedback({ type: 'error', msg: 'Variable name must start with a letter, uppercase, underscores only.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const result = await apiService.setEnvVar(name, value);
      setFeedback({ type: 'success', msg: result.message });
      setVarName('');
      setVarValue('');
      await fetchVars();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to set variable' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (name: string) => {
    setRemoving(name);
    setFeedback(null);
    try {
      const result = await apiService.removeEnvVar(name);
      setFeedback({ type: 'success', msg: result.message });
      await fetchVars();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to remove variable' });
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-1">
        <Variable className={`h-5 w-5 ${isDark ? 'text-violet-400' : 'text-violet-600'}`} />
        <h2 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Environment Variables
        </h2>
      </div>
      <p className={`text-sm mb-4 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Set system-level environment variables on the EureClaw host machine.
        The AI agent only sees the variable name, never the actual value.
      </p>

      {/* Info box */}
      <div className={`mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-xs ${
        isDark ? 'bg-violet-500/10 text-violet-300 border border-violet-700/30' : 'bg-violet-50 text-violet-700 border border-violet-200'
      }`}>
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="mb-1 font-medium">How it works</p>
          <p>
            Enter a variable name (e.g. <code className="font-mono">GITHUB_TOKEN</code>) and its value.
            The value is set as a permanent system environment variable.
            Tell EureClaw the variable name so it can use it in projects.
            Requires EureClaw restart to take effect.
          </p>
          <p className="mt-1 opacity-70">
            Format: uppercase letters, numbers, underscores only. Must start with a letter.
          </p>
        </div>
      </div>

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

      {/* Add variable form */}
      <div className={`rounded-xl border p-4 mb-6 ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`}>
        <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          Add / Update Variable
        </h3>

        <div className="flex items-center gap-2">
          {/* Variable name input */}
          <input
            type="text"
            value={varName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="GITHUB_TOKEN"
            className={`w-48 rounded-lg border px-3 py-2 text-sm font-mono ${
              isDark
                ? 'border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600'
                : 'border-zinc-300 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400'
            }`}
          />

          {/* Value input */}
          <input
            type="password"
            value={varValue}
            onChange={(e) => setVarValue(e.target.value)}
            placeholder="Paste your key or token value..."
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-mono ${
              isDark
                ? 'border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600'
                : 'border-zinc-300 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400'
            }`}
          />

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!varName.trim() || !varValue.trim() || saving}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
              !varName.trim() || !varValue.trim() || saving
                ? 'cursor-not-allowed ' + (isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                : isDark ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-violet-600 text-white hover:bg-violet-500'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set Variable'}
          </button>
        </div>
      </div>

      {/* Saved variables list */}
      {variables.length > 0 && (
        <div className={`rounded-xl border ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`}>
          <h3 className={`px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Registered Variables
          </h3>
          {variables.map((v) => (
            <div
              key={v.name}
              className={`flex items-center justify-between px-4 py-2.5 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-50'}`}
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_4px_rgba(167,139,250,0.4)]" />
                <code className={`text-sm font-mono ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{v.name}</code>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(v.name)}
                disabled={removing === v.name}
                className={`cursor-pointer rounded-md p-1.5 transition ${
                  isDark ? 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400' : 'text-zinc-400 hover:bg-rose-50 hover:text-rose-500'
                } ${removing === v.name ? 'cursor-not-allowed opacity-50' : ''}`}
                title="Remove variable"
              >
                {removing === v.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
