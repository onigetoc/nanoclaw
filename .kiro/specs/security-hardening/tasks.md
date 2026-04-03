# Implementation Plan: Security Hardening

## Overview

Implement a defense-in-depth security system for EureClaw with two layers: hardcoded TypeScript middleware in `src/security/` (Layer 1) and a security skill `SECURITY.md` (Layer 2). All modules are TypeScript, tested with `bun test` and `fast-check`, and must work on Windows 11 and in container mode.

## Tasks

- [x] 1. Set up project structure, types, and shared patterns
  - [x] 1.1 Create `src/security/types.ts` with `SecurityEvent`, `ScanResult`, `RateLimitResult`, `CommandCheckResult`, `ApprovalRequest`, and `Severity`/`ScanAction` types
    - Define all interfaces and types exactly as specified in the design
    - _Requirements: 6.1, 9.4_

  - [x] 1.2 Create `src/security/patterns.ts` with shared regex patterns for injection detection, credential matching, and dangerous commands
    - Blocking patterns: instruction override, identity hijack, jailbreak phrases, prompt extraction, secret reading, credential exfiltration
    - Stripping patterns: HTML comments with suspicious keywords, invisible Unicode ranges, suspicious base64, XML/HTML context spoofing tags
    - Credential patterns: `ghp_*`, `sk-*`, `Bearer`, key-value secrets, `AKIA*`, private key blocks
    - Dangerous command patterns: all entries from Requirement 4 table (rm -rf, chmod 777, mkfs, dd, SQL DROP/DELETE/TRUNCATE, pipe-to-shell, fork bombs, Windows format/diskpart/del/rmdir, etc.)
    - All text patterns must be case-insensitive
    - _Requirements: 1.2, 1.3, 1.4, 3.2, 3.3, 4.1_

  - [x] 1.3 Create `src/security/security-logger.ts` with `logSecurityEvent()` and `getRecentEvents()`
    - Write JSON Lines to `data/security/security-events.log`
    - Ensure `data/security/` directory is created on first write
    - Truncate `originalContent` to 500 characters
    - Accept a callback for critical event notifications to main group
    - Fallback to application logger (pino) if file write fails
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.4 Create `src/security/index.ts` as the public API barrel file re-exporting all submodules
    - Also export `isSecurityEnabled()` that reads `SECURITY_ENABLED` env var (default `true`)
    - _Requirements: 9.2, 9.3_

  - [x] 1.5 Install `fast-check` as a dev dependency: `bun add -d fast-check`
    - _Requirements: Testing infrastructure_

- [x] 2. Checkpoint — Ensure types, patterns, and logger compile
  - Run `bun run build` to verify no type errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement input scanner
  - [x] 3.1 Create `src/security/input-scanner.ts` with `scanInput(content, sourceJid, sourceGroup): ScanResult`
    - Strip zero-width/invisible Unicode characters before pattern matching
    - Normalize whitespace for pattern matching (collapse multiple spaces, handle zero-width chars between words)
    - Check blocking patterns → return `action: 'blocked'`, severity `'warning'`
    - Check stripping patterns → return `action: 'sanitized'`, severity `'info'`
    - If `SECURITY_ENABLED=false`, return `{ action: 'pass', sanitizedContent: original }` with no events
    - Set `metadata.scanStatus` equal to `action`
    - Fail-open: if scanner throws internally, pass message through and log critical event
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.3, 9.5_

  - [ ]* 3.2 Write property test: Blocking pattern detection is case- and obfuscation-invariant
    - **Property 1: Blocking pattern detection is case- and obfuscation-invariant**
    - Generate messages with embedded blocking patterns using random case, extra whitespace, and zero-width characters
    - Assert `scanInput()` returns `action: 'blocked'` with at least one event of severity `'warning'`
    - **Validates: Requirements 1.2, 1.4, 1.6**

  - [ ]* 3.3 Write property test: Stripping patterns are removed from messages
    - **Property 2: Stripping patterns are removed from messages**
    - Generate messages with HTML comments (suspicious keywords), invisible Unicode, suspicious base64, XML/HTML spoofing tags
    - Assert `scanInput()` returns `action: 'sanitized'` and `sanitizedContent` does not contain the stripped element
    - **Validates: Requirements 1.3**

  - [ ]* 3.4 Write property test: Bypass mode passthrough
    - **Property 13: Bypass mode passthrough**
    - Generate arbitrary message content, set `SECURITY_ENABLED=false`
    - Assert `scanInput()` returns `{ action: 'pass', sanitizedContent: original }` with no events
    - **Validates: Requirements 9.3**

  - [ ]* 3.5 Write property test: Scan result metadata consistency
    - **Property 14: Scan result metadata consistency**
    - For any call to `scanInput()`, assert `result.metadata.scanStatus === result.action`
    - **Validates: Requirements 9.4**

