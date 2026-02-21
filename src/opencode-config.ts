/**
 * OpenCode Configuration Manager
 * 
 * Reads models-config.json from project root and provides model configuration
 * for the OpenCode server and SDK.
 * 
 * Supports:
 * - Primary model (strong reasoning)
 * - Small model (lightweight tasks)
 * - Fallback models (if primary fails)
 * - Per-provider configuration
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export interface OpenCodeConfig {
  model?: string;
  small_model?: string;
  fallback_model?: string;
  // Specialized models for specific tasks
  vision_model?: string;      // For image/video analysis, OCR
  audio_model?: string;        // For audio transcription (alternative to Groq)
  image_gen_model?: string;    // For image generation
  provider?: Record<string, {
    api_key?: string;
    options?: Record<string, any>;
  }>;
  [key: string]: any;
}

let cachedConfig: OpenCodeConfig | null = null;
let configPath: string | null = null;

/**
 * Load models-config.json from project root.
 * Returns default config if file doesn't exist.
 */
export function loadOpenCodeConfig(): OpenCodeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const projectRoot = process.cwd();
  configPath = path.join(projectRoot, 'models-config.json');

  if (!fs.existsSync(configPath)) {
    logger.warn(`models-config.json not found at ${configPath}, using defaults`);
    const defaultConfig = getDefaultConfig();
    cachedConfig = defaultConfig;
    return defaultConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsedConfig = JSON.parse(content) as OpenCodeConfig;
    cachedConfig = parsedConfig;
    logger.info({ config: parsedConfig }, 'Loaded models-config.json');
    return parsedConfig;
  } catch (err) {
    logger.error({ err, path: configPath }, 'Failed to parse models-config.json, using defaults');
    const defaultConfig = getDefaultConfig();
    cachedConfig = defaultConfig;
    return defaultConfig;
  }
}

/**
 * Get default configuration if models-config.json doesn't exist.
 * 
 * IMPORTANT: This is only used for initial bootstrap when models-config.json is missing.
 * Users should create their own models-config.json with their preferred models.
 * These defaults are just to prevent crashes on first run.
 * 
 * Default free models (no API keys required):
 * - minimax-m2.5-free: Fast, efficient, supports vision
 * - glm-5-free: Good for Chinese language
 */
function getDefaultConfig(): OpenCodeConfig {
  return {
    model: 'opencode/minimax-m2.5-free',
    small_model: 'opencode/minimax-m2.5-free',
    vision_model: 'opencode/minimax-m2.5-free',
    fallback_model: 'opencode/glm-5-free',
    provider: {
      opencode: {
        options: {
          timeout: 600000
        }
      }
    }
  };
}

/**
 * Reload configuration from disk (useful after user edits models-config.json).
 */
export function reloadOpenCodeConfig(): OpenCodeConfig {
  cachedConfig = null;
  return loadOpenCodeConfig();
}

/**
 * Get environment variables for OpenCode server based on config.
 * These will be passed to the `opencode serve` process.
 * 
 * Note: This function only passes model configuration (from models-config.json).
 * API keys are managed by OpenCode's own authentication system:
 *   - Via 'opencode auth login' (stored in ~/.local/share/opencode/auth.json)
 *   - Or via system environment variables (not NanoClaw's .env file)
 */
export function getOpenCodeEnv(): Record<string, string> {
  const config = loadOpenCodeConfig();
  const env: Record<string, string> = {};

  // Primary model
  if (config.model) {
    env.OPENCODE_MODEL = config.model;
  }

  // Small model for lightweight tasks
  if (config.small_model) {
    env.OPENCODE_SMALL_MODEL = config.small_model;
  }

  // Fallback model
  if (config.fallback_model) {
    env.OPENCODE_FALLBACK_MODEL = config.fallback_model;
  }

  // Specialized models
  if (config.vision_model) {
    env.OPENCODE_VISION_MODEL = config.vision_model;
  }
  if (config.audio_model) {
    env.OPENCODE_AUDIO_MODEL = config.audio_model;
  }
  // Specialized models
  if (config.vision_model) {
    env.OPENCODE_VISION_MODEL = config.vision_model;
  }
  if (config.audio_model) {
    env.OPENCODE_AUDIO_MODEL = config.audio_model;
  }
  if (config.image_gen_model) {
    env.OPENCODE_IMAGE_GEN_MODEL = config.image_gen_model;
  }

  // Note: API keys are managed by OpenCode's authentication system
  // (via 'opencode auth login' or system environment variables).
  // They are NOT read from NanoClaw's .env file.
  // OpenCode server will automatically use keys from:
  //   1. ~/.local/share/opencode/auth.json (via opencode auth login)
  //   2. System environment variables (if set)

  return env;
}

/**
 * Get the current model configuration for display/logging.
 */
export function getModelInfo(): {
  primary: string;
  small: string;
  fallback?: string;
  vision?: string;
  audio?: string;
  imageGen?: string;
} {
  const config = loadOpenCodeConfig();
  return {
    primary: config.model || 'opencode/minimax-m2.5-free',
    small: config.small_model || 'opencode/minimax-m2.5-free',
    fallback: config.fallback_model || 'opencode/glm-5-free',
    vision: config.vision_model || 'opencode/minimax-m2.5-free',
    audio: config.audio_model,
    imageGen: config.image_gen_model
  };
}

/**
 * Update models-config.json with new model configuration.
 * Used by the change-model skill.
 */
export function updateModelConfig(updates: {
  model?: string;
  small_model?: string;
  fallback_model?: string;
  vision_model?: string;
  audio_model?: string;
  image_gen_model?: string;
}): void {
  const config = loadOpenCodeConfig();
  
  if (updates.model) config.model = updates.model;
  if (updates.small_model) config.small_model = updates.small_model;
  if (updates.fallback_model) config.fallback_model = updates.fallback_model;
  if (updates.vision_model) config.vision_model = updates.vision_model;
  if (updates.audio_model) config.audio_model = updates.audio_model;
  if (updates.image_gen_model) config.image_gen_model = updates.image_gen_model;

  if (!configPath) {
    configPath = path.join(process.cwd(), 'models-config.json');
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    cachedConfig = config;
    logger.info({ updates }, 'Updated models-config.json');
  } catch (err) {
    logger.error({ err, path: configPath }, 'Failed to write models-config.json');
    throw new Error(`Failed to update models-config.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}
