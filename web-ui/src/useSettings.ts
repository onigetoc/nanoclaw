import { useState, useCallback, useMemo } from 'react';

const SETTINGS_STORAGE_KEY = 'eureclaw_settings';

export interface Settings {
  /** Show the debug panel for agent metadata (default: true) */
  debugPanel: boolean;
  /** Enable desktop notifications for new messages */
  notifications: boolean;
  /** Auto-scroll to bottom on new messages */
  autoScroll: boolean;
  /** Enable sound effects */
  soundEffects: boolean;
  /** Show the reasoning accordion in chat messages (default: true) */
  showThinking: boolean;
  /** Persist LLM reasoning to DB for later review (default: true) */
  saveThinking: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  debugPanel: true,
  notifications: true,
  autoScroll: true,
  soundEffects: false,
  showThinking: true,
  saveThinking: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettingsState((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = { ...DEFAULT_SETTINGS };
    saveSettings(defaults);
    setSettingsState(defaults);
  }, []);

  return useMemo(
    () => ({ settings, updateSetting, resetSettings }),
    [settings, updateSetting, resetSettings],
  );
}
