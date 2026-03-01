import { type Settings } from './useSettings';
import { RotateCcw, X } from 'lucide-react';

interface SettingsPageProps {
  settings: Settings;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onReset: () => void;
  onClose: () => void;
  isDark: boolean;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  isDark: boolean;
}

function ToggleRow({ label, description, checked, onChange, isDark }: ToggleRowProps) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'}`}>
      <div className="min-w-0 pr-4">
        <div className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{label}</div>
        <div className={`mt-0.5 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-emerald-500' : isDark ? 'bg-zinc-700' : 'bg-zinc-300'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage({ settings, onUpdate, onReset, onClose, isDark }: SettingsPageProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className={`flex h-16 items-center justify-between border-b px-5 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <h2 className="text-lg font-semibold">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {/* Developer section */}
        <div className="mb-6">
          <h3 className={`mb-2 px-4 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Developer
          </h3>
          <ToggleRow
            label="Debug Panel"
            description="Show agent metadata sidebar (model, tokens, cost)"
            checked={settings.debugPanel}
            onChange={(v) => onUpdate('debugPanel', v)}
            isDark={isDark}
          />
          <ToggleRow
            label="Show Token Counts"
            description="Display token counts on bot messages inline"
            checked={settings.showTokenCounts}
            onChange={(v) => onUpdate('showTokenCounts', v)}
            isDark={isDark}
          />
        </div>

        {/* Display section */}
        <div className="mb-6">
          <h3 className={`mb-2 px-4 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Display
          </h3>
          <ToggleRow
            label="Show Timestamps"
            description="Always show timestamps on messages"
            checked={settings.showTimestamps}
            onChange={(v) => onUpdate('showTimestamps', v)}
            isDark={isDark}
          />
          <ToggleRow
            label="Compact Mode"
            description="Reduce spacing between messages"
            checked={settings.compactMode}
            onChange={(v) => onUpdate('compactMode', v)}
            isDark={isDark}
          />
        </div>

        {/* Notifications section */}
        <div className="mb-6">
          <h3 className={`mb-2 px-4 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Notifications
          </h3>
          <ToggleRow
            label="Desktop Notifications"
            description="Get notified when new messages arrive"
            checked={settings.notifications}
            onChange={(v) => onUpdate('notifications', v)}
            isDark={isDark}
          />
          <ToggleRow
            label="Sound Effects"
            description="Play a sound on new messages"
            checked={settings.soundEffects}
            onChange={(v) => onUpdate('soundEffects', v)}
            isDark={isDark}
          />
        </div>

        {/* Behavior section */}
        <div className="mb-6">
          <h3 className={`mb-2 px-4 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Behavior
          </h3>
          <ToggleRow
            label="Auto-Scroll"
            description="Automatically scroll to new messages"
            checked={settings.autoScroll}
            onChange={(v) => onUpdate('autoScroll', v)}
            isDark={isDark}
          />
        </div>
      </div>

      {/* Footer */}
      <div className={`border-t p-3 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <button
          type="button"
          onClick={onReset}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200' : 'border-zinc-300 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'}`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
