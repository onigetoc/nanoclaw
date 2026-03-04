/**
 * API Auth Routes — manage OpenCode provider API keys from the web UI.
 *
 * Endpoints:
 *   GET  /auth/providers  — list configured providers (no keys exposed)
 *   POST /auth/provider   — add/update a provider API key
 *   DELETE /auth/provider/:provider — remove a provider API key
 */
import { FastifyInstance } from 'fastify';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

/** Allowed provider names — strict whitelist to prevent injection */
const ALLOWED_PROVIDERS = [
  'anthropic',
  'google',
  'openai',
  'groq',
  'mistral',
  'cohere',
  'deepseek',
  'xai',
  'openrouter',
  'together',
  'fireworks',
  'perplexity',
  'cerebras',
  'sambanova',
] as const;

type Provider = (typeof ALLOWED_PROVIDERS)[number];

/** Provider display info for the frontend */
const PROVIDER_INFO: Record<Provider, { label: string; placeholder: string }> = {
  anthropic:   { label: 'Anthropic (Claude)',    placeholder: 'sk-ant-...' },
  google:      { label: 'Google (Gemini)',       placeholder: 'AIza...' },
  openai:      { label: 'OpenAI (GPT)',          placeholder: 'sk-...' },
  groq:        { label: 'Groq',                  placeholder: 'gsk_...' },
  mistral:     { label: 'Mistral',               placeholder: '' },
  cohere:      { label: 'Cohere',                placeholder: '' },
  deepseek:    { label: 'DeepSeek',              placeholder: 'sk-...' },
  xai:         { label: 'xAI (Grok)',            placeholder: 'xai-...' },
  openrouter:  { label: 'OpenRouter',            placeholder: 'sk-or-...' },
  together:    { label: 'Together AI',           placeholder: '' },
  fireworks:   { label: 'Fireworks AI',          placeholder: '' },
  perplexity:  { label: 'Perplexity',            placeholder: 'pplx-...' },
  cerebras:    { label: 'Cerebras',              placeholder: '' },
  sambanova:   { label: 'SambaNova',             placeholder: '' },
};

function isAllowedProvider(name: string): name is Provider {
  return ALLOWED_PROVIDERS.includes(name as Provider);
}

/** Read auth.json to see which providers have credentials (without exposing keys) */
function getConfiguredProviders(): { provider: string; label: string; configured: boolean }[] {
  const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
  let authData: Record<string, unknown> = {};

  try {
    if (fs.existsSync(authPath)) {
      authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    }
  } catch {
    // File doesn't exist or is invalid — that's fine
  }

  return ALLOWED_PROVIDERS.map((p) => ({
    provider: p,
    label: PROVIDER_INFO[p].label,
    placeholder: PROVIDER_INFO[p].placeholder,
    configured: !!authData[p],
  }));
}

export function registerAuthRoutes(fastify: FastifyInstance, authenticate: any): void {
  /** List providers and their configuration status */
  fastify.get('/auth/providers', { preHandler: authenticate }, async () => {
    return { providers: getConfiguredProviders() };
  });

  /** Add or update a provider API key */
  fastify.post('/auth/provider', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const provider = (body?.provider as string || '').toLowerCase().trim();
    const key = (body?.key as string || '').trim();

    if (!provider || !key) {
      reply.code(400).send({ error: 'provider and key are required' });
      return;
    }

    if (!isAllowedProvider(provider)) {
      reply.code(400).send({ error: `Invalid provider. Allowed: ${ALLOWED_PROVIDERS.join(', ')}` });
      return;
    }

    // Validate key format — must be alphanumeric with dashes/underscores/dots, 10-200 chars
    if (!/^[a-zA-Z0-9_\-\.]{10,200}$/.test(key)) {
      reply.code(400).send({ error: 'Invalid API key format' });
      return;
    }

    try {
      const { stdout, stderr } = await execFileAsync('opencode', ['auth', 'login', provider, '--key', key], {
        timeout: 15000,
        env: { ...process.env },
      });

      logger.info({ provider, stdout: stdout?.trim(), stderr: stderr?.trim() }, 'API key configured via web UI');

      return { success: true, provider, message: `${PROVIDER_INFO[provider].label} key configured` };
    } catch (err: any) {
      const errMsg = err.stderr?.trim() || err.message || 'Unknown error';
      logger.error({ provider, err: errMsg }, 'Failed to configure API key');
      reply.code(500).send({ error: `Failed to configure key: ${errMsg}` });
    }
  });

  /** Remove a provider API key */
  fastify.delete('/auth/provider/:provider', { preHandler: authenticate }, async (request, reply) => {
    const params = request.params as Record<string, string>;
    const provider = (params.provider || '').toLowerCase().trim();

    if (!isAllowedProvider(provider)) {
      reply.code(400).send({ error: `Invalid provider` });
      return;
    }

    // Remove from auth.json directly
    const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
    try {
      if (fs.existsSync(authPath)) {
        const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
        if (authData[provider]) {
          delete authData[provider];
          fs.writeFileSync(authPath, JSON.stringify(authData, null, 2));
          logger.info({ provider }, 'API key removed via web UI');
          return { success: true, provider, message: `${PROVIDER_INFO[provider].label} key removed` };
        }
      }
      reply.code(404).send({ error: 'Provider not configured' });
    } catch (err: any) {
      logger.error({ provider, err: err.message }, 'Failed to remove API key');
      reply.code(500).send({ error: 'Failed to remove key' });
    }
  });
}
