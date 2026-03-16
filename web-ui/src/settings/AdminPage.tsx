import { useState, useEffect, useCallback } from 'react';
import { apiService, type MonitoringData } from '../api';
import type { Settings } from '../useSettings';
import SettingsNav, { type SettingsSection } from './SettingsNav';
import OverviewSection from './OverviewSection';
import SessionsSection from './SessionsSection';
import DebugSection from './DebugSection';
import LogsSection from './LogsSection';
import ApiKeysSection from './ApiKeysSection';
import ModelsSection from './ModelsSection';
import ConfigSection from './ConfigSection';
import FilesSection from './FilesSection';

interface AdminPageProps {
  onBack: () => void;
  isDark: boolean;
  serverOnline: boolean;
  settings: Settings;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onResetSettings: () => void;
}

export default function AdminPage({
  onBack,
  isDark,
  serverOnline,
  settings,
  onUpdateSetting,
  onResetSettings,
}: AdminPageProps) {
  const [section, setSection] = useState<SettingsSection>('overview');
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);

  const fetchMonitoring = useCallback(async () => {
    try {
      const data = await apiService.getMonitoring();
      // Fetch system info and merge it into monitoring data
      try {
        const systemInfo = await apiService.getSystemInfo();
        data.systemInfo = systemInfo;
      } catch {
        // System info endpoint might not be available
      }
      setMonitoringData(data);
    } catch {
      // Server might be offline
    }
  }, []);

  // Fetch on mount and poll every 10s
  useEffect(() => {
    void fetchMonitoring();
    const interval = setInterval(fetchMonitoring, 10_000);
    return () => clearInterval(interval);
  }, [fetchMonitoring]);

  // Also refresh when switching sections
  useEffect(() => {
    void fetchMonitoring();
  }, [section, fetchMonitoring]);

  return (
    <div className={`flex h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      <SettingsNav active={section} onSelect={setSection} onBack={onBack} isDark={isDark} />

      <main className={`flex min-w-0 flex-1 flex-col ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
        {/* Top bar */}
        <header
          className={`flex h-16 items-center justify-between border-b px-6 ${
            isDark ? 'border-zinc-800 bg-zinc-950/90' : 'border-zinc-200 bg-zinc-50/90'
          }`}
        >
          <div />
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                serverOnline
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                  : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]'
              }`}
            />
            <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {serverOnline ? 'Health OK' : 'Offline'}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className={`mx-auto w-full ${section === 'files' ? 'max-w-7xl' : 'max-w-6xl'}`}>
            {section === 'overview' && (
              <OverviewSection data={monitoringData} serverOnline={serverOnline} isDark={isDark} />
            )}
            {section === 'sessions' && (
              <SessionsSection sessions={monitoringData?.sessions} isDark={isDark} />
            )}
            {section === 'debug' && (
              <DebugSection
                executions={monitoringData?.recent ?? []}
                isDark={isDark}
              />
            )}
            {section === 'logs' && (
              <LogsSection
                executions={monitoringData?.recent ?? []}
                onRefresh={fetchMonitoring}
                isDark={isDark}
              />
            )}
            {section === 'files' && (
              <FilesSection isDark={isDark} />
            )}
            {section === 'apikeys' && (
              <ApiKeysSection isDark={isDark} />
            )}
            {section === 'models' && (
              <ModelsSection isDark={isDark} />
            )}
            {section === 'config' && (
              <ConfigSection
                settings={settings}
                onUpdate={onUpdateSetting}
                onReset={onResetSettings}
                isDark={isDark}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
