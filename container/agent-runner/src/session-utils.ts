/**
 * Session utilities for the EureClaw Agent Runner.
 * Handles transcript parsing, conversation archiving, and filename generation.
 */

import fs from 'fs';
import path from 'path';
import { createOpencodeClient as _createOpencodeClient } from '@opencode-ai/sdk';
import type { ParsedMessage, SessionsIndex } from './types.js';
import { log, debugLog } from './io.js';

// ─── OpenCode Client ─────────────────────────────────────────────────────────

/**
 * Create and configure an OpenCode SDK client.
 * Connects to a running OpenCode server (started separately).
 */
export async function createOpencodeClient(
  sdkEnv: Record<string, string | undefined>
): Promise<any> {
  try {
    const baseURL = sdkEnv.OPENCODE_BASE_URL || 'http://localhost:4096';

    log(`Initializing OpenCode client...`);
    debugLog(`Configuration: baseURL=${baseURL}`);

    const client = _createOpencodeClient({
      baseUrl: baseURL,
      timeout: 120_000,
      maxRetries: 2,
    });

    log(`✓ OpenCode client initialized successfully`);
    debugLog(`Client ready to connect to OpenCode server at ${baseURL}`);

    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    log(`ERROR: Failed to create OpenCode client: ${errorMessage}`);
    if (errorStack) {
      log(`Stack trace: ${errorStack}`);
    }

    throw new Error(`OpenCode client initialization failed: ${errorMessage}`);
  }
}

// ─── Session Summary ─────────────────────────────────────────────────────────

export function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(`Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

// ─── Conversation Archiving ──────────────────────────────────────────────────

/**
 * Archive a session's conversation to the conversations/ directory.
 * Fetches messages via client.session.messages() and saves as markdown.
 */
export async function archiveSessionConversation(
  client: any,
  sessionId: string,
  workspaceDir: string
): Promise<void> {
  try {
    log(`Archiving conversation for session ${sessionId}...`);
    debugLog(`Archive context: sessionId=${sessionId}, workspaceDir=${workspaceDir}`);

    const response = await client.session.messages({
      path: { id: sessionId }
    });

    if (!response.data || response.data.length === 0) {
      log('No messages to archive');
      return;
    }

    debugLog(`Fetched ${response.data.length} messages from session ${sessionId}`);

    const messages: ParsedMessage[] = [];

    for (const item of response.data) {
      const message = item.info;
      const parts = item.parts;

      if (message.role === 'user' || message.role === 'assistant') {
        const textParts = parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('');

        if (textParts) {
          messages.push({ role: message.role, content: textParts });
        }
      }
    }

    if (messages.length === 0) {
      log('No text messages to archive');
      return;
    }

    debugLog(`Parsed ${messages.length} text messages for archiving`);

    const firstUserMessage = response.data.find((item: any) => item.info.role === 'user');
    const summary = firstUserMessage?.info.summary?.title || null;

    const name = summary ? sanitizeFilename(summary) : generateFallbackName();
    const conversationsDir = path.join(workspaceDir, 'conversations');
    fs.mkdirSync(conversationsDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${name}.md`;
    const filePath = path.join(conversationsDir, filename);

    const markdown = formatTranscriptMarkdown(messages, summary);
    fs.writeFileSync(filePath, markdown);

    log(`✓ Archived conversation to ${filename} (${messages.length} messages)`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`ERROR: Failed to archive conversation for session ${sessionId}: ${errorMessage}`);
    // Non-critical — don't throw
  }
}

// ─── Transcript Parsing ──────────────────────────────────────────────────────

export function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

export function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : 'Andy';
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + '...'
      : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Filename Utilities ──────────────────────────────────────────────────────

export function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}
