/**
 * Security Middleware — Environment Variable Filter
 * Filters process.env to only include safe variables for subprocesses.
 */

import { ENV_ALLOWLIST, ENV_SECRET_PATTERNS } from './patterns.js';
import { logSecurityEvent } from './security-logger.js';

/**
 * Filter environment variables to only pass allowlisted ones.
 * Excludes any variable whose name contains KEY, TOKEN, SECRET, PASSWORD, or CREDENTIAL.
 * Logs excluded secret-pattern variables as SecurityEvents.
 */
export function filterEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const filtered: Record<string, string> = {};
  const excluded: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;

    if (ENV_ALLOWLIST.has(key)) {
      filtered[key] = value;
    } else if (ENV_SECRET_PATTERNS.test(key)) {
      excluded.push(key);
    }
    // Variables not in allowlist and not matching secret patterns are silently dropped
  }

  // Log excluded secrets
  if (excluded.length > 0) {
    logSecurityEvent({
      timestamp: new Date().toISOString(),
      eventType: 'env_filter',
      sourceJid: 'system',
      sourceGroup: 'system',
      severity: 'info',
      description: `Filtered ${excluded.length} secret env var(s): ${excluded.join(', ')}`,
      originalContent: excluded.join(', ').slice(0, 500),
    });
  }

  return filtered;
}
