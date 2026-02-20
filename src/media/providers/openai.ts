/**
 * OpenAI Whisper provider for audio transcription
 * Paid tier: $0.006 per minute of audio
 * Model: whisper-1
 */

import { AudioTranscriptionResult, TranscriptionError } from '../types.js';
import { logger } from '../../logger.js';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class OpenAIWhisperProvider {
  private config: OpenAIConfig;
  private baseURL: string;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
  }

  /**
   * Transcribe audio file using OpenAI Whisper API
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
        const error = new Error('OpenAI rate limit exceeded') as TranscriptionError;
        error.code = 'RATE_LIMIT';
        error.retryAfter = retryAfter;
        error.provider = 'openai';
        
        logger.warn(`OpenAI rate limit hit, retry after ${retryAfter}s`);
        throw error;
      }

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`OpenAI API error: ${response.status} ${errorText}`) as TranscriptionError;
        error.code = 'API_ERROR';
        error.provider = 'openai';
        throw error;
      }

      const result = await response.json() as { text: string; language?: string };
      const duration = Date.now() - startTime;

      logger.info(`OpenAI transcription completed in ${duration}ms`);

      return {
        text: result.text,
        language: result.language,
        duration: duration,
        provider: 'openai',
      };

    } catch (error) {
      if ((error as TranscriptionError).code) {
        throw error; // Already a TranscriptionError
      }

      // Wrap unknown errors
      const transcriptionError = new Error(`OpenAI transcription failed: ${error}`) as TranscriptionError;
      transcriptionError.code = 'API_ERROR';
      transcriptionError.provider = 'openai';
      throw transcriptionError;
    }
  }

  /**
   * Check if OpenAI API is configured
   */
  static isConfigured(apiKey?: string): boolean {
    return !!apiKey && apiKey.startsWith('sk-');
  }
}
