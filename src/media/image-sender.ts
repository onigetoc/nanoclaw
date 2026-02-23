/**
 * Image Sender - Generic image/file sending across channels
 * 
 * Handles sending images, PDFs, and other media files via Telegram, WhatsApp, etc.
 * Automatically detects file type and uses the appropriate channel method.
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import type { Channel } from '../types.js';

export interface SendImageOptions {
  /** File path (absolute or relative to project root) */
  filePath: string;
  /** Optional caption for the image */
  caption?: string;
  /** Chat JID (e.g., tg:123456789 or 120363@g.us) */
  chatJid: string;
  /** Channel instance to use for sending */
  channel: Channel;
}

/**
 * Detect file MIME type from extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Send an image or file via the appropriate channel
 * 
 * @param options - Send options (filePath, caption, chatJid, channel)
 * @returns Promise<boolean> - true if sent successfully
 * 
 * @example
 * ```typescript
 * await sendImage({
 *   filePath: 'groups/main/screenshot.png',
 *   caption: 'Amazon search results',
 *   chatJid: 'tg:123456789',
 *   channel: telegramChannel
 * });
 * ```
 */
export async function sendImage(options: SendImageOptions): Promise<boolean> {
  const { filePath, caption, chatJid, channel } = options;

  try {
    // Resolve file path (handle relative paths)
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(process.cwd(), filePath);
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      logger.error({ filePath: resolvedPath }, 'Image file not found');
      return false;
    }

    // Get file info
    const stats = fs.statSync(resolvedPath);
    const mimeType = getMimeType(resolvedPath);
    const fileName = path.basename(resolvedPath);

    logger.info(
      { 
        filePath: resolvedPath, 
        size: stats.size, 
        mimeType, 
        chatJid 
      },
      'Sending image/file'
    );

    // Check if channel supports media sending
    if (typeof (channel as any).sendMedia === 'function') {
      // Use channel's sendMedia method if available
      await (channel as any).sendMedia(chatJid, resolvedPath, {
        caption,
        mimetype: mimeType,
        fileName,
      });
      logger.info({ chatJid, fileName }, 'Image sent via sendMedia');
      return true;
    }

    // Fallback: send as text with file path
    // (Some channels might not support media yet)
    const fallbackMessage = caption
      ? `${caption}\n\n📎 File: ${fileName}\nPath: ${resolvedPath}`
      : `📎 File: ${fileName}\nPath: ${resolvedPath}`;
    
    await channel.sendMessage(chatJid, fallbackMessage);
    logger.warn(
      { chatJid, fileName },
      'Channel does not support media, sent path as text'
    );
    return true;

  } catch (err) {
    logger.error(
      { 
        error: err instanceof Error ? err.message : String(err),
        filePath,
        chatJid 
      },
      'Failed to send image'
    );
    return false;
  }
}

/**
 * Helper: Send multiple images in sequence
 */
export async function sendImages(
  filePaths: string[],
  chatJid: string,
  channel: Channel,
  caption?: string
): Promise<number> {
  let successCount = 0;
  
  for (const filePath of filePaths) {
    const success = await sendImage({
      filePath,
      caption: filePaths.length > 1 ? `${caption} (${successCount + 1}/${filePaths.length})` : caption,
      chatJid,
      channel,
    });
    
    if (success) successCount++;
  }
  
  return successCount;
}
