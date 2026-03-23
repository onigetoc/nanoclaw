/**
 * Security Middleware — Type Definitions
 * All shared types for the EureClaw security system.
 */

export type Severity = 'info' | 'warning' | 'critical';

export interface SecurityEvent {
  timestamp: string;
  eventType: string;
  sourceJid: string;
  sourceGroup: string;
  severity: Severity;
  description: string;
  originalContent: string; // truncated to 500 chars
}

export type ScanAction = 'pass' | 'sanitized' | 'blocked';

export interface ScanResult {
  action: ScanAction;
  sanitizedContent: string;
  events: SecurityEvent[];
  metadata: { scanStatus: ScanAction };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface CommandCheckResult {
  safe: boolean;
  pattern?: string;
  description?: string;
}

export interface ApprovalRequest {
  id: string;
  command: string;
  chatJid: string;
  workspaceFolder: string;
  pattern: string;
  requestedAt: number;
  expiresAt: number; // requestedAt + 5 minutes
  status: 'pending' | 'approved' | 'denied' | 'expired';
}