- [x] 4. Implement context scanner
  - [x] 4.1 Create `src/security/context-scanner.ts` with `scanContextFile(content, filename, sourceGroup): ScanResult`
    - Reuse patterns from `patterns.ts` for context-file-specific categories
    - Always strip invisible Unicode characters
    - Strip suspicious sections (instruction overrides, HTML comments, secret access, credential exfiltration, encoded payloads)
    - Scan on every load, not cached
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 4.2 Write property test: Context file sanitization removes injections and invisible characters
    - **Property 3: Context file sanitization removes injections and invisible characters**
    - Generate context file content with injected patterns and invisible Unicode
    - Assert output contains zero invisible Unicode characters and suspicious elements are removed
    - **Validates: Requirements 2.2, 2.3**

- [x] 5. Implement output redactor
  - [x] 5.1 Create `src/security/output-redactor.ts` with `redactOutput(text, destinationJid, isMainGroup): { redacted, events }`
    - Redact GitHub tokens, API keys, Bearer tokens, key-value secrets, AWS keys
    - Redact private key blocks with `[REDACTED: private key]`
    - Redact PII (email, phone, internal IPs) only when `isMainGroup: false` → `[REDACTED: PII]`
    - Strip `<security-flag>` tags and log event
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.5_

  - [ ]* 5.2 Write property test: Output credential and secret redaction
    - **Property 4: Output credential and secret redaction**
    - Generate text with embedded credential patterns, private key blocks, and security-flag tags
    - Assert all are replaced with appropriate redaction markers and events are produced
    - **Validates: Requirements 3.2, 3.3, 8.5**

  - [ ]* 5.3 Write property test: PII redaction is conditional on group membership
    - **Property 5: PII redaction is conditional on group membership**
    - Generate text with emails, phone numbers, internal IPs
    - Assert PII is redacted when `isMainGroup: false`, preserved when `isMainGroup: true`
    - **Validates: Requirements 3.4**

- [x] 6. Checkpoint — Ensure scanners and redactor compile and pass tests
  - Run `bun run build` and `bun test src/security/`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement command guard and approval flow
  - [x] 7.1 Create `src/security/command-guard.ts` with `checkCommand(command): CommandCheckResult`
    - Match all dangerous patterns from Requirement 4 table
    - Return `{ safe: false, pattern, description }` on match
    - Fail-closed: if guard throws, block the command and log critical event
    - _Requirements: 4.1, 4.6_

  - [x] 7.2 Create `src/security/approval-flow.ts` with `requestApproval()`, `checkApproval()`, `approveCommand()`, `expireApprovals()`
    - In-memory `Map<string, ApprovalRequest>` state
    - 5-minute approval window
    - Non-main groups: commands blocked outright, no approval flow
    - `expireApprovals()` transitions timed-out requests to `'expired'` and produces SecurityEvents
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 7.3 Write property test: Dangerous command detection
    - **Property 6: Dangerous command detection**
    - Generate command strings containing dangerous patterns
    - Assert `checkCommand()` returns `{ safe: false }` with matched pattern
    - **Validates: Requirements 4.1**

  - [ ]* 7.4 Write property test: Non-main groups cannot approve dangerous commands
    - **Property 7: Non-main groups cannot approve dangerous commands**
    - For any dangerous command from a non-main group, assert it is blocked without approval possibility
    - **Validates: Requirements 4.5**

  - [ ]* 7.5 Write property test: Approval window validity and expiry
    - **Property 8: Approval window validity and expiry**
    - Create approval requests, verify pending/approved status within 5 minutes, verify expiry after 5 minutes
    - **Validates: Requirements 4.3, 4.4**

