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
        id: model.id,
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
    return JSON.parse(raw);
  } catch {
    return { providers: [], models: [] };
  }
}

/** Save user selections to localStorage */
export function saveSelections(selections: UserSelections): void {
  localStorage.setItem(SELECTIONS_KEY, JSON.stringify(selections));
}
