/**
 * Security Middleware — Shared Regex Patterns
 * All detection patterns for injection, credentials, and dangerous commands.
 * Patterns are derived from the requirements tables.
 */

// ─── Invisible Unicode characters to strip ───────────────────────────────────

export const INVISIBLE_UNICODE_REGEX = /[\u200B\u200C\u200D\u2060\u2063\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// ─── Blocking patterns (message is blocked entirely) ─────────────────────────

export interface PatternEntry {
  category: string;
  pattern: RegExp;
  description: string;
}

/** Normalize text for matching: strip invisible chars, collapse whitespace, lowercase */
export function normalizeForMatching(text: string): string {
  return text
    .replace(INVISIBLE_UNICODE_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const BLOCKING_PATTERNS: PatternEntry[] = [
  // Instruction override
  { category: 'instruction_override', pattern: /ignore\s+previous\s+instructions/i, description: 'Instruction override: ignore previous instructions' },
  { category: 'instruction_override', pattern: /ignore\s+prior\s+instructions/i, description: 'Instruction override: ignore prior instructions' },
  { category: 'instruction_override', pattern: /disregard\s+all\s+prior/i, description: 'Instruction override: disregard all prior' },
  { category: 'instruction_override', pattern: /disregard\s+your\s+instructions/i, description: 'Instruction override: disregard your instructions' },
  { category: 'instruction_override', pattern: /forget\s+your\s+instructions/i, description: 'Instruction override: forget your instructions' },
  { category: 'instruction_override', pattern: /override\s+your\s+instructions/i, description: 'Instruction override: override your instructions' },
  { category: 'instruction_override', pattern: /ignore\s+all\s+previous\s+prompts/i, description: 'Instruction override: ignore all previous prompts' },

  // Identity hijack
  { category: 'identity_hijack', pattern: /you\s+are\s+now\b/i, description: 'Identity hijack: you are now' },
  { category: 'identity_hijack', pattern: /\bact\s+as\b/i, description: 'Identity hijack: act as' },
  { category: 'identity_hijack', pattern: /pretend\s+you\s+are/i, description: 'Identity hijack: pretend you are' },
  { category: 'identity_hijack', pattern: /from\s+now\s+on\s+you\s+are/i, description: 'Identity hijack: from now on you are' },
  { category: 'identity_hijack', pattern: /you\s+are\s+no\s+longer/i, description: 'Identity hijack: you are no longer' },
  { category: 'identity_hijack', pattern: /your\s+new\s+role\s+is/i, description: 'Identity hijack: your new role is' },
  { category: 'identity_hijack', pattern: /system\s+prompt\s+override/i, description: 'Identity hijack: system prompt override' },
  { category: 'identity_hijack', pattern: /new\s+system\s+prompt/i, description: 'Identity hijack: new system prompt' },

  // Prompt extraction
  { category: 'prompt_extraction', pattern: /repeat\s+your\s+instructions/i, description: 'Prompt extraction: repeat your instructions' },
  { category: 'prompt_extraction', pattern: /show\s+me\s+your\s+prompt/i, description: 'Prompt extraction: show me your prompt' },
  { category: 'prompt_extraction', pattern: /what\s+are\s+your\s+instructions/i, description: 'Prompt extraction: what are your instructions' },
  { category: 'prompt_extraction', pattern: /print\s+your\s+system\s+prompt/i, description: 'Prompt extraction: print your system prompt' },
  { category: 'prompt_extraction', pattern: /output\s+your\s+rules/i, description: 'Prompt extraction: output your rules' },
  { category: 'prompt_extraction', pattern: /reveal\s+your\s+guidelines/i, description: 'Prompt extraction: reveal your guidelines' },

  // Jailbreak phrases
  { category: 'jailbreak', pattern: /\bdan\s+mode\b/i, description: 'Jailbreak: DAN mode' },
  { category: 'jailbreak', pattern: /developer\s+mode\s+enabled/i, description: 'Jailbreak: developer mode enabled' },
  { category: 'jailbreak', pattern: /ignore\s+safety/i, description: 'Jailbreak: ignore safety' },
  { category: 'jailbreak', pattern: /\bno\s+restrictions\b/i, description: 'Jailbreak: no restrictions' },
  { category: 'jailbreak', pattern: /bypass\s+filters/i, description: 'Jailbreak: bypass filters' },
  { category: 'jailbreak', pattern: /unrestricted\s+mode/i, description: 'Jailbreak: unrestricted mode' },
  { category: 'jailbreak', pattern: /\bjailbreak\b/i, description: 'Jailbreak: jailbreak keyword' },

  // Secret reading attempts
  { category: 'secret_reading', pattern: /\bread\s+\.env\b/i, description: 'Secret reading: read .env' },
  { category: 'secret_reading', pattern: /\bcat\s+\.env\b/i, description: 'Secret reading: cat .env' },
  { category: 'secret_reading', pattern: /show\s+credentials/i, description: 'Secret reading: show credentials' },
  { category: 'secret_reading', pattern: /print\s+\.netrc/i, description: 'Secret reading: print .netrc' },
  { category: 'secret_reading', pattern: /read\s+\/etc\/passwd/i, description: 'Secret reading: read /etc/passwd' },
  { category: 'secret_reading', pattern: /show\s+secrets/i, description: 'Secret reading: show secrets' },

  // Credential exfiltration
  { category: 'credential_exfiltration', pattern: /\b(curl|wget|fetch)\b.*\b(env|token|key|secret|password|credential)\b/i, description: 'Credential exfiltration: HTTP tool with secret reference' },
  { category: 'credential_exfiltration', pattern: /\b(env|token|key|secret|password|credential)\b.*\b(curl|wget|fetch)\b/i, description: 'Credential exfiltration: secret reference with HTTP tool' },
  { category: 'credential_exfiltration', pattern: /\b(curl|wget)\b.*\|\s*\bsh\b/i, description: 'Credential exfiltration: pipe to shell' },
];

// ─── Stripping patterns (suspicious elements removed, message passes) ────────

/** HTML comments containing suspicious keywords */
export const HTML_COMMENT_SUSPICIOUS = /<!--[\s\S]*?\b(ignore|override|system|prompt|instructions|execute|admin|secret)\b[\s\S]*?-->/gi;

/** XML/HTML context spoofing tags */
export const XML_SPOOFING_TAGS = /<\/?(system|assistant|instructions|admin|root|sudo)\b[^>]*>/gi;

/** Suspicious base64: 20+ chars of base64 alphabet */
export const SUSPICIOUS_BASE64 = /(?:[A-Za-z0-9+/]{20,}={0,2})/g;

/** Keywords that make decoded base64 suspicious */
export const BASE64_SUSPICIOUS_KEYWORDS = /\b(ignore|system|execute|prompt|override|instructions)\b/i;

// ─── Context file specific patterns ──────────────────────────────────────────

export const CONTEXT_SECRET_ACCESS = /\b(\.env|credentials|\.netrc|id_rsa|private_key|aws_credentials)\b/gi;

export const CONTEXT_EXFILTRATION = /\b(curl|wget|fetch|nc)\b.*\b(env|token|key|secret|password|credential)\b/gi;

/** Hex-encoded strings (40+ hex chars) */
export const SUSPICIOUS_HEX = /(?:[0-9a-fA-F]{40,})/g;

// ─── Credential patterns (for output redaction) ─────────────────────────────

export const CREDENTIAL_PATTERNS: { pattern: RegExp; replacement: string; description: string }[] = [
  { pattern: /ghp_[A-Za-z0-9_]{36,}/g, replacement: '[REDACTED]', description: 'GitHub token' },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: '[REDACTED]', description: 'API key (sk-)' },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]', description: 'Bearer token' },
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[REDACTED]', description: 'AWS access key' },
  { pattern: /-----BEGIN\s+[\w\s]*PRIVATE KEY-----[\s\S]*?-----END\s+[\w\s]*PRIVATE KEY-----/g, replacement: '[REDACTED: private key]', description: 'Private key block' },
  { pattern: /(token|key|API_KEY|password|secret)\s*[=:]\s*\S+/gi, replacement: '$1=[REDACTED]', description: 'Key-value secret' },
];

// PII patterns (applied only for non-main groups)
export const PII_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
export const PII_PHONE = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
export const PII_INTERNAL_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g;

// Security flag tag in agent output
export const SECURITY_FLAG_TAG = /<security-flag>[\s\S]*?<\/security-flag>/g;

// ─── Dangerous command patterns ──────────────────────────────────────────────

export const DANGEROUS_COMMAND_PATTERNS: PatternEntry[] = [
  { category: 'recursive_delete', pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*|--recursive)\b/i, description: 'Recursive delete (rm -r)' },
  { category: 'root_delete', pattern: /\brm\b.*\s+\//i, description: 'Delete in root path' },
  { category: 'chmod_world', pattern: /\bchmod\s+777\b/i, description: 'World-writable permissions' },
  { category: 'format_disk', pattern: /\bmkfs\b/i, description: 'Format filesystem' },
  { category: 'disk_copy', pattern: /\bdd\s+if=/i, description: 'Disk copy (dd)' },
  { category: 'sql_drop', pattern: /\bDROP\s+(TABLE|DATABASE)\b/i, description: 'SQL DROP' },
  { category: 'sql_delete', pattern: /\bDELETE\s+FROM\b(?!.*\bWHERE\b)/i, description: 'SQL DELETE without WHERE' },
  { category: 'sql_truncate', pattern: /\bTRUNCATE\s+TABLE\b/i, description: 'SQL TRUNCATE' },
  { category: 'overwrite_etc', pattern: />\s*\/etc\//i, description: 'Overwrite system config' },
  { category: 'systemctl_stop', pattern: /\bsystemctl\s+(stop|disable|mask)\b/i, description: 'Stop/disable system service' },
  { category: 'kill_all', pattern: /\bkill\s+-9\s+-1\b/i, description: 'Kill all processes' },
  { category: 'pipe_to_shell', pattern: /\b(curl|wget)\b.*\|\s*(sh|bash)\b/i, description: 'Pipe remote content to shell' },
  { category: 'shell_exec', pattern: /\b(bash|sh)\s+-c\b/i, description: 'Shell execution via flags' },
  { category: 'find_delete', pattern: /\bfind\b.*(-exec\s+rm|-delete)\b/i, description: 'Find with destructive action' },
  { category: 'fork_bomb', pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/i, description: 'Fork bomb' },
  { category: 'win_format', pattern: /\b(format|diskpart)\b/i, description: 'Windows disk formatting' },
  { category: 'win_recursive_del', pattern: /\b(del\s+\/s\s+\/q|rmdir\s+\/s\s+\/q)\b/i, description: 'Windows recursive delete' },
];

// ─── Environment variable filtering ──────────────────────────────────────────

export const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USER', 'LANG', 'TERM',
  'NODE_ENV', 'LOG_LEVEL', 'OPENCODE_BASE_URL', 'TZ',
]);

export const ENV_SECRET_PATTERNS = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;
