/**
 * MIME type detection for media files
 * 3-layer defense against binary injection (OpenClaw bug)
 * 
 * Layers:
 * 1. Extension check (fast)
 * 2. Magic bytes (reliable)
 * 3. Content analysis (fallback)
 */

import { MimeDetectionResult, MediaKind, MimeConfidence } from './types.js';

/**
 * Magic bytes signatures for common file types
 */
const MAGIC_BYTES: Record<string, { bytes: number[]; mimeType: string; kind: MediaKind }> = {
  // Audio
  'ogg': { bytes: [0x4F, 0x67, 0x67, 0x53], mimeType: 'audio/ogg', kind: 'audio' },
  'mp3': { bytes: [0xFF, 0xFB], mimeType: 'audio/mpeg', kind: 'audio' },
  'mp3_id3': { bytes: [0x49, 0x44, 0x33], mimeType: 'audio/mpeg', kind: 'audio' },
  'wav': { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'audio/wav', kind: 'audio' },
  'm4a': { bytes: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], mimeType: 'audio/mp4', kind: 'audio' },
  'flac': { bytes: [0x66, 0x4C, 0x61, 0x43], mimeType: 'audio/flac', kind: 'audio' },
  
  // Images
  'png': { bytes: [0x89, 0x50, 0x4E, 0x47], mimeType: 'image/png', kind: 'image' },
  'jpg': { bytes: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg', kind: 'image' },
  'gif': { bytes: [0x47, 0x49, 0x46, 0x38], mimeType: 'image/gif', kind: 'image' },
  'webp': { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'image/webp', kind: 'image' },
  'bmp': { bytes: [0x42, 0x4D], mimeType: 'image/bmp', kind: 'image' },
  
  // Video
  'mp4': { bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4', kind: 'video' },
  'webm': { bytes: [0x1A, 0x45, 0xDF, 0xA3], mimeType: 'video/webm', kind: 'video' },
  'avi': { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'video/x-msvideo', kind: 'video' },
  
  // Documents
  'pdf': { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf', kind: 'document' },
  'zip': { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip', kind: 'document' },
  'docx': { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
};

/**
 * Extension to MIME type mapping
 */
const EXTENSION_MAP: Record<string, { mimeType: string; kind: MediaKind }> = {
  // Audio
  'ogg': { mimeType: 'audio/ogg', kind: 'audio' },
  'oga': { mimeType: 'audio/ogg', kind: 'audio' },
  'opus': { mimeType: 'audio/opus', kind: 'audio' },
  'mp3': { mimeType: 'audio/mpeg', kind: 'audio' },
  'wav': { mimeType: 'audio/wav', kind: 'audio' },
  'm4a': { mimeType: 'audio/mp4', kind: 'audio' },
  'aac': { mimeType: 'audio/aac', kind: 'audio' },
  'flac': { mimeType: 'audio/flac', kind: 'audio' },
  'wma': { mimeType: 'audio/x-ms-wma', kind: 'audio' },
  
  // Images
  'png': { mimeType: 'image/png', kind: 'image' },
  'jpg': { mimeType: 'image/jpeg', kind: 'image' },
  'jpeg': { mimeType: 'image/jpeg', kind: 'image' },
  'gif': { mimeType: 'image/gif', kind: 'image' },
  'webp': { mimeType: 'image/webp', kind: 'image' },
  'bmp': { mimeType: 'image/bmp', kind: 'image' },
  'svg': { mimeType: 'image/svg+xml', kind: 'image' },
  'ico': { mimeType: 'image/x-icon', kind: 'image' },
  
  // Video
  'mp4': { mimeType: 'video/mp4', kind: 'video' },
  'webm': { mimeType: 'video/webm', kind: 'video' },
  'avi': { mimeType: 'video/x-msvideo', kind: 'video' },
  'mov': { mimeType: 'video/quicktime', kind: 'video' },
  'mkv': { mimeType: 'video/x-matroska', kind: 'video' },
  'flv': { mimeType: 'video/x-flv', kind: 'video' },
  
  // Documents
  'pdf': { mimeType: 'application/pdf', kind: 'document' },
  'doc': { mimeType: 'application/msword', kind: 'document' },
  'docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  'xls': { mimeType: 'application/vnd.ms-excel', kind: 'document' },
  'xlsx': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document' },
  'ppt': { mimeType: 'application/vnd.ms-powerpoint', kind: 'document' },
  'pptx': { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' },
  'txt': { mimeType: 'text/plain', kind: 'document' },
  'csv': { mimeType: 'text/csv', kind: 'document' },
  'json': { mimeType: 'application/json', kind: 'document' },
  'xml': { mimeType: 'application/xml', kind: 'document' },
  'zip': { mimeType: 'application/zip', kind: 'document' },
  'rar': { mimeType: 'application/x-rar-compressed', kind: 'document' },
  '7z': { mimeType: 'application/x-7z-compressed', kind: 'document' },
};

/**
 * Detect MIME type from filename extension (Layer 1 - Fast)
 */
function detectFromExtension(filename: string): MimeDetectionResult | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  
  const mapping = EXTENSION_MAP[ext];
  if (!mapping) return null;
  
  return {
    mimeType: mapping.mimeType,
    kind: mapping.kind,
    isBinary: mapping.kind !== 'document' || !['txt', 'csv', 'json', 'xml'].includes(ext),
    confidence: 'medium',
  };
}

/**
 * Detect MIME type from magic bytes (Layer 2 - Reliable)
 */
function detectFromMagicBytes(buffer: Buffer): MimeDetectionResult | null {
  for (const [name, signature] of Object.entries(MAGIC_BYTES)) {
    const { bytes, mimeType, kind } = signature;
    
    // Check if buffer starts with magic bytes
    let matches = true;
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[i] !== bytes[i]) {
        matches = false;
        break;
      }
    }
    
    if (matches) {
      return {
        mimeType,
        kind,
        isBinary: true,
        confidence: 'high',
      };
    }
  }
  
  return null;
}

/**
 * Detect if content is binary or text (Layer 3 - Fallback)
 */
function detectFromContent(buffer: Buffer): MimeDetectionResult {
  // Check for null bytes (strong indicator of binary)
  const hasNullBytes = buffer.includes(0x00);
  
  // Check for high ratio of non-printable characters
  let nonPrintable = 0;
  const sampleSize = Math.min(buffer.length, 512);
  
  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    // Printable ASCII: 32-126, plus common whitespace: 9, 10, 13
    if ((byte < 32 || byte > 126) && ![9, 10, 13].includes(byte)) {
      nonPrintable++;
    }
  }
  
  const nonPrintableRatio = nonPrintable / sampleSize;
  const isBinary = hasNullBytes || nonPrintableRatio > 0.3;
  
  return {
    mimeType: isBinary ? 'application/octet-stream' : 'text/plain',
    kind: 'file',
    isBinary,
    confidence: 'low',
  };
}

/**
 * Detect MIME type using 3-layer approach
 * 
 * @param buffer - File buffer to analyze
 * @param filename - Optional filename for extension check
 * @returns MIME detection result with confidence level
 */
export function detectMimeType(buffer: Buffer, filename?: string): MimeDetectionResult {
  // Layer 2: Magic bytes (most reliable)
  const magicResult = detectFromMagicBytes(buffer);
  if (magicResult) {
    return magicResult;
  }
  
  // Layer 1: Extension (fast, medium confidence)
  if (filename) {
    const extResult = detectFromExtension(filename);
    if (extResult) {
      return extResult;
    }
  }
  
  // Layer 3: Content analysis (fallback)
  return detectFromContent(buffer);
}

/**
 * Check if buffer is a valid audio file
 */
export function isAudioFile(buffer: Buffer, filename?: string): boolean {
  const result = detectMimeType(buffer, filename);
  return result.kind === 'audio' && result.confidence !== 'low';
}

/**
 * Check if buffer is a valid image file
 */
export function isImageFile(buffer: Buffer, filename?: string): boolean {
  const result = detectMimeType(buffer, filename);
  return result.kind === 'image' && result.confidence !== 'low';
}

/**
 * Check if buffer is a valid video file
 */
export function isVideoFile(buffer: Buffer, filename?: string): boolean {
  const result = detectMimeType(buffer, filename);
  return result.kind === 'video' && result.confidence !== 'low';
}

/**
 * Check if buffer is a document file
 */
export function isDocumentFile(buffer: Buffer, filename?: string): boolean {
  const result = detectMimeType(buffer, filename);
  return result.kind === 'document';
}

/**
 * Validate that buffer matches expected MIME type
 * Prevents binary injection attacks
 */
export function validateMimeType(
  buffer: Buffer,
  expectedMimeType: string,
  filename?: string
): boolean {
  const result = detectMimeType(buffer, filename);
  
  // Exact match
  if (result.mimeType === expectedMimeType) {
    return true;
  }
  
  // Category match (e.g., audio/* matches audio/ogg)
  const [expectedCategory] = expectedMimeType.split('/');
  const [actualCategory] = result.mimeType.split('/');
  
  if (expectedCategory === actualCategory && result.confidence !== 'low') {
    return true;
  }
  
  return false;
}
