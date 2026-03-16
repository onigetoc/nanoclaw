/**
 * Security Middleware — Context File Scanner
 * Scans context files (AGENTS.md, IDENTITY.md, etc.) for hidden injections.
 * Reuses patterns from patterns.ts with context-file-specific categories.
 */

import {
  BLOCKING_PATTERNS,
  HTML_COMMENT_SUSPICIOUS,
  INVISIBLE_UNICODE_REGEX,
  SUSPICIOUS_BASE64,
  BASE64_SUSPICIOUS_KEYWORDS,
  CONTEXT_SECRET_ACCESS,
  CONTEXT_EXFILTRATION,
  SUSPICIOUS_HEX,
  normalizeForMatching,
} from './patterns.js';
import { logSecurityEvent } from './security-logger.js';
import { isSecurityEnabled } from './index.js';
import type { ScanResult, SecurityEvent } from './types.js';

function makeEvent(
  eventType: string,
  sourceGroup: string,
  severity: 'info' | 'warning' | 'critical',
  description: string,
  originalContent: string,
): SecurityEvent {
  return {
    timestamp: new Date().toISOString(),
    eventType,
    sourceJid: 'context-file',
    sourceGroup,
    severity,
    description,
    originalContent: originalContent.slice(0, 500),
  };
}

function isSuspiciousBase64(encoded: string): boolean {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) return false;
    return BASE64_SUSPICIOUS_KEYWORDS.test(decoded);
  } catch {
    return false;
  }
}

/**
 * Scan a context file for hidden injections.
 * Always strips invisible Unicode. Strips suspicious sections.
 * Scans on every load (not cached).
 */
export function scanContextFile(
  content: string,
  filename: string,
  sourceGroup: string,
): ScanResult {
  if (!isSecurityEnabled()) {
    return {
      action: 'pass',
      sanitizedContent: content,
      events: [],
      metadata: { scanStatus: 'pass' },
    };
  }

  try {
    return doContextScan(content, filename, sourceGroup);
  } catch (err) {
    const event = makeEvent(
      'context_scanner_error',
      sourceGroup,
      'critical',
      `Context scanner error on ${filename}: ${err instanceof Error ? err.message : String(err)}`,
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

function doContextScan(
  content: string,
  filename: string,
  sourceGroup: string,
): ScanResult {
  const events: SecurityEvent[] = [];
  let sanitized = content;
  let wasSanitized = false;

  // 1. Always strip invisible Unicode
  if (INVISIBLE_UNICODE_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(INVISIBLE_UNICODE_REGEX, '');
    wasSanitized = true;
    const event = makeEvent('invisible_unicode', sourceGroup, 'info',
      `Stripped invisible Unicode from ${filename}`, content);
    events.push(event);
    logSecurityEvent(event);
  }

  // 2. Check for instruction override patterns (strip, don't block — it's a file, not a message)
  const normalized = normalizeForMatching(sanitized);
  for (const entry of BLOCKING_PATTERNS) {
    if (entry.category === 'instruction_override' && entry.pattern.test(normalized)) {
      // Find and strip the line containing the pattern
      const lines = sanitized.split('\n');
      sanitized = lines.filter(line => !entry.pattern.test(normalizeForMatching(line))).join('\n');
      wasSanitized = true;
      const event = makeEvent('context_injection', sourceGroup, 'warning',
        `Stripped instruction override from ${filename}: ${entry.description}`, content);
      events.push(event);
      logSecurityEvent(event);
    }
  }

  // 3. Strip HTML comments with suspicious keywords
  if (HTML_COMMENT_SUSPICIOUS.test(sanitized)) {
    sanitized = sanitized.replace(HTML_COMMENT_SUSPICIOUS, '');
    wasSanitized = true;
    const event = makeEvent('html_comment_injection', sourceGroup, 'info',
      `Stripped suspicious HTML comments from ${filename}`, content);
    events.push(event);
    logSecurityEvent(event);
  }

  // 4. Strip secret access references
  if (CONTEXT_SECRET_ACCESS.test(sanitized)) {
    const lines = sanitized.split('\n');
    sanitized = lines.filter(line => !CONTEXT_SECRET_ACCESS.test(line)).join('\n');
    wasSanitized = true;
    const event = makeEvent('secret_access', sourceGroup, 'warning',
      `Stripped secret access references from ${filename}`, content);
    events.push(event);
    logSecurityEvent(event);
  }

  // 5. Strip credential exfiltration commands
  if (CONTEXT_EXFILTRATION.test(sanitized)) {
    const lines = sanitized.split('\n');
    sanitized = lines.filter(line => !CONTEXT_EXFILTRATION.test(line)).join('\n');
    wasSanitized = true;
    const event = makeEvent('credential_exfiltration', sourceGroup, 'warning',
      `Stripped credential exfiltration commands from ${filename}`, content);
    events.push(event);
    logSecurityEvent(event);
  }

  // 6. Strip suspicious base64 content
  const base64Matches = sanitized.match(SUSPICIOUS_BASE64);
  if (base64Matches) {
    for (const match of base64Matches) {
      if (isSuspiciousBase64(match)) {
        sanitized = sanitized.replace(match, '');
        wasSanitized = true;
        const event = makeEvent('encoded_payload', sourceGroup, 'info',
          `Stripped suspicious base64 from ${filename}`, content);
        events.push(event);
        logSecurityEvent(event);
      }
    }
  }

  // 7. Strip suspicious hex-encoded content (check if decodes to instruction-like text)
  const hexMatches = sanitized.match(SUSPICIOUS_HEX);
  if (hexMatches) {
    for (const match of hexMatches) {
      try {
        const decoded = Buffer.from(match, 'hex').toString('utf-8');
        if (BASE64_SUSPICIOUS_KEYWORDS.test(decoded)) {
          sanitized = sanitized.replace(match, '');
          wasSanitized = true;
          const event = makeEvent('encoded_payload', sourceGroup, 'info',
            `Stripped suspicious hex-encoded content from ${filename}`, content);
          events.push(event);
          logSecurityEvent(event);
        }
      } catch {
        // Not valid hex, skip
      }
    }
  }

  const action = wasSanitized ? 'sanitized' as const : 'pass' as const;
  return { action, sanitizedContent: sanitized, events, metadata: { scanStatus: action } };
}
