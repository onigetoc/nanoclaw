/**
 * Model Fallback System
 * 
 * Reads eureclaw.json for fallback model configuration.
 * When a model fails (timeout, rate limit, quota exceeded, empty response, etc.),
 * automatically retries with the next fallback model.
 * 
 * Supports separate fallback chains for primary (large) and small models.
 */
import fs from 'fs';
import path from 'path';

export interface ModelsConfig {
  primary: string;
  small: string;
  primaryFallbacks: string[];
  smallFallbacks: string[];
  maxRetries: number;
}

export interface EureClawConfig {
  models: ModelsConfig;
}

const DEFAULT_CONFIG: EureClawConfig = {
  models: {
    primary: 'google/gemini-2.5-flash-lite',
    small: 'google/gemini-2.0-flash-lite',
    primaryFallbacks: [],
    smallFallbacks: [],
    maxRetries: 2,
  },
};

/**
 * Load eureclaw.json from the project directory.
 * Falls back to sensible defaults if the file doesn't exist.
 */
export function loadEureClawConfig(projectDir: string): EureClawConfig {
  const configPath = path.join(projectDir, 'eureclaw.json');

  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const m = parsed.models || {};

    return {
      models: {
        primary: m.primary || DEFAULT_CONFIG.models.primary,
        small: m.small || DEFAULT_CONFIG.models.small,
        primaryFallbacks: Array.isArray(m.primaryFallbacks) ? m.primaryFallbacks : [],
        smallFallbacks: Array.isArray(m.smallFallbacks) ? m.smallFallbacks : [],
        maxRetries: typeof m.maxRetries === 'number' ? m.maxRetries : 2,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Parse a "provider/model" string into the override format expected by OpenCode SDK.
 */
export function parseModel(modelStr: string): { providerID: string; modelID: string } | undefined {
  const slashIdx = modelStr.indexOf('/');
  if (slashIdx > 0) {
    return { providerID: modelStr.slice(0, slashIdx), modelID: modelStr.slice(slashIdx + 1) };
  }
  return undefined;
}

/**
 * Determine if an error is a model-level failure that warrants a fallback retry.
 */
export function isModelError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  const patterns = [
    'rate limit', 'rate_limit', 'ratelimit', 'quota', 'exceeded',
    'too many requests', '429', '503', '502', 'service unavailable',
    'model not found', 'model_not_found', 'not available',
    'capacity', 'overloaded', 'timeout', 'timed out',
    'fetch failed', 'econnrefused', 'econnreset', 'abort',
    'context_length', 'context window', 'maximum context length',
    'billing', 'payment', 'insufficient', 'deprecated', 'decommissioned',
  ];

  return patterns.some(p => lower.includes(p));
}

/**
 * Check if an SDK response indicates a model failure.
 * Covers: in-band errors (info.error), AND empty responses (no parts, empty data).
 * OpenCode often returns HTTP 200 with {} when a free model is dead.
 */
export function isResponseFailure(responseData: any): { failed: boolean; reason: string } {
  // Case 1: response is null/undefined
  if (!responseData) {
    return { failed: true, reason: 'null response data' };
  }

  // Case 2: response is empty object {}
  const keys = Object.keys(responseData);
  if (keys.length === 0) {
    return { failed: true, reason: 'empty response (model likely unavailable)' };
  }

  // Case 3: in-band error in info.error
  const infoError = responseData.info?.error;
  if (infoError) {
    const errorName = infoError.name || infoError.type || '';
    const errorMessage = infoError.message || '';
    const combined = `${errorName} ${errorMessage}`;
    if (isModelError(new Error(combined))) {
      return { failed: true, reason: combined };
    }
  }

  // Case 4: has parts array but it's empty (model returned nothing)
  const parts = responseData.parts;
  if (Array.isArray(parts) && parts.length === 0) {
    return { failed: true, reason: 'empty parts array (no model output)' };
  }

  // Case 5: has parts but no text content at all
  if (Array.isArray(parts) && parts.length > 0) {
    const hasText = parts.some((p: any) => p.type === 'text' && p.text?.trim());
    if (!hasText) {
      return { failed: true, reason: 'parts present but no text content' };
    }
  }

  return { failed: false, reason: '' };
}

/**
 * Determine which model the opencode.json configures for a given role.
 * The "model" field is the primary (large) model.
 * The "small_model" field is the small model.
 * OpenCode SDK picks which one to use based on the task complexity.
 * We can't know for sure which one was used until after the response.
 */
export function detectModelRole(
  usedModelStr: string | undefined,
  config: ModelsConfig,
): 'primary' | 'small' | 'unknown' {
  if (!usedModelStr) return 'unknown';
  const lower = usedModelStr.toLowerCase();
  if (lower === config.primary.toLowerCase()) return 'primary';
  if (lower === config.small.toLowerCase()) return 'small';
  // Check if it's in the fallback lists
  if (config.primaryFallbacks.some(f => f.toLowerCase() === lower)) return 'primary';
  if (config.smallFallbacks.some(f => f.toLowerCase() === lower)) return 'small';
  return 'unknown';
}

/**
 * Build the ordered list of models to try for fallback.
 * Uses the explicit override first, then the appropriate fallback chain.
 */
export function buildModelChain(
  config: ModelsConfig,
  explicitOverride?: string,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  const add = (model: string) => {
    if (model && !seen.has(model)) {
      seen.add(model);
      chain.push(model);
    }
  };

  // 1. Explicit override from web UI
  if (explicitOverride) add(explicitOverride);

  // 2. Primary model + its fallbacks
  add(config.primary);
  for (const fb of config.primaryFallbacks) add(fb);

  // 3. Small model + its fallbacks (as last resort)
  add(config.small);
  for (const fb of config.smallFallbacks) add(fb);

  return chain;
}

/**
 * Format a fallback attempt for logging.
 */
export function formatFallbackLog(
  attempt: number,
  totalModels: number,
  model: string,
  error: string,
): string {
  return `⚠ Model "${model}" failed (attempt ${attempt}/${totalModels}): ${error.slice(0, 200)}`;
}
