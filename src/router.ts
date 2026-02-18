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

function isDuplicate(jid: string, text: string): boolean {
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
export function sendDeduped(
  channel: Channel,
  jid: string,
  text: string,
): Promise<void> {
  if (isDuplicate(jid, text)) {
    logger.info({ jid }, 'Suppressed duplicate outbound message');
    return Promise.resolve();
  }
  return channel.sendMessage(jid, text);
}

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(messages: NewMessage[]): string {
  const lines = messages.map((m) =>
    `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`,
  );
  return `<messages>\n${lines.join('\n')}\n</messages>`;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
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
  const text = stripInternalTags(rawText);
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
