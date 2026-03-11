import { Channel, NewMessage } from './types.js';
import { logger } from './logger.js';

/**
 * Outbound message deduplication.
 * Prevents the same message from being sent twice to the same JID
 * within a short window. This handles the case where the agent uses
 * the send_message MCP tool AND returns the same text as its response.
 */
const DEDUP_WINDOW_MS = 30_000; // 30 seconds
const recentOutbound = new Map<string, number>(); // key -> timestamp

function dedupKey(jid: string, text: string): string {
  // Use first 500 chars to avoid huge map keys
  return `${jid}::${text.slice(0, 500)}`;
}

export function isDuplicate(jid: string, text: string): boolean {
  const key = dedupKey(jid, text);
  const lastSent = recentOutbound.get(key);
  const now = Date.now();

  if (lastSent && now - lastSent < DEDUP_WINDOW_MS) {
    return true;
  }

  recentOutbound.set(key, now);

  // Prune old entries periodically
  if (recentOutbound.size > 100) {
    for (const [k, ts] of recentOutbound) {
      if (now - ts > DEDUP_WINDOW_MS) recentOutbound.delete(k);
    }
  }

  return false;
}

/**
 * Send a message through the appropriate channel with deduplication.
 * Use this instead of calling channel.sendMessage() directly to prevent
 * duplicate messages from streaming callback + IPC paths.
 */
export async function sendDeduped(
  channel: Channel,
  jid: string,
  text: string,
): Promise<boolean> {
  if (isDuplicate(jid, text)) {
    logger.info({ jid }, 'Suppressed duplicate outbound message');
    return false;
  }
  await channel.sendMessage(jid, text);
  return true;
}

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extract transcribed text from audio message placeholders.
 * Converts "[Audio] Transcript: "text here"" to just "text here"
 * so OpenCode receives the actual transcribed content.
 */
function extractTranscript(content: string): string {
  // Match: [Audio] Transcript: "actual text"
  const audioTranscriptMatch = content.match(/^\[Audio\]\s+Transcript:\s+"(.+)"$/);
  if (audioTranscriptMatch) {
    return audioTranscriptMatch[1];
  }
  
  // Match: [Voice message] Transcript: "actual text" (legacy format)
  const voiceTranscriptMatch = content.match(/^\[Voice message\]\s+Transcript:\s+"(.+)"$/);
  if (voiceTranscriptMatch) {
    return voiceTranscriptMatch[1];
  }
  
  return content;
}

export function formatMessages(messages: NewMessage[]): string {
  const lines = messages.map((m) => {
    // Extract transcript if this is a transcribed audio message
    const content = extractTranscript(m.content);
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(content)}</message>`;
  });
  return `<messages>\n${lines.join('\n')}\n</messages>`;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

/**
 * Strip XML message tags that the agent might accidentally include in its response.
 * Gemini sometimes echoes the input XML format instead of just responding.
 * This removes: <messages>...</messages> and <message>...</message> tags.
 */
export function stripMessageXml(text: string): string {
  // Remove <messages> wrapper
  let cleaned = text.replace(/<\/?messages>/g, '');
  
  // Remove <message sender="..." time="...">content</message> tags
  // Keep only the content between tags
  cleaned = cleaned.replace(/<message\s+sender="[^"]*"\s+time="[^"]*">([^<]*)<\/message>/g, '$1');
  
  // Remove any remaining message tags
  cleaned = cleaned.replace(/<\/?message[^>]*>/g, '');
  
  return cleaned.trim();
}

/**
 * Convert markdown formatting based on channel type
 * - WhatsApp/Telegram: Remove headers (## Title -> Title)
 * - Web UI (future): Keep standard markdown
 */
export function convertMarkdownForChannel(text: string, jid: string): string {
  // Detect channel type from JID
  const isMessaging = jid.includes('@g.us') || jid.includes('@s.whatsapp.net') || jid.startsWith('tg:');
  
  if (isMessaging) {
    // Remove markdown headers (## Title -> Title)
    return text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  }
  
  // For web UI or other channels, keep standard markdown
  return text;
}

export function formatOutbound(rawText: string, jid?: string): string {
  // First strip internal tags and message XML that agent might echo
  let text = stripInternalTags(rawText);
  text = stripMessageXml(text);
  
  if (!text) return '';
  
  // Apply channel-specific formatting if JID provided
  if (jid) {
    return convertMarkdownForChannel(text, jid);
  }
  
  return text;
}

export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  
  // Apply channel-specific formatting
  const formattedText = formatOutbound(text, jid);
  
  return channel.sendMessage(jid, formattedText);
}

export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid));
}
