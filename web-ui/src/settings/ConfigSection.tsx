import { RotateCcw } from 'lucide-react';
import type { Settings } from '../useSettings';

interface ConfigSectionProps {
  settings: Settings;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onReset: () => void;
  isDark: boolean;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  isDark,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  isDark: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-4 py-3 ${
        isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'
      }`}
    >
      <div className="min-w-0 pr-4">
        <div className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          {label}
        </div>
        <div className={`mt-0.5 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
          checked ? 'bg-emerald-500' : isDark ? 'bg-zinc-700' : 'bg-zinc-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function ConfigSection({ settings, onUpdate, onReset, isDark }: ConfigSectionProps) {
  return (
    <div>
      <h1 className={`text-xl font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        Config
      </h1>
      <p className={`text-sm mb-6 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
        UI preferences and behavior settings.
      </p>

      <div
        className={`rounded-xl border ${isDark ? 'border-zinc-800 bg-zinc-800/60' : 'border-zinc-300 bg-zinc-200'}`}
      >
        {/* Developer */}
        <div className="p-2">
          <h3
            className={`mb-1 px-4 pt-2 text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-zinc-500' : 'text-zinc-400'
            }`}
          >
            Developer
          </h3>
          <ToggleRow label="Debug Panel" description="Show agent metadata sidebar in chat" checked={settings.debugPanel} onChange={(v) => onUpdate('debugPanel', v)} isDark={isDark} />
          <ToggleRow label="Show Thinking" description="Display LLM thinking accordion in chat messages" checked={settings.showThinking} onChange={(v) => onUpdate('showThinking', v)} isDark={isDark} />
          <ToggleRow label="Save Thinking" description="Persist LLM thinking to DB for review and debugging" checked={settings.saveThinking} onChange={(v) => onUpdate('saveThinking', v)} isDark={isDark} />
        </div>

        <div className={`border-t ${isDark ? 'border-zinc-800' : 'border-zinc-100'}`} />

        {/* Notifications */}
        <div className="p-2">
          <h3
            className={`mb-1 px-4 pt-2 text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-zinc-500' : 'text-zinc-400'
            }`}
          >
            Notifications
          </h3>
          <ToggleRow label="Desktop Notifications" description="Get notified when new messages arrive" checked={settings.notifications} onChange={(v) => onUpdate('notifications', v)} isDark={isDark} />
          <ToggleRow label="Sound Effects" description="Play a sound on new messages" checked={settings.soundEffects} onChange={(v) => onUpdate('soundEffects', v)} isDark={isDark} />
        </div>

        <div className={`border-t ${isDark ? 'border-zinc-800' : 'border-zinc-100'}`} />

        {/* Behavior */}
        <div className="p-2">
          <h3
            className={`mb-1 px-4 pt-2 text-[10px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-zinc-500' : 'text-zinc-400'
            }`}
          >
            Behavior
          </h3>
          <ToggleRow label="Auto-Scroll" description="Automatically scroll to new messages" checked={settings.autoScroll} onChange={(v) => onUpdate('autoScroll', v)} isDark={isDark} />
        </div>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={onReset}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
          isDark
            ? 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            : 'border-zinc-300 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
        }`}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset to defaults
      </button>
    </div>
  );
}
