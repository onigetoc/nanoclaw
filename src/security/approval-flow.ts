/**
 * Security Middleware — Approval Flow
 * State machine for dangerous command approval.
 * In-memory Map<string, ApprovalRequest>.
 * Non-main groups: commands blocked outright, no approval flow.
 */

import { logSecurityEvent } from './security-logger.js';
import type { ApprovalRequest, SecurityEvent } from './types.js';

const APPROVAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const pendingApprovals = new Map<string, ApprovalRequest>();

function generateId(): string {
  return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Request approval for a dangerous command.
 * Returns the ApprovalRequest with status 'pending'.
 */
export function requestApproval(
  command: string,
  chatJid: string,
  groupFolder: string,
  pattern: string,
): ApprovalRequest {
  const now = Date.now();
  const request: ApprovalRequest = {
    id: generateId(),
    command,
    chatJid,
    groupFolder,
    pattern,
    requestedAt: now,
    expiresAt: now + APPROVAL_WINDOW_MS,
    status: 'pending',
  };
  pendingApprovals.set(request.id, request);
  return request;
}

/** Check if a specific approval request exists and its current state. */
export function checkApproval(approvalId: string): ApprovalRequest | undefined {
  return pendingApprovals.get(approvalId);
}

/** Approve a pending request. Returns true if approved, false if not found or not pending. */
export function approveCommand(approvalId: string): boolean {
  const request = pendingApprovals.get(approvalId);
  if (!request || request.status !== 'pending') return false;
  if (Date.now() > request.expiresAt) {
    request.status = 'expired';
    return false;
  }
  request.status = 'approved';
  return true;
}

/** Deny a pending request. */
export function denyCommand(approvalId: string): boolean {
  const request = pendingApprovals.get(approvalId);
  if (!request || request.status !== 'pending') return false;
  request.status = 'denied';
  return true;
}

/** Expire all timed-out requests. Returns SecurityEvents for each expiry. */
export function expireApprovals(): SecurityEvent[] {
  const now = Date.now();
  const events: SecurityEvent[] = [];

  for (const [id, request] of pendingApprovals) {
    if (request.status === 'pending' && now > request.expiresAt) {
      request.status = 'expired';
      const event: SecurityEvent = {
        timestamp: new Date().toISOString(),
        eventType: 'approval_expired',
        sourceJid: request.chatJid,
        sourceGroup: request.groupFolder,
        severity: 'info',
        description: `Approval expired for command: ${request.command}`,
        originalContent: request.command.slice(0, 500),
      };
      events.push(event);
      logSecurityEvent(event);
    }
    // Clean up old entries (expired/denied/approved older than 10 min)
    if (request.status !== 'pending' && now - request.requestedAt > APPROVAL_WINDOW_MS * 2) {
      pendingApprovals.delete(id);
    }
  }

  return events;
}

/** Clear all approvals (for testing). */
export function clearApprovals(): void {
  pendingApprovals.clear();
}
