/**
 * OpenCode Configuration Manager
 * 
 * Reads opencode.json from project root and provides model configuration
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
 * Load opencode.json from project root.
 * Returns default config if file doesn't exist.
 */
export function loadOpenCodeConfig(): OpenCodeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const projectRoot = process.cwd();
  configPath = path.join(projectRoot, 'opencode.json');

  if (!fs.existsSync(configPath)) {
    logger.warn(`opencode.json not found at ${configPath}, using defaults`);
    const defaultConfig = getDefaultConfig();
    cachedConfig = defaultConfig;
    return defaultConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsedConfig = JSON.parse(content) as OpenCodeConfig;
    cachedConfig = parsedConfig;
    logger.info({ config: parsedConfig }, 'Loaded opencode.json');
    return parsedConfig;
  } catch (err) {
    logger.error({ err, path: configPath }, 'Failed to parse opencode.json, using defaults');
    const defaultConfig = getDefaultConfig();
    cachedConfig = defaultConfig;
    return defaultConfig;
  }
}

/**
 * Get default configuration if opencode.json doesn't exist.
 * 
 * Uses OpenCode free models that work without API keys:
 * - minimax-m2.5-free: Fast, efficient, recommended (default)
 * - glm-5-free: Good for Chinese language
 * - kimi-k2.5-free: Alternative free option
 * - big-pickle: Another free option
 */
function getDefaultConfig(): OpenCodeConfig {
  return {
    model: 'opencode/minimax-m2.5-free',
    small_model: 'opencode/minimax-m2.5-free',
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
 * Reload configuration from disk (useful after user edits opencode.json).
 */
export function reloadOpenCodeConfig(): OpenCodeConfig {
  cachedConfig = null;
  return loadOpenCodeConfig();
}

/**
 * Get environment variables for OpenCode server based on config.
 * These will be passed to the `opencode serve` process.
 * 
 * API keys are read from process.env (from .env file), NOT from opencode.json.
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
  if (config.image_gen_model) {
    env.OPENCODE_IMAGE_GEN_MODEL = config.image_gen_model;
  }

  // API keys come from process.env (from .env file), not from opencode.json
  // This is more secure and follows best practices
  if (process.env.GOOGLE_API_KEY) {
    env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }

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
    small: config.small_model || config.model || 'opencode/minimax-m2.5-free',
    fallback: config.fallback_model,
    vision: config.vision_model,
    audio: config.audio_model,
    imageGen: config.image_gen_model
  };
}

/**
 * Update opencode.json with new model configuration.
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
    configPath = path.join(process.cwd(), 'opencode.json');
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    cachedConfig = config;
    logger.info({ updates }, 'Updated opencode.json');
  } catch (err) {
    logger.error({ err, path: configPath }, 'Failed to write opencode.json');
    throw new Error(`Failed to update opencode.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}
