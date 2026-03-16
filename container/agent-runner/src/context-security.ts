/**
 * Lightweight context file scanner for the agent-runner.
 * Strips prompt injections and invisible Unicode from context files
 * before they are loaded into the agent's system prompt.
 *
 * This is a standalone copy of the scanning logic from src/security/
 * because the agent-runner has its own tsconfig and can't import from
 * the host's src/ directory.
 */

// Invisible Unicode characters to strip
const INVISIBLE_UNICODE = /[\u200B\u200C\u200D\u2060\u2063\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Instruction override patterns (case-insensitive)
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+prior\s+instructions/i,
  /disregard\s+all\s+prior/i,
  /disregard\s+your\s+instructions/i,
  /forget\s+your\s+instructions/i,
  /override\s+your\s+instructions/i,
  /ignore\s+all\s+previous\s+prompts/i,
];

// HTML comments with suspicious keywords
const HTML_COMMENT_SUSPICIOUS = /<!--[\s\S]*?\b(ignore|override|system|prompt|instructions|execute|admin|secret)\b[\s\S]*?-->/gi;

// Credential exfiltration patterns
const EXFILTRATION = /\b(curl|wget|fetch|nc)\b.*\b(env|token|key|secret|password|credential)\b/gi;

// Secret file references
const SECRET_ACCESS = /\b(\.env|credentials|\.netrc|id_rsa|private_key|aws_credentials)\b/gi;

function log(message: string): void {
  console.error(`[${new Date().toISOString()}] [context-security] ${message}`);
}

/**
 * Scan and sanitize a context file before loading into agent context.
 * Returns the sanitized content. Logs any detections.
 */
export function sanitizeContextFile(content: string, filename: string): string {
  let sanitized = content;
  let modified = false;

  // 1. Strip invisible Unicode
  if (INVISIBLE_UNICODE.test(sanitized)) {
    sanitized = sanitized.replace(INVISIBLE_UNICODE, '');
    modified = true;
    log(`Stripped invisible Unicode from ${filename}`);
  }

  // 2. Strip injection patterns (remove entire lines containing them)
  const normalized = sanitized.replace(INVISIBLE_UNICODE, '').replace(/\s+/g, ' ').toLowerCase();
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      const lines = sanitized.split('\n');
      sanitized = lines.filter(line => {
        const norm = line.replace(INVISIBLE_UNICODE, '').replace(/\s+/g, ' ').toLowerCase();
        return !pattern.test(norm);
      }).join('\n');
      modified = true;
      log(`Stripped injection pattern from ${filename}`);
    }
  }

  // 3. Strip suspicious HTML comments
  if (HTML_COMMENT_SUSPICIOUS.test(sanitized)) {
    HTML_COMMENT_SUSPICIOUS.lastIndex = 0;
    sanitized = sanitized.replace(HTML_COMMENT_SUSPICIOUS, '');
    modified = true;
    log(`Stripped suspicious HTML comments from ${filename}`);
  }

  // 4. Strip credential exfiltration lines
  if (EXFILTRATION.test(sanitized)) {
    EXFILTRATION.lastIndex = 0;
    const lines = sanitized.split('\n');
    sanitized = lines.filter(line => {
      EXFILTRATION.lastIndex = 0;
      return !EXFILTRATION.test(line);
    }).join('\n');
    modified = true;
    log(`Stripped exfiltration commands from ${filename}`);
  }

  // 5. Strip secret file reference lines
  if (SECRET_ACCESS.test(sanitized)) {
    SECRET_ACCESS.lastIndex = 0;
    const lines = sanitized.split('\n');
    sanitized = lines.filter(line => {
      SECRET_ACCESS.lastIndex = 0;
      return !SECRET_ACCESS.test(line);
    }).join('\n');
    modified = true;
    log(`Stripped secret access references from ${filename}`);
  }

  if (modified) {
    log(`Context file ${filename} was sanitized`);
  }

  return sanitized;
}
