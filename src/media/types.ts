/**
 * Media handling types for NanoClaw
 * Supports audio, images, documents, and other media types
 */

export type MediaKind = 'audio' | 'image' | 'video' | 'document' | 'file';

export type MimeConfidence = 'high' | 'medium' | 'low';

export interface MimeDetectionResult {
  mimeType: string;
  kind: MediaKind;
  isBinary: boolean;
  confidence: MimeConfidence;
}

export interface AudioTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  provider: 'groq' | 'openai' | 'local';
}

export interface MediaAttachment {
  id: string;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  buffer?: Buffer;
  localPath?: string;
  url?: string;
}

export interface AudioConfig {
  enabled: boolean;
  provider: 'groq' | 'openai' | 'local';
  stripAfterTranscript: boolean;
  timeout: number;
  maxFileSize: number;
  
  groq?: {
    apiKey: string;
    model: 'whisper-large-v3' | 'whisper-large-v3-turbo';
    baseURL: string;
  };
  
  openai?: {
    apiKey: string;
    model: string;
  };
  
  local?: {
    command: string;
    args: string[];
  };
}

export interface TranscriptionError extends Error {
  code: 'RATE_LIMIT' | 'TIMEOUT' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'API_ERROR';
  retryAfter?: number;
  provider?: string;
}