- [x] 8. Implement rate limiter
  - [x] 8.1 Create `src/security/rate-limiter.ts` with `checkRateLimit(jid, isMainGroup, customThreshold?): RateLimitResult`
    - Sliding window using `Map<string, number[]>` of timestamps per JID
    - Defaults: 20/min for groups, 10/min for DMs (configurable via env vars `RATE_LIMIT_GROUP`, `RATE_LIMIT_DM`, `RATE_LIMIT_WINDOW`)
    - Main group always exempt
    - Return `{ allowed, remaining, retryAfterMs }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 8.2 Write property test: Rate limit threshold enforcement
    - **Property 9: Rate limit threshold enforcement**
    - For non-main JIDs, call `checkRateLimit()` more than threshold times within window
    - Assert calls beyond threshold return `{ allowed: false }` with positive `retryAfterMs`
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 8.3 Write property test: Main group rate limit exemption
    - **Property 10: Main group rate limit exemption**
    - For any number of requests with `isMainGroup: true`, assert `{ allowed: true }`
    - **Validates: Requirements 5.5**

- [x] 9. Implement environment variable filter
  - [x] 9.1 Create `src/security/env-filter.ts` with `filterEnv(env): Record<string, string>`
    - Allowlist: `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `NODE_ENV`, `LOG_LEVEL`, `OPENCODE_BASE_URL`, `TZ`
    - Exclude any variable whose name contains `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, or `CREDENTIAL` (case-insensitive)
    - Log excluded secret-pattern variables as SecurityEvents with severity `'info'`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 9.2 Write property test: Environment variable filtering excludes secrets
    - **Property 12: Environment variable filtering excludes secrets**
    - Generate environment objects with mixed allowlisted and secret-pattern variables
    - Assert output contains only allowlisted variables and none of the secret-pattern variables
    - **Validates: Requirements 7.1, 7.3**

- [x] 10. Checkpoint — Ensure all security modules compile and pass tests
  - Run `bun run build` and `bun test src/security/`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement Security Event structure invariant test
  - [ ]* 11.1 Write property test: Security event structure invariant
    - **Property 11: Security event structure invariant**
    - Collect SecurityEvents from all security components (scanInput, scanContextFile, redactOutput, checkCommand, checkRateLimit, filterEnv)
    - Assert each event has: timestamp (ISO string), eventType (non-empty), sourceJid, sourceGroup, severity (info|warning|critical), description (non-empty), originalContent (≤500 chars)
    - **Validates: Requirements 6.1**

- [x] 12. Integrate input scanning and rate limiting into `src/startup.ts`
  - [x] 12.1 Modify `src/startup.ts` → `channelOpts.onMessage` to call `checkRateLimit()` before processing
    - If rate limited, send a message to the user with remaining wait time and return early
    - Main group is exempt
    - Read custom threshold from `group.containerConfig` if available
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 12.2 Modify `src/startup.ts` → `channelOpts.onMessage` to call `scanInput()` after rate limit check, before `storeMessage()`
    - If `action: 'blocked'`, send a rejection message to the user and return early
    - If `action: 'sanitized'`, replace `msg.content` with `sanitizedContent` before continuing
    - If `action: 'pass'`, continue normally
    - Attach `metadata.scanStatus` to the message flow
    - _Requirements: 1.1, 1.5, 9.1, 9.4_

- [x] 13. Integrate output redaction into `src/message-processor.ts`
  - [x] 13.1 Modify `src/message-processor.ts` → `onOutput` callback to call `redactOutput()` before `sendDeduped()`
    - Determine `isMainGroup` from `group.folder === MAIN_GROUP_FOLDER`
    - Redact the `result.result` text before sending
    - Log any redaction events
    - _Requirements: 3.1, 3.5_

- [x] 14. Integrate context scanning into `container/agent-runner/src/index.ts`
  - [x] 14.1 Modify context file loading in `container/agent-runner/src/index.ts` to call `scanContextFile()` on each loaded `.md` file
    - Scan AGENTS.md, GUIDELINES.md, IDENTITY.md, SOUL.md, TOOLS.md, USER.md, MEMORY.md, and global AGENTS.md
    - Replace file content with sanitized content before injecting into agent context
    - Log any security events
    - Note: `scanContextFile` must be importable from the agent-runner (may need to copy or share the module)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 15. Integrate command guard into `container/agent-runner/src/ipc-mcp-stdio.ts`
  - [x] 15.1 Add `checkCommand()` wrapper around shell-executing MCP tools in `container/agent-runner/src/ipc-mcp-stdio.ts`
    - Before executing any shell command, call `checkCommand()`
    - If unsafe and non-main group: block outright
    - If unsafe and main group: trigger approval flow, send approval request message via IPC
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 15.2 Add `security_report` MCP tool to `container/agent-runner/src/ipc-mcp-stdio.ts`
    - Main group only: read last N lines from `data/security/security-events.log`, parse JSON Lines, return formatted report
    - Default limit: 20 events
    - _Requirements: 6.4_

- [x] 16. Integrate env filtering into runners
  - [x] 16.1 Modify `src/direct-runner.ts` to use `filterEnv()` from `src/security/env-filter.ts` instead of ad-hoc env filtering
    - Replace the manual `filteredEnv` logic with `filterEnv(process.env)`
    - Keep `HEADED`, `GROUP_FOLDER`, `PROJECT_DIR`, `OPENCODE_BASE_URL` additions after filtering
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 16.2 Modify `src/container-runner.ts` → `readSecrets()` or env passing to use `filterEnv()` for any environment variables passed to containers
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 17. Integrate security flag stripping into `src/router.ts`
  - [x] 17.1 Modify `src/router.ts` → `formatOutbound()` to strip `<security-flag>` tags from agent responses and log SecurityEvents
    - Strip tags before sending to user
    - Log event with the flag content
    - _Requirements: 8.4, 8.5_

- [x] 18. Checkpoint — Ensure all integrations compile
  - Run `bun run build`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Create Security Skill
  - [x] 19.1 Create `workspaces/global/memory/SECURITY.md` with agent security instructions
    - Instructions to refuse: revealing system prompt, ignoring previous instructions, impersonating another system, executing obfuscated code without explanation
    - Safe refusal patterns: polite, no detection mechanism revealed
    - Instruction to use `<security-flag>reason</security-flag>` when detecting manipulation
    - Written in English
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 20. Final checkpoint — Ensure everything compiles and all tests pass
  - Run `bun run build` and `bun test src/security/`
  - Build passed successfully.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All code in TypeScript, all text in English
- Use `bun` for all commands (not npm)
- Files must not exceed 600 lines — split if needed
- Must work on Windows 11 and in container mode
