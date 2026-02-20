/**
 * Groq Whisper provider for audio transcription
 * FREE tier: 2000 requests/day, 8 hours audio/day
 * Models: whisper-large-v3, whisper-large-v3-turbo
 */

import { AudioTranscriptionResult, TranscriptionError } from '../types.js';
import { logger } from '../../logger.js';

export interface GroqConfig {
  apiKey: string;
  model: 'whisper-large-v3' | 'whisper-large-v3-turbo';
  baseURL?: string;
}

export class GroqWhisperProvider {
  private config: GroqConfig;
  private baseURL: string;

  constructor(config: GroqConfig) {
    this.config = config;
    this.baseURL = config.baseURL || 'https://api.groq.com/openai/v1';
  }

  /**
   * Transcribe audio file using Groq Whisper API
   * Uses native fetch (Node.js 18+) with FormData
   */
  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    try {
      const startTime = Date.now();

      // Prepare form data using native FormData (Node.js 18+)
      const formData = new FormData();
      
      // Create a File object from the buffer
      const file = new File([audioBuffer], filename, { type: 'audio/ogg' });
      formData.append('file', file);
      formData.append('model', this.config.model);
      
      if (language) {
        formData.append('language', language);
      }

      // Make API request using native fetch
      const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      });

      // Handle rate limits
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60');
        const error = new Error('Groq rate limit exceeded') as TranscriptionError;
        error.code = 'RATE_LIMIT';
        error.retryAfter = retryAfter;
        error.provider = 'groq';
        
        logger.warn(`Groq rate limit hit, retry after ${retryAfter}s`);
        throw error;
      }

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Groq API error: ${response.status} ${errorText}`) as TranscriptionError;
        error.code = 'API_ERROR';
        error.provider = 'groq';
        throw error;
      }

      const result = await response.json() as { text: string; language?: string };
      const duration = Date.now() - startTime;

      logger.info(`Groq transcription completed in ${duration}ms`);

      return {
        text: result.text,
        language: result.language,
        duration: duration,
        provider: 'groq',
      };

    } catch (error) {
      if ((error as TranscriptionError).code) {
        throw error; // Already a TranscriptionError
      }

      // Wrap unknown errors
      const transcriptionError = new Error(`Groq transcription failed: ${error}`) as TranscriptionError;
      transcriptionError.code = 'API_ERROR';
      transcriptionError.provider = 'groq';
      throw transcriptionError;
    }
  }

  /**
   * Check if Groq API is configured
   */
  static isConfigured(apiKey?: string): boolean {
    return !!apiKey && apiKey.startsWith('gsk_');
  }

  /**
   * Get rate limit info from response headers
   */
  private getRateLimitInfo(headers: Headers): {
    requestsRemaining: number;
    requestsLimit: number;
    resetTime: string;
  } | null {
    const remaining = headers.get('x-ratelimit-remaining-requests');
    const limit = headers.get('x-ratelimit-limit-requests');
    const reset = headers.get('x-ratelimit-reset-requests');

    if (remaining && limit && reset) {
      return {
        requestsRemaining: parseInt(remaining),
        requestsLimit: parseInt(limit),
        resetTime: reset,
      };
    }

    return null;
  }
}
