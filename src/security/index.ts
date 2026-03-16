/**
 * Security Middleware — Public API
 * Re-exports all security submodules for clean imports.
 */

export { scanInput } from './input-scanner.js';
export { scanContextFile } from './context-scanner.js';
export { redactOutput } from './output-redactor.js';
export { checkCommand } from './command-guard.js';
export { requestApproval, checkApproval, approveCommand, denyCommand, expireApprovals } from './approval-flow.js';
export { checkRateLimit } from './rate-limiter.js';
export { filterEnv } from './env-filter.js';
export { logSecurityEvent, getRecentEvents, setOnCriticalEvent } from './security-logger.js';
export type { SecurityEvent, ScanResult, RateLimitResult, CommandCheckResult, ApprovalRequest, Severity, ScanAction } from './types.js';

/** Check if the security middleware is enabled via SECURITY_ENABLED env var. */
export function isSecurityEnabled(): boolean {
  const val = process.env.SECURITY_ENABLED;
  // Default to true if not set
  if (val === undefined || val === '') return true;
  return val.toLowerCase() !== 'false';
}
