import { useState, useEffect } from 'react';
import { ArrowLeft, Save, CheckCircle2, XCircle } from 'lucide-react';
import { apiService, type RegisteredWorkspace } from '../api';
import CronBuilder from './CronBuilder';

interface CronJobCreateProps {
  isDark: boolean;
  onBack: () => void;
  onCreated: () => void;
}

/** Deduplicate workspaces: multiple JIDs can map to the same folder */
function buildWorkspaceList(ws: Record<string, RegisteredWorkspace>) {
  const map = new Map<string, { folder: string; name: string; jids: string[] }>();
  for (const [jid, w] of Object.entries(ws)) {
    const existing = map.get(w.folder);
    if (existing) {
      existing.jids.push(jid);
    } else {
      map.set(w.folder, { folder: w.folder, name: w.name, jids: [jid] });
    }
  }
  return Array.from(map.values());
}

export default function CronJobCreate({ isDark, onBack, onCreated }: CronJobCreateProps) {
  const [workspaceList, setWorkspaceList] = useState<Array<{ folder: string; name: string; jids: string[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state — only what the user actually needs to fill
  const [selectedFolder, setSelectedFolder] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState('cron');
  const [scheduleValue, setScheduleValue] = useState('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch workspaces dynamically from the API
  useEffect(() => {
    apiService.getWorkspaces().then((ws) => {
      const list = buildWorkspaceList(ws);
      setWorkspaceList(list);
      if (list.length > 0) setSelectedFolder(list[0].folder);
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!selectedFolder || !prompt.trim() || !scheduleValue.trim()) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    // Auto-resolve chat_jid: use the first JID registered for this workspace
    const ws = workspaceList.find((w) => w.folder === selectedFolder);
    if (!ws || ws.jids.length === 0) {
      showToast('No channel registered for this workspace', 'error');
      return;
    }

    setLoading(true);
    try {
      await apiService.createTask({
        workspace_folder: selectedFolder,
        chat_jid: ws.jids[0],
        prompt: prompt.trim(),
        schedule_type: scheduleType,
        schedule_value: scheduleValue.trim(),
        context_mode: 'isolated',
      });
      showToast('Cron job created');
      onCreated();
    } catch (err: any) {
      showToast(err.message || 'Failed to create task', 'error');
    }
    setLoading(false);
  };

  const cardClass = `rounded-xl border p-5 ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`;
  const labelClass = `text-[10px] font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`;
  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
    isDark
      ? 'border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-emerald-500'
      : 'border-zinc-300 bg-white text-zinc-800 focus:border-emerald-500'
  }`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className={`rounded-lg p-2 transition ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>New Cron Job</h1>
      </div>

      <div className="space-y-4">
        {/* Workspace selector — dynamic from API */}
        <div className={cardClass}>
          <label className={labelClass}>Workspace</label>
          {workspaceList.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>No workspaces registered yet.</p>
          ) : (
            <select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)} className={inputClass}>
              {workspaceList.map((ws) => (
                <option key={ws.folder} value={ws.folder}>{ws.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Prompt */}
        <div className={cardClass}>
          <label className={labelClass}>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="What should the agent do when this task runs?"
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>

        {/* Schedule */}
        <div className={cardClass}>
          <label className={labelClass}>Schedule</label>
          <div className="mb-3">
            <select value={scheduleType} onChange={(e) => { setScheduleType(e.target.value); setScheduleValue(''); }} className={inputClass} style={{ maxWidth: 140 }}>
              <option value="cron">Cron</option>
              <option value="interval">Interval</option>
              <option value="once">Once</option>
            </select>
          </div>

          {scheduleType === 'cron' ? (
            <CronBuilder
              value={scheduleValue || '0 9 * * *'}
              onChange={setScheduleValue}
              isDark={isDark}
            />
          ) : (
            <>
              <input
                type="text"
                value={scheduleValue}
                onChange={(e) => setScheduleValue(e.target.value)}
                placeholder={scheduleType === 'interval' ? '3600000' : '2026-04-01T15:30:00'}
                className={inputClass}
              />
              <p className={`text-[11px] mt-2 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {scheduleType === 'interval' && 'Milliseconds between runs — e.g. 3600000 = every hour'}
                {scheduleType === 'once' && 'Local time — e.g. 2026-04-01T15:30:00'}
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onBack}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !prompt.trim() || !scheduleValue.trim() || !selectedFolder}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
              isDark ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Save className="h-3.5 w-3.5" />
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
