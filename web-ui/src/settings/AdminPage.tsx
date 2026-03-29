import { useState, useEffect, useCallback } from 'react';
import { apiService, type MonitoringData, type AgentExecution } from '../api';
import type { StepEvent, ExecutionUpdateEvent } from '../websocket';
import type { Settings } from '../useSettings';
import SettingsNav, { type SettingsSection } from './SettingsNav';
import OverviewSection from './OverviewSection';
import SessionsSection from './SessionsSection';
import CronJobsSection from './CronJobsSection';
import ApiKeysSection from './ApiKeysSection';
import ModelsSection from './ModelsSection';
import ConfigSection from './ConfigSection';
import ActivityView from './ActivityView';
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
      setMonitoringData(data);
    } catch {
      // Server might be offline
    }
  }, []);

  // Fetch on mount and poll every 10s (background refresh for non-activity sections)
  useEffect(() => {
    void fetchMonitoring();
    const interval = setInterval(fetchMonitoring, 10_000);
    return () => clearInterval(interval);
  }, [fetchMonitoring]);

  // Real-time execution updates via WebSocket — instantly reflects start/complete/error
  useEffect(() => {
    const unsubExec = apiService.onExecutionUpdate((event: ExecutionUpdateEvent) => {
      const exec = event.execution as AgentExecution;
      setMonitoringData((prev) => {
        if (!prev) return prev;
        const isTerminal = exec.status === 'completed' || exec.status === 'error';

        // Remove from active if terminal
        let active = prev.active.filter((e) => e.id !== exec.id);
        let recent = prev.recent.filter((e) => e.id !== exec.id);

        if (isTerminal) {
          // Add to recent (front)
          recent = [exec, ...recent];
        } else {
          // Add/update in active
          active = [exec, ...active.filter((e) => e.id !== exec.id)];
        }

        return { ...prev, active, recent };
      });
    });

    // Real-time step updates — append steps to the matching execution
    const unsubStep = apiService.onStep((event: StepEvent) => {
      setMonitoringData((prev) => {
        if (!prev) return prev;
        const updateSteps = (list: AgentExecution[]): AgentExecution[] =>
          list.map((e) => {
            if (e.id !== event.executionId) return e;
            const steps = e.steps ? [...e.steps] : [];
            // Calculate duration on previous step
            if (steps.length > 0) {
              const prevStep = steps[steps.length - 1];
              if (!prevStep.durationMs) {
                prevStep.durationMs =
                  new Date(event.step.timestamp).getTime() -
                  new Date(prevStep.timestamp).getTime();
              }
            }
            steps.push(event.step as AgentExecution['steps'] extends (infer T)[] | undefined ? T : never);
            return { ...e, steps };
          });

        return {
          ...prev,
          active: updateSteps(prev.active),
          recent: updateSteps(prev.recent),
        };
      });
    });

    return () => {
      unsubExec();
      unsubStep();
    };
  }, []);

  return (
    <div className={`flex h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      <SettingsNav active={section} onSelect={setSection} onBack={onBack} isDark={isDark} />

      <main className={`flex min-w-0 flex-1 flex-col ${isDark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
        {/* Top bar */}
        <header
          className={`flex h-16 items-center justify-between border-b px-6 ${
            isDark ? 'border-zinc-800 bg-zinc-950/90' : 'border-zinc-300 bg-zinc-100/95'
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
            {section === 'cron' && (
              <CronJobsSection isDark={isDark} />
            )}
            {section === 'activity' && (
              <ActivityView
                executions={monitoringData?.recent ?? []}
                activeExecutions={monitoringData?.active ?? []}
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
