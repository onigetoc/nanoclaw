/**
 * Models.dev API Cache Service
 * 
 * Caches the models.dev API JSON (20k+ lines) with 24h TTL.
 * Provides filtered access to providers and models for UI selection.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const CACHE_FILE = path.join(process.cwd(), '.cache', 'models-dev.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

interface ProviderInfo {
  id: string;
  name: string;
  models: ModelInfo[];
}

interface ModelsDevResponse {
  providers?: Array<{
    id: string;
    name: string;
    models?: Array<{
      id: string;
      name: string;
      context_length?: number;
      pricing?: {
        prompt?: number;
        completion?: number;
      };
    }>;
  }>;
}

interface CacheData {
  timestamp: number;
  data: ModelsDevResponse;
}

// Popular providers to pre-select in UI
const POPULAR_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'x-ai', // Grok
  'meta',
  'mistral',
  'cohere',
]);

// OpenCode providers to include (filter out the rest)
const OPENCODE_PROVIDER_FILTER = new Set([
  'opencode',
  'openai',
  'anthropic',
  'google',
  'x-ai',
  'meta',
  'mistral',
  'cohere',
  'deepseek',
  'perplexity',
]);

let memoryCache: CacheData | null = null;

/**
 * Fetch models.dev API data with caching
 */
async function fetchModelsDevData(): Promise<ModelsDevResponse> {
  // Check memory cache first
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL_MS) {
    logger.debug('Using in-memory models cache');
    return memoryCache.data;
  }

  // Check file cache
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as CacheData;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        logger.info('Using file-cached models.dev data');
        memoryCache = cached;
        return cached.data;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read models cache file');
  }

  // Fetch fresh data
  logger.info('Fetching fresh models.dev data');
  try {
    const response = await fetch('https://models.dev/api.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = (await response.json()) as ModelsDevResponse;

    // Cache to file
    const cacheData: CacheData = { timestamp: Date.now(), data };
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData));
      logger.info('Cached models.dev data to file');
    } catch (err) {
      logger.warn({ err }, 'Failed to write models cache file');
    }

    // Cache to memory
    memoryCache = cacheData;
    return data;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch models.dev data');
    throw new Error(`Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get all providers with their models (filtered for OpenCode)
 */
export async function getProviders(): Promise<ProviderInfo[]> {
  const data = await fetchModelsDevData();
  
  if (!data.providers) {
    return [];
  }

  // Add OpenCode's own models first (not in models.dev)
  const openCodeProvider: ProviderInfo = {
    id: 'opencode',
    name: 'OpenCode',
    models: [
      { id: 'opencode/big-pickle', name: 'Big Pickle', provider: 'opencode' },
      { id: 'opencode/trinity-large-preview-free', name: 'Trinity Large (Free)', provider: 'opencode' },
      { id: 'opencode/trinity-large-preview', name: 'Trinity Large', provider: 'opencode' },
      { id: 'opencode/trinity-medium-preview', name: 'Trinity Medium', provider: 'opencode' },
    ],
  };

  const providers: ProviderInfo[] = [openCodeProvider];

  // Filter and transform models.dev providers
  for (const provider of data.providers) {
    if (!OPENCODE_PROVIDER_FILTER.has(provider.id)) {
      continue;
    }

    const models: ModelInfo[] = (provider.models || []).map((m) => ({
      id: m.id,
      name: m.name,
      provider: provider.id,
      context_length: m.context_length,
      pricing: m.pricing,
    }));

    providers.push({
      id: provider.id,
      name: provider.name,
      models,
    });
  }

  return providers;
}

/**
 * Get list of popular provider IDs (for pre-selection in UI)
 */
export function getPopularProviders(): string[] {
  return Array.from(POPULAR_PROVIDERS);
}

/**
 * Clear the cache (force refresh on next request)
 */
export function clearCache(): void {
  memoryCache = null;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      logger.info('Cleared models cache');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clear cache file');
  }
}
