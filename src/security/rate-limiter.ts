/**
 * Security Middleware — Rate Limiter
 * Sliding window rate limiter per JID.
 * Main group is always exempt.
 */

import type { RateLimitResult } from './types.js';

// Configurable via env vars
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10);
const DEFAULT_GROUP_LIMIT = parseInt(process.env.RATE_LIMIT_GROUP || '20', 10);
const DEFAULT_DM_LIMIT = parseInt(process.env.RATE_LIMIT_DM || '10', 10);

// Sliding window: Map<jid, timestamp[]>
const windows = new Map<string, number[]>();

/**
 * Determine if a JID is a group (vs DM) based on format.
 * WhatsApp groups: @g.us, Telegram groups: tg:-100
 */
function isGroupJid(jid: string): boolean {
  return jid.includes('@g.us') || jid.startsWith('tg:-');
}

/**
 * Check if a JID is within its rate limit.
 * Main group is always exempt.
 */
export function checkRateLimit(
  jid: string,
  isMainGroup: boolean,
  customThreshold?: number,
): RateLimitResult {
  // Main group is always exempt
  if (isMainGroup) {
    return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
  }

  const now = Date.now();
  const threshold = customThreshold ?? (isGroupJid(jid) ? DEFAULT_GROUP_LIMIT : DEFAULT_DM_LIMIT);

  // Get or create window for this JID
  let timestamps = windows.get(jid);
  if (!timestamps) {
    timestamps = [];
    windows.set(jid, timestamps);
  }

  // Prune timestamps outside the window
  const windowStart = now - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift();
  }

  // Check if within limit
  if (timestamps.length >= threshold) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  // Record this request
  timestamps.push(now);
  return {
    allowed: true,
    remaining: threshold - timestamps.length,
    retryAfterMs: 0,
  };
}

/** Clear all rate limit state (for testing). */
export function clearRateLimits(): void {
  windows.clear();
}
