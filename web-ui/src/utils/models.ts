import { getSelectedModels } from './selected-models';

export interface UiModel {
  id: string;
  name: string;
  provider: string;
}

// Get models from user selection in localStorage (async)
export async function getUiModels(): Promise<UiModel[]> {
  return await getSelectedModels();
}

// Sync version for initial render (returns only checked models from localStorage)
export function getUiModelsSync(): UiModel[] {
  // Use user-selected models from Settings > Models (models.dev based selection)
  const saved = localStorage.getItem('eureclaw_models_selections');
  if (!saved) {
    return [];
  }
  
  try {
    const parsed = JSON.parse(saved);
    const modelIds: string[] = parsed.models || [];
    
    if (modelIds.length === 0) {
      return [];
    }

    // Auto-migrate old format IDs (without "/") to "provider/modelId" format.
    // This mirrors the migration in models-cache.ts loadSelections() but runs
    // synchronously so the dropdown always has correct IDs.
    const needsMigration = modelIds.some((id: string) => !id.includes('/'));
    if (needsMigration) {
      const migrated = migrateModelIdsSync(modelIds);
      if (migrated) {
        parsed.models = migrated;
        localStorage.setItem('eureclaw_models_selections', JSON.stringify(parsed));
        console.log('[models] Migrated old model IDs in getUiModelsSync');
        return migrated.map((id: string) => ({
          id,
          name: extractModelName(id),
          provider: extractProvider(id),
        }));
      }
    }
    
    return modelIds.map((id: string) => ({
      id,
      name: extractModelName(id),
      provider: extractProvider(id),
    }));
  } catch {
    return [];
  }
}

/** Sync migration: look up old IDs in the models.dev localStorage cache */
function migrateModelIdsSync(modelIds: string[]): string[] | null {
  let modelsDevData: Record<string, { models: Record<string, { id: string }> }> | null = null;
  try {
    const raw = localStorage.getItem('eureclaw_models_dev_cache');
    if (raw) {
      const entry = JSON.parse(raw);
      modelsDevData = entry.data;
    }
  } catch { /* ignore */ }

  const migrated: string[] = [];
  let changed = false;

  for (const id of modelIds) {
    if (id.includes('/')) {
      migrated.push(id);
      continue;
    }
    let found = false;
    if (modelsDevData) {
      for (const [providerId, providerData] of Object.entries(modelsDevData)) {
        const match = Object.values(providerData.models).find(m => m.id === id);
        if (match) {
          migrated.push(`${providerId}/${match.id}`);
          found = true;
          changed = true;
          break;
        }
      }
    }
    if (!found) {
      migrated.push(`opencode/${id}`);
      changed = true;
    }
  }

  return changed ? migrated : null;
}

function extractModelName(id: string): string {
  const parts = id.split('/');
  if (parts.length > 1) {
    return parts[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return id;
}

function extractProvider(id: string): string {
  const parts = id.split('/');
  return parts[0] || 'unknown';
}

export function getProviderLogoUrl(provider: string): string {
  return `https://models.dev/logos/${provider}.svg`;
}

export const SUGGESTIONS = [
  'Résume les derniers messages et donne 3 actions concrètes',
  'Propose une réponse courte et polie à envoyer',
  'Peux-tu reformuler en style plus professionnel ?',
  'Donne une checklist exécutable pour cette tâche',
];

export function getProviderBadgeColor(provider: string, isDark: boolean): string {
  const lowerProvider = provider.toLowerCase();
  
  if (lowerProvider.includes('anthropic') || lowerProvider.includes('claude')) {
    return isDark
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
      : 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (lowerProvider.includes('openai') || lowerProvider.includes('gpt')) {
    return isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (lowerProvider.includes('google') || lowerProvider.includes('gemini')) {
    return isDark
      ? 'bg-sky-500/15 text-sky-300 border-sky-500/25'
      : 'bg-sky-100 text-sky-700 border-sky-200';
  }
  if (lowerProvider.includes('opencode')) {
    return isDark
      ? 'bg-purple-500/15 text-purple-300 border-purple-500/25'
      : 'bg-purple-100 text-purple-700 border-purple-200';
  }
  
  // Default color for other providers
  return isDark
    ? 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25'
    : 'bg-zinc-100 text-zinc-700 border-zinc-200';
}
