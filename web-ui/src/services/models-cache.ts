/**
 * Models.dev cache service for the web UI.
 * 
 * Fetches https://models.dev/api.json directly from the browser,
 * caches in localStorage with 24h TTL.
 * User selections (checked providers/models) stored separately.
 */

const CACHE_KEY = 'eureclaw_models_dev_cache';
const SELECTIONS_KEY = 'eureclaw_models_selections';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MODELS_DEV_URL = 'https://models.dev/api.json';

/** Raw model from models.dev */
export interface ModelsDevModel {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
  release_date?: string;
}

/** Raw provider from models.dev */
export interface ModelsDevProvider {
  id: string;
  name: string;
  env?: string[];
  npm?: string;
  api?: string;
  doc?: string;
  models: Record<string, ModelsDevModel>;
}

/** The full models.dev response: { providerId: ProviderData } */
export type ModelsDevData = Record<string, ModelsDevProvider>;

interface CacheEntry {
  timestamp: number;
  data: ModelsDevData;
}

export interface UserSelections {
  providers: string[];
  models: string[];
}

/**
 * Get OpenCode free models dynamically from models.dev
 */
export function getOpenCodeFreeModels(modelsDevData: ModelsDevData): Array<{ id: string; name: string }> {
  const openCodeProvider = modelsDevData['opencode'];
  if (!openCodeProvider) return [];

  const freeModels: Array<{ id: string; name: string }> = [];
  
  for (const [, model] of Object.entries(openCodeProvider.models)) {
    // Check if model is free (cost is 0 or very low)
    if (model.cost && model.cost.input !== undefined && (model.cost.input === 0 || model.cost.input < 0.01)) {
      freeModels.push({
        id: model.id.includes('/') ? model.id : `opencode/${model.id}`,
        name: model.name,
      });
    }
  }
  
  return freeModels;
}

/**
 * Get models.dev data — from localStorage cache if fresh, otherwise fetch.
 */
export async function getModelsDevData(forceRefresh = false): Promise<ModelsDevData> {
  if (!forceRefresh) {
    const cached = loadFromCache();
    if (cached) return cached;
  }

  const response = await fetch(MODELS_DEV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev: ${response.status}`);
  }

  const data: ModelsDevData = await response.json();
  saveToCache(data);
  return data;
}

function loadFromCache(): ModelsDevData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;

    return entry.data;
  } catch {
    return null;
  }
}

function saveToCache(data: ModelsDevData): void {
  try {
    const entry: CacheEntry = { timestamp: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (err) {
    console.warn('Failed to cache models.dev data:', err);
  }
}

/** Clear the models.dev cache (force re-fetch next time) */
export function clearModelsCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

/** Load user selections from localStorage */
export function loadSelections(): UserSelections {
  try {
    const raw = localStorage.getItem(SELECTIONS_KEY);
    if (!raw) return { providers: [], models: [] };
    const parsed: UserSelections = JSON.parse(raw);
    
    // Auto-migrate old format: IDs without "/" (e.g. "big-pickle") need to be
    // looked up in the models.dev cache to find their real provider and stored
    // as "provider/modelId".  This runs once — after migration the IDs already
    // contain "/" so the check is a no-op.
    const needsMigration = parsed.models.some(id => !id.includes('/'));
    if (needsMigration) {
      const migrated = migrateOldModelIds(parsed.models);
      if (migrated) {
        parsed.models = migrated;
        saveSelections(parsed);
        console.log('[models-cache] Migrated old model IDs to provider/modelId format');
      }
    }
    
    return parsed;
  } catch {
    return { providers: [], models: [] };
  }
}

/**
 * Migrate old model IDs (without provider prefix) to "provider/modelId" format.
 * Uses the cached models.dev data to find which provider owns each model.
 */
function migrateOldModelIds(modelIds: string[]): string[] | null {
  // Load models.dev cache synchronously (already in localStorage)
  let modelsDevData: ModelsDevData | null = null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw);
      modelsDevData = entry.data;
    }
  } catch { /* ignore */ }

  const migrated: string[] = [];
  let changed = false;

  for (const id of modelIds) {
    if (id.includes('/')) {
      // Already in correct format
      migrated.push(id);
      continue;
    }

    // Old format — find the provider that owns this model ID
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
      // Can't find provider — assume opencode as fallback
      migrated.push(`opencode/${id}`);
      changed = true;
    }
  }

  return changed ? migrated : null;
}

/** Save user selections to localStorage */
export function saveSelections(selections: UserSelections): void {
  localStorage.setItem(SELECTIONS_KEY, JSON.stringify(selections));
}
