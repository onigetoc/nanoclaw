/**
 * Local Whisper provider for audio transcription
 * Uses whisper.cpp or faster-whisper locally
 * Free, no API calls, but requires local installation
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AudioTranscriptionResult, TranscriptionError } from '../types.js';
import { logger } from '../../logger.js';

export interface LocalWhisperConfig {
  command: string;        // e.g., 'whisper', 'whisper.cpp', 'faster-whisper'
  args: string[];         // e.g., ['--model', 'base', '--language', 'auto']
  timeout?: number;       // Timeout in ms (default: 60000)
}

export class LocalWhisperProvider {
  private config: LocalWhisperConfig;

  constructor(config: LocalWhisperConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 60000,
    };
  }

  /**
   * Transcribe audio file using local Whisper installation
   */
  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    language?: string
  ): Promise<AudioTranscriptionResult> {
    const startTime = Date.now();
    let tempPath: string | null = null;

    try {
      // Save buffer to temporary file
      const tempDir = os.tmpdir();
      tempPath = path.join(tempDir, `nanoclaw-whisper-${Date.now()}-${filename}`);
      await fs.writeFile(tempPath, audioBuffer);

      // Build command arguments
      const args = [...this.config.args];
      
      // Add language if specified and not already in args
      if (language && !args.includes('--language')) {
        args.push('--language', language);
      }
      
      // Add input file
      args.push(tempPath);

      // Execute whisper command
      const transcript = await this.executeWhisper(this.config.command, args);
      
      const duration = Date.now() - startTime;

      logger.info(`Local Whisper transcription completed in ${duration}ms`);

      return {
        text: transcript,
        language: language,
        duration: duration,
        provider: 'local',
      };

    } catch (error) {
      const transcriptionError = new Error(`Local Whisper failed: ${error}`) as TranscriptionError;
      transcriptionError.code = 'API_ERROR';
      transcriptionError.provider = 'local';
      throw transcriptionError;
    } finally {
      // Cleanup temp file
      if (tempPath) {
        try {
          await fs.unlink(tempPath);
        } catch (err) {
          logger.warn({ err, tempPath }, 'Failed to cleanup temp file');
        }
      }
    }
  }

  /**
   * Execute whisper command and capture output
   */
  private executeWhisper(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout!;
      let stdout = '';
      let stderr = '';

      const process = spawn(command, args);

      // Capture stdout
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      process.on('close', (code) => {
        if (code === 0) {
          // Parse transcript from output
          const transcript = this.parseTranscript(stdout);
          if (transcript) {
            resolve(transcript);
          } else {
            reject(new Error('Failed to parse transcript from output'));
          }
        } else {
          reject(new Error(`Whisper process exited with code ${code}: ${stderr}`));
        }
      });

      // Handle process errors
      process.on('error', (err) => {
        reject(new Error(`Failed to start whisper process: ${err.message}`));
      });

      // Timeout
      const timeoutId = setTimeout(() => {
        process.kill();
        reject(new Error(`Whisper process timeout after ${timeout}ms`));
      }, timeout);

      // Clear timeout on completion
      process.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Parse transcript from whisper output
   * Different whisper implementations have different output formats
   */
  private parseTranscript(output: string): string | null {
    // Try to find transcript in output
    // whisper.cpp format: "[00:00.000 --> 00:05.000]  Transcript text here"
    const timestampRegex = /\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s+(.+)/g;
    const matches = Array.from(output.matchAll(timestampRegex));
    
    if (matches.length > 0) {
      // Combine all transcript segments
      return matches.map(m => m[1].trim()).join(' ');
    }

    // faster-whisper format: Just the transcript text
    // Try to extract text after common prefixes
    const lines = output.split('\n').filter(line => line.trim());
    
    // Skip lines that look like logs/metadata
    const transcriptLines = lines.filter(line => {
      const lower = line.toLowerCase();
      return !lower.includes('loading') &&
             !lower.includes('processing') &&
             !lower.includes('model') &&
             !lower.includes('detected') &&
             line.trim().length > 0;
    });

    if (transcriptLines.length > 0) {
      return transcriptLines.join(' ').trim();
    }

    // Fallback: return entire output if nothing else works
    return output.trim() || null;
  }

  /**
   * Check if local whisper is available
   */
  static async isAvailable(command: string = 'whisper'): Promise<boolean> {
    try {
      const process = spawn(command, ['--version']);
      
      return new Promise((resolve) => {
        process.on('close', (code) => {
          resolve(code === 0);
        });
        
        process.on('error', () => {
          resolve(false);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          process.kill();
          resolve(false);
        }, 5000);
      });
    } catch {
      return false;
    }
  }
}
