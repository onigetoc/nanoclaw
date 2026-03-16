/**
 * Security Middleware — Output Redactor
 * Redacts credentials, PII, and security flags from agent output.
 */

import {
  CREDENTIAL_PATTERNS,
  PII_EMAIL,
  PII_PHONE,
  PII_INTERNAL_IP,
  SECURITY_FLAG_TAG,
} from './patterns.js';
import { logSecurityEvent } from './security-logger.js';
import { isSecurityEnabled } from './index.js';
import type { SecurityEvent } from './types.js';

function makeEvent(
  eventType: string,
  destinationJid: string,
  severity: 'info' | 'warning' | 'critical',
  description: string,
  originalContent: string,
): SecurityEvent {
  return {
    timestamp: new Date().toISOString(),
    eventType,
    sourceJid: destinationJid,
    sourceGroup: 'output',
    severity,
    description,
    originalContent: originalContent.slice(0, 500),
  };
}

/**
 * Redact credentials, PII, and security flags from agent output.
 * - Credentials are always redacted
 * - PII is only redacted for non-main groups
 * - Security flag tags are always stripped
 */
export function redactOutput(
  text: string,
  destinationJid: string,
  isMainGroup: boolean,
): { redacted: string; events: SecurityEvent[] } {
  if (!isSecurityEnabled()) {
    return { redacted: text, events: [] };
  }

  try {
    return doRedact(text, destinationJid, isMainGroup);
  } catch (err) {
    // Fail-open: return original text, log critical
    const event = makeEvent(
      'redactor_error', destinationJid, 'critical',
      `Output redactor error: ${err instanceof Error ? err.message : String(err)}`, text,
    );
    logSecurityEvent(event);
    return { redacted: text, events: [event] };
  }
}

function doRedact(
  text: string,
  destinationJid: string,
  isMainGroup: boolean,
): { redacted: string; events: SecurityEvent[] } {
  const events: SecurityEvent[] = [];
  let redacted = text;

  // 1. Redact credential patterns (always)
  for (const { pattern, replacement, description } of CREDENTIAL_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, replacement);
      const event = makeEvent(
        'credential_leak', destinationJid, 'warning',
        `Redacted ${description} in output`, text,
      );
      events.push(event);
      logSecurityEvent(event);
    }
  }

  // 2. Redact PII for non-main groups only
  if (!isMainGroup) {
    // Email
    PII_EMAIL.lastIndex = 0;
    if (PII_EMAIL.test(redacted)) {
      PII_EMAIL.lastIndex = 0;
      redacted = redacted.replace(PII_EMAIL, '[REDACTED: PII]');
      const event = makeEvent(
        'pii_redaction', destinationJid, 'info',
        'Redacted email address(es) in output', text,
      );
      events.push(event);
      logSecurityEvent(event);
    }

    // Phone
    PII_PHONE.lastIndex = 0;
    if (PII_PHONE.test(redacted)) {
      PII_PHONE.lastIndex = 0;
      redacted = redacted.replace(PII_PHONE, '[REDACTED: PII]');
      const event = makeEvent(
        'pii_redaction', destinationJid, 'info',
        'Redacted phone number(s) in output', text,
      );
      events.push(event);
      logSecurityEvent(event);
    }

    // Internal IPs
    PII_INTERNAL_IP.lastIndex = 0;
    if (PII_INTERNAL_IP.test(redacted)) {
      PII_INTERNAL_IP.lastIndex = 0;
      redacted = redacted.replace(PII_INTERNAL_IP, '[REDACTED: PII]');
      const event = makeEvent(
        'pii_redaction', destinationJid, 'info',
        'Redacted internal IP address(es) in output', text,
      );
      events.push(event);
      logSecurityEvent(event);
    }
  }

  // 3. Strip security flag tags (always)
  SECURITY_FLAG_TAG.lastIndex = 0;
  if (SECURITY_FLAG_TAG.test(redacted)) {
    SECURITY_FLAG_TAG.lastIndex = 0;
    // Extract flag content for logging before stripping
    const flagMatches = redacted.match(SECURITY_FLAG_TAG);
    redacted = redacted.replace(SECURITY_FLAG_TAG, '');
    if (flagMatches) {
      const event = makeEvent(
        'security_flag', destinationJid, 'warning',
        `Agent flagged manipulation attempt: ${flagMatches.length} flag(s)`, text,
      );
      events.push(event);
      logSecurityEvent(event);
    }
  }

  return { redacted: redacted.trim(), events };
}
