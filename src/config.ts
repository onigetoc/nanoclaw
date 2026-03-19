import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (container-runner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER', 'TELEGRAM_ONLY']);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER || envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const TELEGRAM_ONLY = (process.env.TELEGRAM_ONLY || envConfig.TELEGRAM_ONLY) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'eureclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const WORKSPACES_DIR = path.resolve(PROJECT_ROOT, 'workspaces');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_WORKSPACE_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'eureclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(
  process.env.IDLE_TIMEOUT || '60000',
  10,
); // 60s default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// === Audio Transcription Configuration ===

export const AUDIO_ENABLED = (process.env.AUDIO_ENABLED || 'true') === 'true';
export const AUDIO_PROVIDER = (process.env.AUDIO_PROVIDER || 'groq') as 'groq' | 'openai' | 'local';
export const AUDIO_STRIP_AFTER_TRANSCRIPT = (process.env.AUDIO_STRIP_AFTER_TRANSCRIPT || 'true') === 'true';
export const AUDIO_TIMEOUT = parseInt(process.env.AUDIO_TIMEOUT || '30000', 10); // 30 seconds
export const AUDIO_MAX_FILE_SIZE = parseInt(process.env.AUDIO_MAX_FILE_SIZE || '26214400', 10); // 25MB (Whisper limit)

// Groq Whisper (FREE - recommended)
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const GROQ_WHISPER_MODEL = (process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo') as 'whisper-large-v3' | 'whisper-large-v3-turbo';
export const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

// OpenAI Whisper (fallback)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const OPENAI_WHISPER_MODEL = process.env.OPENAI_WHISPER_MODEL || 'whisper-1';
