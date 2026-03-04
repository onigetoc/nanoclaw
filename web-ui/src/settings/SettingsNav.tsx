import {
  Activity,
  ArrowLeft,
  Bug,
  FileWarning,
  Key,
  Radio,
  Settings,
  Sparkles,
} from 'lucide-react';

export type SettingsSection =
  | 'overview'
  | 'sessions'
  | 'debug'
  | 'logs'
  | 'apikeys'
  | 'models'
  | 'config';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <Activity className="h-4 w-4" />, group: 'Control' },
  { id: 'sessions', label: 'Sessions', icon: <Radio className="h-4 w-4" />, group: 'Control' },
  { id: 'debug', label: 'Debug', icon: <Bug className="h-4 w-4" />, group: 'Agent' },
  { id: 'logs', label: 'Logs', icon: <FileWarning className="h-4 w-4" />, group: 'Agent' },
  { id: 'apikeys', label: 'API Keys', icon: <Key className="h-4 w-4" />, group: 'Settings' },
  { id: 'models', label: 'Models', icon: <Sparkles className="h-4 w-4" />, group: 'Settings' },
  { id: 'config', label: 'Config', icon: <Settings className="h-4 w-4" />, group: 'Settings' },
];

interface SettingsNavProps {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  onBack: () => void;
  isDark: boolean;
}

export default function SettingsNav({ active, onSelect, onBack, isDark }: SettingsNavProps) {
  const groups = [...new Set(NAV_ITEMS.map((i) => i.group))];

  return (
    <aside
      className={`flex w-64 shrink-0 flex-col border-r ${
        isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      {/* Header */}
      <div
        className={`flex h-16 items-center gap-3 border-b px-4 ${
          isDark ? 'border-zinc-800' : 'border-zinc-300'
        }`}
      >
        <span className="text-base font-semibold">EureClaw</span>
      </div>

      {/* Back to Chat button */}
      <div className={`border-b px-3 py-2.5 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <button
          type="button"
          onClick={onBack}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isDark
              ? 'text-emerald-300 hover:bg-emerald-500/10'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Chat
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <div
              className={`mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-zinc-600' : 'text-zinc-400'
              }`}
            >
              {group}
            </div>
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? isDark
                        ? 'bg-zinc-800 text-zinc-100 font-medium'
                        : 'bg-zinc-200 text-zinc-900 font-medium'
                      : isDark
                        ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
