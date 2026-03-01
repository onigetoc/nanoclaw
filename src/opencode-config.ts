/**
 * OpenCode Configuration Manager
 * 
 * Reads opencode.json from project root (the single source of truth)
 * and provides model configuration for monitoring/display.
 * 
 * The OpenCode server reads opencode.json directly from CWD.
 * This module reads the same file for logging/monitoring purposes.
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

/** Root directory of the EureClaw project (where opencode.json lives). */
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');

let cachedConfig: OpenCodeConfig | null = null;

/**
 * Load opencode.json from project root (single source of truth).
 * Returns default config if file doesn't exist.
 */
export function loadOpenCodeConfig(): OpenCodeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(PROJECT_ROOT, 'opencode.json');

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
    logger.info({ model: parsedConfig.model, small_model: parsedConfig.small_model }, 'Loaded opencode.json');
    return parsedConfig;
  } catch (err) {
    logger.error({ err, path: configPath }, 'Failed to parse opencode.json, using defaults');
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
 * Reload configuration from disk (useful after user edits opencode.json).
 */
export function reloadOpenCodeConfig(): OpenCodeConfig {
  cachedConfig = null;
  return loadOpenCodeConfig();
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
