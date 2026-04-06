import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ThumbsUp, ThumbsDown, BarChart3, RefreshCw } from 'lucide-react';
import { apiService, type ModelStatsEntry } from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

interface ModelStatsSectionProps {
  isDark: boolean;
}

/** Shorten model names for chart labels (e.g. "anthropic/claude-3.5-sonnet" → "claude-3.5-sonnet") */
function shortModelName(id: string): string {
  const parts = id.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : id;
}

/** Pick a color per provider */
function providerColor(provider: string): { bg: string; border: string } {
  const p = provider.toLowerCase();
  if (p.includes('openai')) return { bg: 'rgba(16,163,127,0.7)', border: '#10a37f' };
  if (p.includes('anthropic')) return { bg: 'rgba(204,132,63,0.7)', border: '#cc843f' };
  if (p.includes('openrouter')) return { bg: 'rgba(139,92,246,0.7)', border: '#8b5cf6' };
  if (p.includes('google')) return { bg: 'rgba(66,133,244,0.7)', border: '#4285f4' };
  if (p.includes('mistral')) return { bg: 'rgba(249,115,22,0.7)', border: '#f97316' };
  return { bg: 'rgba(161,161,170,0.7)', border: '#a1a1aa' };
}

export default function ModelStatsSection({ isDark }: ModelStatsSectionProps) {
  const [stats, setStats] = useState<ModelStatsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(() => {
    return apiService
      .getModelStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats().finally(() => setLoading(false));
  }, [fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className={`rounded-xl border p-8 text-center ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
        <BarChart3 className={`mx-auto mb-3 h-10 w-10 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`} />
        <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          No feedback data yet. Use the thumbs up/down icons on bot messages to start tracking model quality.
        </p>
      </div>
    );
  }

  const labels = stats.map((s) => shortModelName(s.model_id));
  const colors = stats.map((s) => providerColor(s.provider_id));

  // Bar chart: thumbs up vs down per model
  const barData = {
    labels,
    datasets: [
      {
        label: 'Thumbs Up',
        data: stats.map((s) => s.thumbs_up),
        backgroundColor: 'rgba(52,211,153,0.7)',
        borderColor: '#34d399',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Thumbs Down',
        data: stats.map((s) => s.thumbs_down),
        backgroundColor: 'rgba(251,113,133,0.7)',
        borderColor: '#fb7185',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: isDark ? '#a1a1aa' : '#52525b', font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          afterLabel: (ctx: any) => {
            const s = stats[ctx.dataIndex];
            return `Provider: ${s.provider_id}\nScore: ${s.score}%`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: isDark ? '#71717a' : '#a1a1aa', font: { size: 11 } },
        grid: { color: isDark ? 'rgba(63,63,70,0.3)' : 'rgba(228,228,231,0.5)' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: isDark ? '#71717a' : '#a1a1aa', stepSize: 1 },
        grid: { color: isDark ? 'rgba(63,63,70,0.3)' : 'rgba(228,228,231,0.5)' },
      },
    },
  };

  // Doughnut: total votes per model
  const doughnutData = {
    labels: stats.map((s) => `${shortModelName(s.model_id)} (${s.provider_id})`),
    datasets: [
      {
        data: stats.map((s) => s.total),
        backgroundColor: colors.map((c) => c.bg),
        borderColor: colors.map((c) => c.border),
        borderWidth: 2,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: isDark ? '#a1a1aa' : '#52525b', font: { size: 11 }, padding: 16 },
      },
    },
  };

  const totalUp = stats.reduce((a, s) => a + s.thumbs_up, 0);
  const totalDown = stats.reduce((a, s) => a + s.thumbs_down, 0);
  const totalVotes = totalUp + totalDown;

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h1 className={`text-lg font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
          Model Stats
        </h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
            isDark
              ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          } ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-xl border p-4 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
          <div className="flex items-center gap-2 text-emerald-400">
            <ThumbsUp className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Good</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{totalUp}</p>
        </div>
        <div className={`rounded-xl border p-4 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
          <div className="flex items-center gap-2 text-rose-400">
            <ThumbsDown className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Bad</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{totalDown}</p>
        </div>
        <div className={`rounded-xl border p-4 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
          <div className="flex items-center gap-2 text-zinc-400">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Total</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{totalVotes}</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className={`rounded-xl border p-5 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
        <h3 className={`mb-4 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
          Feedback by Model
        </h3>
        <div className="h-72">
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      {/* Doughnut + table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`rounded-xl border p-5 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
          <h3 className={`mb-4 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
            Vote Distribution
          </h3>
          <div className="h-64">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>

        <div className={`rounded-xl border p-5 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
          <h3 className={`mb-4 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
            Model Leaderboard
          </h3>
          <div className="space-y-2">
            {stats
              .sort((a, b) => b.score - a.score || b.total - a.total)
              .map((s) => (
                <div
                  key={`${s.provider_id}-${s.model_id}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-100'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      {shortModelName(s.model_id)}
                    </p>
                    <p className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {s.provider_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-400">{s.thumbs_up}↑</span>
                    <span className="text-rose-400">{s.thumbs_down}↓</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        s.score >= 70
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : s.score >= 40
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {s.score}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
