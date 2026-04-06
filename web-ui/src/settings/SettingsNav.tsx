import {
  Clock,
  FileText,
  Key,
  MessageSquare,
  Radio,
  Settings,
  Sparkles,
  LayoutDashboard,
  Zap,
  Wrench,
  BarChart3,
} from 'lucide-react';

export type SettingsSection =
  | 'overview'
  | 'sessions'
  | 'cron'
  | 'activity'
  | 'files'
  | 'opencode'
  | 'apikeys'
  | 'models'
  | 'modelstats'
  | 'config';

interface NavItem {
  id: SettingsSection;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Tailwind color used when active (icon + text + bg tint) */
  accent: string;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  // Control
  { id: 'overview',  label: 'Overview',          Icon: LayoutDashboard, accent: 'emerald',  group: 'Control' },
  { id: 'sessions',  label: 'Sessions',          Icon: Radio,           accent: 'sky',      group: 'Control' },
  { id: 'cron',      label: 'Cron Jobs',         Icon: Clock,           accent: 'amber',    group: 'Control' },
  // Agent
  { id: 'activity',  label: 'Activity',          Icon: Zap,             accent: 'violet',   group: 'Agent' },
  { id: 'files',     label: 'Files',             Icon: FileText,        accent: 'amber',    group: 'Agent' },
  { id: 'opencode',  label: 'Tools',             Icon: Wrench,          accent: 'blue',     group: 'Agent' },
  // Settings
  { id: 'apikeys',   label: 'API Keys / Env Vars', Icon: Key,           accent: 'rose',     group: 'Settings' },
  { id: 'models',    label: 'Models',            Icon: Sparkles,        accent: 'purple',   group: 'Settings' },
  { id: 'modelstats', label: 'Model Stats',      Icon: BarChart3,       accent: 'cyan',     group: 'Settings' },
  { id: 'config',    label: 'Config',            Icon: Settings,        accent: 'zinc',     group: 'Settings' },
];

/** Active-state classes per accent color: text + icon color, tinted background */
const ACCENT_CLASSES: Record<string, { dark: string; light: string }> = {
  emerald: {
    dark:  'text-emerald-400 bg-emerald-500/10',
    light: 'text-emerald-600 bg-emerald-50',
  },
  sky: {
    dark:  'text-sky-400 bg-sky-500/10',
    light: 'text-sky-600 bg-sky-50',
  },
  amber: {
    dark:  'text-amber-400 bg-amber-500/10',
    light: 'text-amber-600 bg-amber-50',
  },
  violet: {
    dark:  'text-violet-400 bg-violet-500/10',
    light: 'text-violet-600 bg-violet-50',
  },
  blue: {
    dark:  'text-blue-400 bg-blue-500/10',
    light: 'text-blue-600 bg-blue-50',
  },
  rose: {
    dark:  'text-rose-400 bg-rose-500/10',
    light: 'text-rose-600 bg-rose-50',
  },
  purple: {
    dark:  'text-purple-400 bg-purple-500/10',
    light: 'text-purple-600 bg-purple-50',
  },
  cyan: {
    dark:  'text-cyan-400 bg-cyan-500/10',
    light: 'text-cyan-600 bg-cyan-50',
  },
  zinc: {
    dark:  'text-zinc-200 bg-zinc-800',
    light: 'text-zinc-800 bg-white shadow-sm',
  },
};

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
      className={`relative z-20 flex w-72 shrink-0 flex-col border-r ${
        isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-300 bg-zinc-200'
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
      <div className={`border-b px-3 py-2.5 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <button
          type="button"
          onClick={onBack}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isDark
              ? 'text-emerald-300 hover:bg-emerald-500/10'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Back to Chat
        </button>
      </div>

      {/* Nav items — scrollable, content hidden behind header/footer */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <div
              className={`mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-zinc-600' : 'text-zinc-500'
              }`}
            >
              {group}
            </div>
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const isActive = active === item.id;
              const accent = ACCENT_CLASSES[item.accent] || ACCENT_CLASSES.zinc;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? `font-medium ${isDark ? accent.dark : accent.light}`
                      : isDark
                        ? 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                        : 'text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
                  }`}
                >
                  <item.Icon className="h-4 w-4" />
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
