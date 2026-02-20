/**
 * Audio transcription manager
 * Handles audio file transcription with multiple providers
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AudioConfig, AudioTranscriptionResult, TranscriptionError } from './types.js';
import { GroqWhisperProvider } from './providers/groq.js';
import { OpenAIWhisperProvider } from './providers/openai.js';
import { LocalWhisperProvider } from './providers/local.js';
import { logger } from '../logger.js';

export class TranscriptionManager {
  private config: AudioConfig;
  private groqProvider?: GroqWhisperProvider;
  private openaiProvider?: OpenAIWhisperProvider;
  private localProvider?: LocalWhisperProvider;

  constructor(config: AudioConfig) {
    this.config = config;

    // Initialize Groq provider if configured
    if (config.groq?.apiKey) {
      this.groqProvider = new GroqWhisperProvider({
        apiKey: config.groq.apiKey,
        model: config.groq.model,
        baseURL: config.groq.baseURL,
      });
    }

    // Initialize OpenAI provider if configured
    if (config.openai?.apiKey) {
      this.openaiProvider = new OpenAIWhisperProvider({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
      });
    }

    // Initialize Local provider if configured
    if (config.local) {
      this.localProvider = new LocalWhisperProvider({
        command: config.local.command,
        args: config.local.args,
      });
    }
  }

  /**
   * Transcribe audio buffer
   */
  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    // Validate file size
    if (audioBuffer.length > this.config.maxFileSize) {
      const error = new Error(
        `Audio file too large: ${audioBuffer.length} bytes (max: ${this.config.maxFileSize})`
      ) as TranscriptionError;
      error.code = 'FILE_TOO_LARGE';
      throw error;
    }

    // Try primary provider
    try {
      return await this.transcribeWithProvider(audioBuffer, filename, language);
    } catch (error) {
      logger.error({ error }, 'Transcription failed');
      throw error;
    }
  }

  /**
   * Transcribe with configured provider
   */
  private async transcribeWithProvider(
    audioBuffer: Buffer,
    filename: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    const provider = this.config.provider;

    switch (provider) {
      case 'groq':
        if (!this.groqProvider) {
          throw new Error('Groq provider not configured (missing GROQ_API_KEY)');
        }
        return await this.groqProvider.transcribe(audioBuffer, filename, language);

      case 'openai':
        if (!this.openaiProvider) {
          throw new Error('OpenAI provider not configured (missing OPENAI_API_KEY)');
        }
        return await this.openaiProvider.transcribe(audioBuffer, filename, language);

      case 'local':
        if (!this.localProvider) {
          throw new Error('Local provider not configured (missing LOCAL_WHISPER_COMMAND)');
        }
        return await this.localProvider.transcribe(audioBuffer, filename, language);

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Download audio from URL to temporary file
   */
  async downloadAudio(url: string): Promise<{ buffer: Buffer; tempPath: string }> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Save to temp file
      const tempDir = os.tmpdir();
      const tempPath = path.join(tempDir, `nanoclaw-audio-${Date.now()}.ogg`);
      await fs.writeFile(tempPath, buffer);

      return { buffer, tempPath };
    } catch (error) {
      logger.error({ error }, 'Failed to download audio');
      throw error;
    }
  }

  /**
   * Clean up temporary audio file
   */
  async cleanupTempFile(tempPath: string): Promise<void> {
    try {
      await fs.unlink(tempPath);
      logger.debug(`Cleaned up temp file: ${tempPath}`);
    } catch (error) {
      logger.warn({ error, tempPath }, 'Failed to cleanup temp file');
    }
  }

  /**
   * Check if transcription is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get configured provider name
   */
  getProvider(): string {
    return this.config.provider;
  }
}
