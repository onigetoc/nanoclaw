import { useState, useCallback, useMemo } from 'react';

const SETTINGS_STORAGE_KEY = 'eureclaw_settings';

export interface Settings {
  /** Show the debug panel for agent metadata (default: false) */
  debugPanel: boolean;
  /** Enable desktop notifications for new messages */
  notifications: boolean;
  /** Auto-scroll to bottom on new messages */
  autoScroll: boolean;
  /** Show timestamps on every message (vs. only on hover) */
  showTimestamps: boolean;
  /** Show token counts inline on bot messages */
  showTokenCounts: boolean;
  /** Compact message layout */
  compactMode: boolean;
  /** Enable sound effects */
  soundEffects: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  debugPanel: false,
  notifications: true,
  autoScroll: true,
  showTimestamps: false,
  showTokenCounts: false,
  compactMode: false,
  soundEffects: false,
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
