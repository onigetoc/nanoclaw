/**
 * MIME type detection with 3-layer defense against audio binary injection
 * Based on OpenClaw's fix for the Audio Binary Injection bug
 * 
 * Problem: OGG files have ASCII-heavy headers with tabs, causing them to be
 * detected as "text/tab-separated-values" and injecting binary into context.
 * 
 * Solution:
 * - Layer 1: Extension check (fastest)
 * - Layer 2: Magic bytes check (most reliable)
 * - Layer 3: Content analysis (fallback)
 */

import * as path from 'path';
import { MimeDetectionResult, MediaKind, MimeConfidence } from './types.js';

export class MimeDetector {
  // Audio file extensions
  private static readonly AUDIO_EXTENSIONS = new Set([
    '.ogg',   // Telegram voice messages (Opus in OGG container)
    '.opus',  // Opus codec
    '.mp3',   // MPEG audio
    '.wav',   // Waveform audio
    '.aac',   // Advanced Audio Coding
    '.flac',  // Free Lossless Audio Codec
    '.m4a',   // MPEG-4 audio
    '.oga',   // Ogg audio
    '.webm',  // WebM audio (Discord)
    '.weba',  // WebM audio
  ]);

  // Image file extensions
  private static readonly IMAGE_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'
  ]);

  // Video file extensions
  private static readonly VIDEO_EXTENSIONS = new Set([
    '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'
  ]);

  // Document file extensions
  private static readonly DOCUMENT_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'
  ]);

  /**
   * Detect MIME type and media kind with 3-layer defense
   */
  static detect(buffer: Buffer, filename?: string): MimeDetectionResult {
    // Layer 1: Extension check (fastest, good for known formats)
    if (filename) {
      const extResult = this.detectByExtension(filename);
      if (extResult) {
        return extResult;
      }
    }

    // Layer 2: Magic bytes check (most reliable)
    const magicResult = this.detectByMagicBytes(buffer);
    if (magicResult) {
      return magicResult;
    }

    // Layer 3: Content analysis (fallback)
    return this.detectByContent(buffer);
  }

  /**
   * Layer 1: Detect by file extension
   */
  private static detectByExtension(filename: string): MimeDetectionResult | null {
    const ext = path.extname(filename).toLowerCase();

    if (this.AUDIO_EXTENSIONS.has(ext)) {
      return {
        mimeType: this.getMimeFromExtension(ext),
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    if (this.IMAGE_EXTENSIONS.has(ext)) {
      return {
        mimeType: this.getMimeFromExtension(ext),
        kind: 'image',
        isBinary: true,
        confidence: 'high'
      };
    }

    if (this.VIDEO_EXTENSIONS.has(ext)) {
      return {
        mimeType: this.getMimeFromExtension(ext),
        kind: 'video',
        isBinary: true,
        confidence: 'high'
      };
    }

    if (this.DOCUMENT_EXTENSIONS.has(ext)) {
      return {
        mimeType: this.getMimeFromExtension(ext),
        kind: 'document',
        isBinary: ext !== '.txt' && ext !== '.md',
        confidence: 'high'
      };
    }

    return null;
  }

  /**
   * Layer 2: Detect by magic bytes (file signatures)
   */
  private static detectByMagicBytes(buffer: Buffer): MimeDetectionResult | null {
    if (buffer.length < 4) return null;

    // === AUDIO FORMATS ===

    // OGG container: "OggS" (4F 67 67 53)
    if (this.matchBytes(buffer, [0x4F, 0x67, 0x67, 0x53], 0)) {
      return {
        mimeType: 'audio/ogg',
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    // MP3 with ID3v2: "ID3" (49 44 33)
    if (this.matchBytes(buffer, [0x49, 0x44, 0x33], 0)) {
      return {
        mimeType: 'audio/mpeg',
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    // MP3 frame sync: FF FB or FF FA
    if (buffer[0] === 0xFF && (buffer[1] === 0xFB || buffer[1] === 0xFA)) {
      return {
        mimeType: 'audio/mpeg',
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    // WAV: "RIFF....WAVE" (52 49 46 46 ... 57 41 56 45)
    if (buffer.length >= 12 &&
        this.matchBytes(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
        this.matchBytes(buffer, [0x57, 0x41, 0x56, 0x45], 8)) {
      return {
        mimeType: 'audio/wav',
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    // FLAC: "fLaC" (66 4C 61 43)
    if (this.matchBytes(buffer, [0x66, 0x4C, 0x61, 0x43], 0)) {
      return {
        mimeType: 'audio/flac',
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    // M4A/AAC: "ftyp" at offset 4 (66 74 79 70)
    if (buffer.length >= 8 &&
        this.matchBytes(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
      return {
        mimeType: 'audio/mp4',
        kind: 'audio',
        isBinary: true,
        confidence: 'high'
      };
    }

    // === IMAGE FORMATS ===

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 8 &&
        this.matchBytes(buffer, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0)) {
      return {
        mimeType: 'image/png',
        kind: 'image',
        isBinary: true,
        confidence: 'high'
      };
    }

    // JPEG: FF D8 FF
    if (buffer.length >= 3 &&
        this.matchBytes(buffer, [0xFF, 0xD8, 0xFF], 0)) {
      return {
        mimeType: 'image/jpeg',
        kind: 'image',
        isBinary: true,
        confidence: 'high'
      };
    }

    // GIF: "GIF87a" or "GIF89a"
    if (buffer.length >= 6 &&
        (this.matchBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], 0) ||
         this.matchBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0))) {
      return {
        mimeType: 'image/gif',
        kind: 'image',
        isBinary: true,
        confidence: 'high'
      };
    }

    // WebP: "RIFF....WEBP"
    if (buffer.length >= 12 &&
        this.matchBytes(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
        this.matchBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
      return {
        mimeType: 'image/webp',
        kind: 'image',
        isBinary: true,
        confidence: 'high'
      };
    }

    // === DOCUMENT FORMATS ===

    // PDF: "%PDF"
    if (buffer.length >= 4 &&
        this.matchBytes(buffer, [0x25, 0x50, 0x44, 0x46], 0)) {
      return {
        mimeType: 'application/pdf',
        kind: 'document',
        isBinary: true,
        confidence: 'high'
      };
    }

    return null;
  }

  /**
   * Layer 3: Detect by content analysis (fallback)
   */
  private static detectByContent(buffer: Buffer): MimeDetectionResult {
    // Check if looks like text
    if (this.looksLikeUtf8Text(buffer)) {
      return {
        mimeType: 'text/plain',
        kind: 'document',
        isBinary: false,
        confidence: 'medium'
      };
    }

    // Unknown binary
    return {
      mimeType: 'application/octet-stream',
      kind: 'file',
      isBinary: true,
      confidence: 'low'
    };
  }

  /**
   * Check if buffer looks like UTF-8 text
   * Note: This is what caused the OGG bug - OGG headers are ASCII-heavy!
   */
  private static looksLikeUtf8Text(buffer: Buffer): boolean {
    let printableCount = 0;
    const sampleSize = Math.min(buffer.length, 1024); // Sample first 1KB

    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];
      // Printable ASCII (32-126) + common whitespace (9=tab, 10=LF, 13=CR)
      if ((byte >= 32 && byte <= 126) || 
          byte === 9 || byte === 10 || byte === 13) {
        printableCount++;
      }
    }

    // >85% printable = probably text
    // WARNING: OGG files can pass this test!
    return (printableCount / sampleSize) > 0.85;
  }

  /**
   * Match byte pattern at specific offset
   */
  private static matchBytes(buffer: Buffer, pattern: number[], offset: number): boolean {
    if (buffer.length < offset + pattern.length) return false;
    
    for (let i = 0; i < pattern.length; i++) {
      if (buffer[offset + i] !== pattern[i]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get MIME type from file extension
   */
  private static getMimeFromExtension(ext: string): string {
    const mimeMap: Record<string, string> = {
      // Audio
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.oga': 'audio/ogg',
      '.webm': 'audio/webm',
      '.weba': 'audio/webm',
      
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      
      // Video
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv',
      
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Check if a MIME type is audio
   */
  static isAudio(mimeType: string): boolean {
    return mimeType.startsWith('audio/');
  }

  /**
   * Check if a MIME type is image
   */
  static isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if a MIME type is video
   */
  static isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }
}
