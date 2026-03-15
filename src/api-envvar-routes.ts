/**
 * API Environment Variable Routes — set system env vars from the web UI.
 *
 * This implements "Method 1" (most secure): variables are set at the OS level
 * using `setx` (Windows) or shell profile export (Mac/Linux).
 * The LLM never sees the actual key value — only the variable name.
 *
 * Endpoints:
 *   POST /envvar/set    — set a system environment variable
 *   POST /envvar/remove — remove a system environment variable
 *   GET  /envvar/list   — list known variable names (from a local JSON file)
 */
import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

/** Where we persist the list of variable names (NOT values) */
function getRegistryPath(): string {
  return path.join(os.homedir(), '.eureclaw', 'env-vars.json');
}

/** Read the registry of known variable names */
function readRegistry(): { name: string; label: string; createdAt: string }[] {
  const p = getRegistryPath();
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {
    // corrupted file, start fresh
  }
  return [];
}

/** Write the registry */
function writeRegistry(entries: { name: string; label: string; createdAt: string }[]): void {
  const p = getRegistryPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(entries, null, 2), 'utf-8');
}

/** Validate env var name: A-Z, 0-9, underscore only, must start with letter */
function isValidVarName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]{1,100}$/.test(name);
}

/** Sanitize a user input into a valid env var name */
function sanitizeVarName(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-\.]+/g, '_')  // spaces, dashes, dots → underscore
    .replace(/[^A-Z0-9_]/g, '')  // remove anything else
    .replace(/^[0-9_]+/, '')     // must start with letter
    .replace(/_{2,}/g, '_');     // collapse multiple underscores
}

export function registerEnvVarRoutes(fastify: FastifyInstance, authenticate: any): void {

  /** List known env variable names (no values exposed) */
  fastify.get('/envvar/list', { preHandler: authenticate }, async () => {
    return { variables: readRegistry() };
  });

  /** Set a system environment variable */
  fastify.post('/envvar/set', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const rawName = ((body?.name as string) || '').trim();
    const value = ((body?.value as string) || '').trim();
    const label = ((body?.label as string) || rawName).trim();

    if (!rawName || !value) {
      reply.code(400).send({ error: 'Variable name and value are required' });
      return;
    }

    // Sanitize and validate
    const name = sanitizeVarName(rawName);
    if (!isValidVarName(name)) {
      reply.code(400).send({
        error: 'Invalid variable name. Must be uppercase letters, numbers, and underscores. Must start with a letter.',
      });
      return;
    }

    // Basic value validation — no newlines, reasonable length
    if (value.length > 500 || /[\n\r]/.test(value)) {
      reply.code(400).send({ error: 'Invalid value format' });
      return;
    }

    try {
      const platform = os.platform();

      if (platform === 'win32') {
        // Windows: setx persists to registry (user-level)
        execSync(`setx ${name} "${value}"`, { encoding: 'utf-8', stdio: 'pipe' });
      } else {
        // Mac/Linux: append to shell profile
        const shell = process.env.SHELL || '/bin/bash';
        const profileFile = shell.includes('zsh')
          ? path.join(os.homedir(), '.zshrc')
          : path.join(os.homedir(), '.bashrc');

        const exportLine = `export ${name}="${value}"`;

        // Read existing profile, check if variable already exists
        let content = '';
        if (fs.existsSync(profileFile)) {
          content = fs.readFileSync(profileFile, 'utf-8');
        }

        // Replace existing or append
        const regex = new RegExp(`^export ${name}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, exportLine);
        } else {
          content = content.trimEnd() + '\n' + exportLine + '\n';
        }

        fs.writeFileSync(profileFile, content, 'utf-8');
      }

      // Also set in current process so EureClaw can use it immediately after restart
      process.env[name] = value;

      // Update registry (name + label only, never the value)
      const registry = readRegistry();
      const existing = registry.findIndex((e) => e.name === name);
      const entry = { name, label: label || name, createdAt: new Date().toISOString() };
      if (existing >= 0) {
        registry[existing] = entry;
      } else {
        registry.push(entry);
      }
      writeRegistry(registry);

      logger.info({ name, platform }, 'Environment variable set via web UI');

      return {
        success: true,
        name,
        message: `Variable ${name} set successfully. Restart EureClaw to apply.`,
      };
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error';
      logger.error({ name, err: errMsg }, 'Failed to set environment variable');
      reply.code(500).send({ error: `Failed to set variable: ${errMsg}` });
    }
  });

  /** Remove a system environment variable */
  fastify.post('/envvar/remove', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const name = ((body?.name as string) || '').trim().toUpperCase();

    if (!isValidVarName(name)) {
      reply.code(400).send({ error: 'Invalid variable name' });
      return;
    }

    try {
      const platform = os.platform();

      if (platform === 'win32') {
        // Windows: setx with empty string removes the variable
        try {
          execSync(`setx ${name} ""`, { encoding: 'utf-8', stdio: 'pipe' });
        } catch {
          // Variable might not exist, that's fine
        }
      } else {
        // Mac/Linux: remove from shell profile
        const shell = process.env.SHELL || '/bin/bash';
        const profileFile = shell.includes('zsh')
          ? path.join(os.homedir(), '.zshrc')
          : path.join(os.homedir(), '.bashrc');

        if (fs.existsSync(profileFile)) {
          let content = fs.readFileSync(profileFile, 'utf-8');
          const regex = new RegExp(`^export ${name}=.*\n?`, 'm');
          content = content.replace(regex, '');
          fs.writeFileSync(profileFile, content, 'utf-8');
        }
      }

      // Remove from current process
      delete process.env[name];

      // Remove from registry
      const registry = readRegistry().filter((e) => e.name !== name);
      writeRegistry(registry);

      logger.info({ name }, 'Environment variable removed via web UI');

      return { success: true, name, message: `Variable ${name} removed` };
    } catch (err: any) {
      logger.error({ name, err: err.message }, 'Failed to remove environment variable');
      reply.code(500).send({ error: 'Failed to remove variable' });
    }
  });
}
