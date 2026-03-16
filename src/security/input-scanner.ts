/**
 * Security Middleware — Input Scanner
 * Analyzes inbound messages for prompt injection patterns.
 * Returns a ScanResult indicating whether to pass, sanitize, or block.
 */

import {
  BLOCKING_PATTERNS,
  HTML_COMMENT_SUSPICIOUS,
  INVISIBLE_UNICODE_REGEX,
  SUSPICIOUS_BASE64,
  BASE64_SUSPICIOUS_KEYWORDS,
  XML_SPOOFING_TAGS,
  normalizeForMatching,
} from './patterns.js';
import { logSecurityEvent } from './security-logger.js';
import { isSecurityEnabled } from './index.js';
import type { ScanResult, SecurityEvent } from './types.js';

/** Create a SecurityEvent helper. */
function makeEvent(
  eventType: string,
  sourceJid: string,
  sourceGroup: string,
  severity: 'info' | 'warning' | 'critical',
  description: string,
  originalContent: string,
): SecurityEvent {
  return {
    timestamp: new Date().toISOString(),
    eventType,
    sourceJid,
    sourceGroup,
    severity,
    description,
    originalContent: originalContent.slice(0, 500),
  };
}

/**
 * Check if a base64 string decodes to suspicious content.
 * Returns true if decoded text contains instruction-like keywords.
 */
function isSuspiciousBase64(encoded: string): boolean {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    // Only flag if it decodes to readable text with suspicious keywords
    if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) return false; // binary data, not text
    return BASE64_SUSPICIOUS_KEYWORDS.test(decoded);
  } catch {
    return false;
  }
}

/**
 * Analyze an inbound message for prompt injection patterns.
 * Operates on raw message before any formatting by the Router.
 *
 * - Blocking patterns → action: 'blocked', severity 'warning'
 * - Stripping patterns → action: 'sanitized', severity 'info'
 * - Clean → action: 'pass'
 * - SECURITY_ENABLED=false → passthrough with no events
 * - Internal error → fail-open (pass through, log critical)
 */
export function scanInput(
  content: string,
  sourceJid: string,
  sourceGroup: string,
): ScanResult {
  // Bypass mode
  if (!isSecurityEnabled()) {
    return {
      action: 'pass',
      sanitizedContent: content,
      events: [],
      metadata: { scanStatus: 'pass' },
    };
  }

  try {
    return doScan(content, sourceJid, sourceGroup);
  } catch (err) {
    // Fail-open: pass message through, log critical event
    const event = makeEvent(
      'scanner_error',
      sourceJid,
      sourceGroup,
      'critical',
      `Input scanner internal error: ${err instanceof Error ? err.message : String(err)}`,
      content,
    );
    logSecurityEvent(event);
    return {
      action: 'pass',
      sanitizedContent: content,
      events: [event],
      metadata: { scanStatus: 'pass' },
    };
  }
}

function doScan(
  content: string,
  sourceJid: string,
  sourceGroup: string,
): ScanResult {
  const events: SecurityEvent[] = [];
  let sanitized = content;

  // Normalize for pattern matching (strip invisible chars, collapse whitespace)
  const normalized = normalizeForMatching(content);

  // 1. Check blocking patterns (case-insensitive, whitespace-normalized)
  for (const entry of BLOCKING_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      const event = makeEvent(
        'prompt_injection',
        sourceJid,
        sourceGroup,
        'warning',
        `Blocked: ${entry.description}`,
        content,
      );
      events.push(event);
      logSecurityEvent(event);
      return {
        action: 'blocked',
        sanitizedContent: '',
        events,
        metadata: { scanStatus: 'blocked' },
      };
    }
  }

  // 2. Strip invisible Unicode characters
  let wasSanitized = false;
  if (INVISIBLE_UNICODE_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(INVISIBLE_UNICODE_REGEX, '');
    wasSanitized = true;
    const event = makeEvent(
      'invisible_unicode',
      sourceJid,
      sourceGroup,
      'info',
      'Stripped invisible Unicode characters from message',
      content,
    );
    events.push(event);
    logSecurityEvent(event);
  }

  // 3. Strip HTML comments with suspicious keywords
  const commentMatches = sanitized.match(HTML_COMMENT_SUSPICIOUS);
  if (commentMatches) {
    sanitized = sanitized.replace(HTML_COMMENT_SUSPICIOUS, '');
    wasSanitized = true;
    const event = makeEvent(
      'html_comment_injection',
      sourceJid,
      sourceGroup,
      'info',
      `Stripped ${commentMatches.length} suspicious HTML comment(s)`,
      content,
    );
    events.push(event);
    logSecurityEvent(event);
  }

  // 4. Strip suspicious base64 content
  const base64Matches = sanitized.match(SUSPICIOUS_BASE64);
  if (base64Matches) {
    for (const match of base64Matches) {
      if (isSuspiciousBase64(match)) {
        sanitized = sanitized.replace(match, '');
        wasSanitized = true;
        const event = makeEvent(
          'suspicious_base64',
          sourceJid,
          sourceGroup,
          'info',
          'Stripped suspicious base64-encoded content',
          content,
        );
        events.push(event);
        logSecurityEvent(event);
      }
    }
  }

  // 5. Strip XML/HTML context spoofing tags
  const xmlMatches = sanitized.match(XML_SPOOFING_TAGS);
  if (xmlMatches) {
    sanitized = sanitized.replace(XML_SPOOFING_TAGS, '');
    wasSanitized = true;
    const event = makeEvent(
      'xml_spoofing',
      sourceJid,
      sourceGroup,
      'info',
      `Stripped ${xmlMatches.length} XML/HTML spoofing tag(s)`,
      content,
    );
    events.push(event);
    logSecurityEvent(event);
  }

  const action = wasSanitized ? 'sanitized' as const : 'pass' as const;
  return {
    action,
    sanitizedContent: sanitized,
    events,
    metadata: { scanStatus: action },
  };
}
