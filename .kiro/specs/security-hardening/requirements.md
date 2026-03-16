# Requirements — Security Hardening

## Introduction

This feature adds a defense-in-depth security system to EureClaw, structured in two complementary layers. **Layer 1** (hardcoded middleware in EureClaw's host TypeScript code) intercepts and filters messages before they reach the AI agent, providing protection the agent cannot bypass. **Layer 2** (security skill) provides system prompt instructions to reinforce manipulation detection at the agent level.

EureClaw already has container isolation (Apple Container), group-based allowlisting, and access control via registered groups. What's missing: input scanning/sanitization, prompt injection detection, output credential redaction, dangerous command approval flow, rate limiting, and a security skill for the agent.

Important: EureClaw runs in two modes — container mode (Apple Container) and direct mode (no container). The security middleware MUST work in both modes. Container isolation is an additional boundary, not a replacement for the middleware.

## Glossary

- **Security_Middleware**: TypeScript module in EureClaw's host code (`src/security/`) that intercepts inbound and outbound messages. Runs on the host side, cannot be bypassed by the agent.
- **Input_Scanner**: Component of Security_Middleware responsible for analyzing incoming messages before forwarding to the agent.
- **Output_Redactor**: Component of Security_Middleware responsible for filtering agent responses before sending to the user.
- **Prompt_Injection**: Attack technique where a user inserts malicious instructions into a message to manipulate the AI agent's behavior.
- **Rate_Limiter**: Component of Security_Middleware that limits the number of requests per user/group within a time window.
- **Dangerous_Command**: Potentially destructive system command (e.g., `rm -rf`, `DROP TABLE`, `curl | sh`, fork bombs) that the agent might attempt to execute.
- **Credential_Pattern**: Regex identifying secrets in text (e.g., `ghp_`, `sk-`, `Bearer`, `token=`, `key=`, `API_KEY=`, `password=`, `secret=`).
- **Security_Skill**: Instruction file (`SECURITY.md`) loaded into the agent's system prompt to reinforce manipulation detection at the AI level.
- **Security_Event**: Structured record of a security incident (injection attempt, credential leak detected, dangerous command blocked, rate limit hit).
- **Approval_Flow**: Mechanism where a detected dangerous command is held pending and submitted for user approval before execution.
- **Context_File**: File loaded into the agent's context (MEMORY.md, AGENTS.md, etc.) that could contain hidden prompt injections.

## Requirements

### Requirement 1: Input scanning and sanitization

**User Story:** As an EureClaw operator, I want all incoming messages to be analyzed and sanitized before reaching the agent, so that manipulation attempts are blocked.

The following prompt injection patterns trigger detection:

| Category | Patterns | Action |
|----------|----------|--------|
| Instruction override | "ignore previous instructions", "ignore prior instructions", "disregard all prior", "disregard your instructions", "forget your instructions", "override your instructions", "ignore all previous prompts" | Block message |
| Identity hijack | "you are now", "act as", "pretend you are", "from now on you are", "you are no longer", "your new role is", "system prompt override", "new system prompt" | Block message |
| Prompt extraction | "repeat your instructions", "show me your prompt", "what are your instructions", "print your system prompt", "output your rules", "reveal your guidelines" | Block message |
| Jailbreak phrases | "DAN mode", "developer mode enabled", "ignore safety", "no restrictions", "bypass filters", "unrestricted mode", "jailbreak" | Block message |
| Hidden HTML comments | `<!-- ... -->` containing keywords: ignore, override, system, prompt, instructions, execute, admin | Strip comments, log event |
| Invisible Unicode | Zero-width spaces (U+200B), zero-width joiners (U+200D), zero-width non-joiners (U+200C), word joiners (U+2060), invisible separators (U+2063), bidirectional overrides (U+202A-U+202E, U+2066-U+2069) | Strip characters, log event |
| Suspicious base64 | Base64-encoded strings that decode to instruction-like content (containing "ignore", "system", "execute", "prompt") | Strip encoded content, log event |
| XML/HTML context spoofing | Tags like `<system>`, `<assistant>`, `<instructions>`, `<admin>`, `<root>`, `<sudo>` | Strip tags, log event |
| Secret reading attempts | "read .env", "cat .env", "show credentials", "print .netrc", "read /etc/passwd", "show secrets" | Block message |
| Credential exfiltration | `curl` / `wget` / `fetch` combined with env vars, tokens, keys, or piping to external URLs | Block message |

#### Acceptance Criteria

1. WHEN a message is received from WhatsApp, Telegram, or email, THE Input_Scanner SHALL analyze the message content before forwarding it to the agent.
2. WHEN the Input_Scanner detects a prompt injection pattern from the "instruction override", "identity hijack", "jailbreak phrases", "prompt extraction", "secret reading attempts", or "credential exfiltration" categories, THE Security_Middleware SHALL block the message entirely and log a Security_Event with severity "warning".
3. WHEN the Input_Scanner detects patterns from the "hidden HTML comments", "invisible Unicode", "suspicious base64", or "XML/HTML context spoofing" categories, THE Security_Middleware SHALL strip the suspicious elements from the message before forwarding and log a Security_Event with severity "info".
4. THE Input_Scanner SHALL perform case-insensitive matching for all text-based patterns.
5. THE Input_Scanner SHALL operate on the raw message before any formatting by the Router, ensuring sanitization precedes XML formatting.
6. THE Input_Scanner SHALL detect patterns even when obfuscated with extra whitespace, mixed case, or zero-width characters inserted between words.

### Requirement 2: Prompt injection detection in context files

**User Story:** As an EureClaw operator, I want context files loaded by the agent to be scanned for hidden injections, to prevent compromise via modified files.

#### Acceptance Criteria

The following patterns are scanned in context files:

| Category | Patterns | Action |
|----------|----------|--------|
| Instruction override | Same patterns as Requirement 1 (ignore/disregard/override instructions) | Strip section, log event |
| Hidden HTML comments | `<!-- ... -->` with suspicious keywords (ignore, override, system, execute, admin, secret) | Strip comments, log event |
| Secret access attempts | References to `.env`, `credentials`, `.netrc`, `id_rsa`, `private_key`, `aws_credentials` | Strip section, log event |
| Credential exfiltration | `curl`, `wget`, `fetch`, `nc` combined with env vars, tokens, or piping to external URLs | Strip section, log event |
| Invisible Unicode | Zero-width spaces (U+200B), zero-width joiners (U+200D), zero-width non-joiners (U+200C), word joiners (U+2060), bidirectional overrides (U+202A-U+202E, U+2066-U+2069) | Strip characters, log event |
| Encoded payloads | Base64 or hex-encoded strings that decode to instruction-like or exfiltration content | Strip encoded content, log event |

1. WHEN a Context_File is loaded into the agent's context (MEMORY.md, AGENTS.md, IDENTITY.md, SOUL.md, TOOLS.md, GUIDELINES.md, USER.md), THE Input_Scanner SHALL analyze the file for all patterns listed in the table above.
2. WHEN the Input_Scanner detects an injection attempt in a Context_File, THE Security_Middleware SHALL strip the suspicious sections and log a Security_Event with the matched category.
3. WHEN a Context_File contains invisible Unicode characters, THE Input_Scanner SHALL remove them from the content before loading.
4. THE Input_Scanner SHALL scan context files on every load (not just first load), since files can be modified between agent invocations.

### Requirement 3: Credential and sensitive data redaction in output

**User Story:** As an EureClaw operator, I want agent responses to be filtered to remove any accidental credential or sensitive data leaks, to protect my secrets.

#### Acceptance Criteria

1. WHEN the agent produces a response, THE Output_Redactor SHALL scan the text for Credential_Patterns before sending to the user.
2. WHEN the Output_Redactor detects a pattern matching a secret (GitHub tokens `ghp_*`, API keys `sk-*`, `Bearer *`, `token=*`, `key=*`, `API_KEY=*`, `password=*`, `secret=*`, AWS keys `AKIA*`), THE Output_Redactor SHALL replace the value with `[REDACTED]` and log a Security_Event.
3. WHEN the Output_Redactor detects content resembling a private key (`-----BEGIN * PRIVATE KEY-----` blocks), THE Output_Redactor SHALL replace the entire block with `[REDACTED: private key]` and log a Security_Event.
4. WHEN the Output_Redactor detects an email address, phone number, or internal IP address (10.x, 172.16-31.x, 192.168.x ranges) in a response destined for a non-main group, THE Output_Redactor SHALL replace that data with `[REDACTED: PII]`.
5. THE Output_Redactor SHALL process responses sent via the MCP tool `send_message` and direct agent responses identically.

### Requirement 4: Dangerous command detection and approval flow

**User Story:** As an EureClaw operator, I want dangerous system commands to be detected and submitted for my approval before execution, to prevent accidental destructive actions.

The following patterns trigger approval prompts:

| Pattern | Description |
|---------|-------------|
| `rm -r` / `rm --recursive` / `rm -rf` | Recursive delete |
| `rm ... /` | Delete in root path |
| `chmod 777` | World-writable permissions |
| `mkfs` | Format filesystem |
| `dd if=` | Disk copy |
| `DROP TABLE` / `DROP DATABASE` | SQL DROP |
| `DELETE FROM` (without WHERE) | SQL DELETE without WHERE |
| `TRUNCATE TABLE` | SQL TRUNCATE |
| `> /etc/` | Overwrite system config |
| `systemctl stop/disable/mask` | Stop/disable system services |
| `kill -9 -1` | Kill all processes |
| `curl ... \| sh` / `wget ... \| sh` | Pipe remote content to shell |
| `bash -c` / `sh -c` | Shell execution via flags |
| `find -exec rm` / `find -delete` | Find with destructive actions |
| `:(){ :\|:& };:` and variants | Fork bombs |
| `format` / `diskpart` | Windows disk formatting |
| `del /s /q` / `rmdir /s /q` | Windows recursive delete |

#### Acceptance Criteria

1. WHEN the agent attempts to execute a command matching a dangerous pattern from the table above, THE Security_Middleware SHALL block execution and log a Security_Event.
2. WHEN a Dangerous_Command is detected, THE Approval_Flow SHALL send a message to the user describing the blocked command and requesting explicit confirmation.
3. WHEN the user approves a command via the Approval_Flow, THE Security_Middleware SHALL allow single execution of that specific command within a 5-minute window.
4. WHEN the 5-minute approval window expires without user response, THE Approval_Flow SHALL cancel the request and log a Security_Event.
5. WHILE the source group is a non-main group, THE Security_Middleware SHALL block any Dangerous_Command without approval possibility.
6. THE dangerous command patterns SHALL work regardless of execution mode (container or direct), since the agent can execute commands in both modes.

### Requirement 5: Rate limiting

**User Story:** As an EureClaw operator, I want to limit the number of requests per user and per group within a time window, to prevent abuse and system overload.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL maintain a request counter per JID (user or group) over a configurable sliding window (default: 60 seconds).
2. WHEN the request count for a JID exceeds the configured threshold (default: 20 requests per window for groups, 10 for DMs), THE Rate_Limiter SHALL reject excess requests and log a Security_Event.
3. WHEN a request is rejected by the Rate_Limiter, THE Security_Middleware SHALL send a message to the user indicating the limit was reached and the remaining wait time.
4. WHERE configuration allows, THE Rate_Limiter SHALL accept custom thresholds per group via `RegisteredGroup.containerConfig`.
5. THE Rate_Limiter SHALL exempt the main group from rate limiting for administration operations.

### Requirement 6: Security event logging

**User Story:** As an EureClaw operator, I want all security incidents to be logged in a structured manner, so I can audit and diagnose attack attempts.

#### Acceptance Criteria

1. THE Security_Middleware SHALL record each Security_Event with the following fields: timestamp, event type, source JID, source group, severity (info, warning, critical), description, and original content (truncated to 500 characters).
2. WHEN a Security_Event with severity "critical" is recorded (credential leak, prompt injection bypassing the filter), THE Security_Middleware SHALL send a notification to the main group.
3. THE Security_Middleware SHALL write Security_Events to a dedicated log file (`data/security/security-events.log`) in JSON Lines format, separate from application logs.
4. THE Security_Middleware SHALL expose an MCP tool `security_report` allowing the main agent to query recent security events.

### Requirement 7: Environment variable filtering for subprocesses

**User Story:** As an EureClaw operator, I want subprocesses launched by the agent to only inherit necessary environment variables, to limit secret exposure.

#### Acceptance Criteria

1. WHEN the Security_Middleware prepares the environment for a subprocess (container or direct mode), THE Security_Middleware SHALL filter environment variables to only pass those on an explicit allowlist.
2. THE Security_Middleware SHALL maintain a default allowlist containing only: `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `NODE_ENV`, `LOG_LEVEL`, `OPENCODE_BASE_URL`, `TZ`.
3. IF an environment variable containing a secret pattern (containing `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`) is present in `process.env`, THEN THE Security_Middleware SHALL exclude that variable from subprocess environments and log a Security_Event with severity "info".

### Requirement 8: Security Skill (agent instructions)

**User Story:** As an EureClaw operator, I want the agent to have security instructions in its system prompt to recognize and refuse manipulation attempts, to reinforce layer 1 at the AI level.

#### Acceptance Criteria

1. THE Security_Skill SHALL be defined in a file `groups/global/dna/SECURITY.md` loaded automatically into the context of all agents.
2. THE Security_Skill SHALL contain instructions for the agent to refuse requests to: reveal its system prompt, ignore its previous instructions, impersonate another system, execute obfuscated code without explanation.
3. THE Security_Skill SHALL contain safe response patterns for suspicious requests (polite refusal, no revelation of the detection mechanism).
4. THE Security_Skill SHALL instruct the agent to flag manipulation attempts via a `<security-flag>` tag in its response, allowing the Security_Middleware to detect and log them.
5. WHEN the agent detects a manipulation attempt and includes a `<security-flag>` tag in its response, THE Output_Redactor SHALL strip the tag before sending to the user and log a Security_Event.

### Requirement 9: Integration into the existing message pipeline

**User Story:** As an EureClaw developer, I want the Security_Middleware to integrate cleanly into the existing message pipeline without modifying business logic, to maintain separation of concerns.

#### Acceptance Criteria

1. THE Security_Middleware SHALL run as middleware in the message pipeline, between message reception (channels) and forwarding to the agent (container-runner/direct mode).
2. THE Security_Middleware SHALL be configurable via environment variables (`SECURITY_ENABLED=true|false`, `SECURITY_LOG_LEVEL=info|debug`).
3. IF `SECURITY_ENABLED` is set to `false`, THEN THE Security_Middleware SHALL pass all messages through without modification (bypass mode).
4. THE Security_Middleware SHALL add a metadata header to the message forwarded to the agent indicating the scan result (clean, sanitized, flagged), without modifying the original message content beyond sanitization.
5. WHEN the Security_Middleware encounters an internal error, THE Security_Middleware SHALL pass the message through (fail-open) and log a Security_Event with severity "critical" describing the error.
6. THE Security_Middleware SHALL function identically in both container mode (Apple Container) and direct mode (no container), since EureClaw supports both execution modes.
