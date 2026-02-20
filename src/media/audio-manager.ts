/**
 * Audio manager singleton
 * Provides easy access to transcription functionality
 */

import { TranscriptionManager } from './transcription.js';
import { AudioConfig } from './types.js';
import * as config from '../config.js';
import { logger } from '../logger.js';

let transcriptionManager: TranscriptionManager | null = null;

/**
 * Get or create the transcription manager instance
 */
export function getTranscriptionManager(): TranscriptionManager | null {
  if (!config.AUDIO_ENABLED) {
    return null;
  }

  if (!transcriptionManager) {
    transcriptionManager = createTranscriptionManager();
  }

  return transcriptionManager;
}

/**
 * Create a new transcription manager with current config
 */
function createTranscriptionManager(): TranscriptionManager {
  const audioConfig: AudioConfig = {
    enabled: config.AUDIO_ENABLED,
    provider: config.AUDIO_PROVIDER,
    stripAfterTranscript: config.AUDIO_STRIP_AFTER_TRANSCRIPT,
    timeout: config.AUDIO_TIMEOUT,
    maxFileSize: config.AUDIO_MAX_FILE_SIZE,
  };

  // Add Groq config if available
  if (config.GROQ_API_KEY) {
    audioConfig.groq = {
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_WHISPER_MODEL,
      baseURL: config.GROQ_BASE_URL,
    };
  }

  // Add OpenAI config if available
  if (config.OPENAI_API_KEY) {
    audioConfig.openai = {
      apiKey: config.OPENAI_API_KEY,
      model: config.OPENAI_WHISPER_MODEL,
    };
  }

  // Validate configuration
  if (audioConfig.provider === 'groq' && !audioConfig.groq?.apiKey) {
    logger.warn('Audio transcription enabled with Groq provider but GROQ_API_KEY not set');
  }

  if (audioConfig.provider === 'openai' && !audioConfig.openai?.apiKey) {
    logger.warn('Audio transcription enabled with OpenAI provider but OPENAI_API_KEY not set');
  }

  logger.info(`Audio transcription initialized with provider: ${audioConfig.provider}`);

  return new TranscriptionManager(audioConfig);
}

/**
 * Check if audio transcription is available
 */
export function isAudioTranscriptionAvailable(): boolean {
  const manager = getTranscriptionManager();
  return manager !== null && manager.isEnabled();
}
