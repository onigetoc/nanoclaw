/**
 * Lightweight command guard for the agent-runner.
 * Detects dangerous system commands before execution.
 * Fail-closed: if guard throws, command is blocked.
 *
 * This is a standalone copy of the command guard logic from src/security/
 * because the agent-runner has its own tsconfig and can't import from
 * the host's src/ directory.
 */

interface CommandCheckResult {
  safe: boolean;
  pattern?: string;
  description?: string;
}

interface PatternEntry {
  category: string;
  pattern: RegExp;
  description: string;
}

const DANGEROUS_COMMAND_PATTERNS: PatternEntry[] = [
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

function log(message: string): void {
  console.error(`[${new Date().toISOString()}] [command-security] ${message}`);
}

/**
 * Check if a command string matches any dangerous pattern.
 * Fail-closed: if an error occurs, the command is blocked.
 */
export function checkCommand(command: string): CommandCheckResult {
  try {
    for (const entry of DANGEROUS_COMMAND_PATTERNS) {
      if (entry.pattern.test(command)) {
        log(`Dangerous command detected [${entry.category}]: ${command.slice(0, 200)}`);
        return {
          safe: false,
          pattern: entry.category,
          description: entry.description,
        };
      }
    }
    return { safe: true };
  } catch (err) {
    log(`Command guard error (fail-closed): ${err instanceof Error ? err.message : String(err)}`);
    return {
      safe: false,
      pattern: 'internal_error',
      description: 'Command blocked due to guard internal error (fail-closed)',
    };
  }
}
