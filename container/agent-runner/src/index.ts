/**
 * EureClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF, like before)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per agent teams result).
 *   Final marker after loop ends signals completion.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createOpencodeClient as _createOpencodeClient } from '@opencode-ai/sdk';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  forceNewSession?: boolean; // Skip loading conversation history from SQLite
  secrets?: Record<string, string>;
  model?: string; // Override model from web UI
  agent?: string; // Override agent (mode) from web UI
  // Direct mode (Windows/Linux): real paths instead of container mount points
  directMode?: {
    ipcDir: string;       // replaces /workspace/ipc
    groupDir: string;     // replaces /workspace/group
    globalDir?: string;   // replaces /workspace/global
    projectDir?: string;  // replaces /workspace/project
  };
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
  metadata?: {
    modelID?: string;
    providerID?: string;
    mode?: string;
    agent?: string;
    tokens?: { total: number; input: number; output: number; reasoning: number; cacheRead?: number; cacheWrite?: number };
    cost?: number;
  };
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

// These get overridden in main() when running in direct mode
let IPC_INPUT_DIR = '/workspace/ipc/input';
let IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

/**
 * Create and configure an OpenCode SDK client.
 * 
 * OpenCode SDK connects to a running OpenCode server (started separately).
 * The server reads AI provider credentials from system config (~/.opencode/config.yaml).
 * 
 * @param sdkEnv - Environment variables (includes OPENCODE_BASE_URL if custom)
 * @returns Configured Opencode client instance
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
async function createOpencodeClient(
  sdkEnv: Record<string, string | undefined>
): Promise<any> {
  try {
    // Read base URL from environment (optional, defaults to http://localhost:4096)
    const baseURL = sdkEnv.OPENCODE_BASE_URL || 'http://localhost:4096';
    
    // Requirement 12.1: Log client initialization with configuration
    log(`Initializing OpenCode client...`);
    debugLog(`Configuration: baseURL=${baseURL}`);
    
    // Import Opencode SDK (static import at top of file)
    // Create OpenCode client that connects to running server
    // The server must be started separately (e.g., via `opencode` CLI)
    // 
    // Note: Model configuration is passed to the OpenCode server via environment variables,
    // not via SDK client options. The SDK client only needs to know how to connect to the server.
    const client = _createOpencodeClient({
      baseUrl: baseURL
    });
    
    log(`✓ OpenCode client initialized successfully`);
    debugLog(`Client ready to connect to OpenCode server at ${baseURL}`);
    
    return client;
  } catch (error) {
    // Requirement 7.1, 7.2, 7.3, 7.4: Catch and log OpenCode SDK errors with full context
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    log(`ERROR: Failed to create OpenCode client: ${errorMessage}`);
    if (errorStack) {
      log(`Stack trace: ${errorStack}`);
    }
    
    // Re-throw to be handled by caller
    throw new Error(`OpenCode client initialization failed: ${errorMessage}`);
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---EURECLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---EURECLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [agent-runner] ${message}`);
}

function debugLog(message: string): void {
  if (process.env.LOG_LEVEL === 'debug') {
    log(`[DEBUG] ${message}`);
  }
}

function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
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

/**
 * Archive a session's conversation to the conversations/ directory.
 * 
 * OpenCode SDK Migration Note:
 * Unlike the previous SDK which had PreCompact hooks, OpenCode SDK doesn't support hooks.
 * This function manually archives conversations by fetching messages via client.session.messages().
 * 
 * Call this function periodically or when a session reaches a certain size to maintain
 * conversation history before potential compaction.
 * 
 * Requirements: 5.3 - Maintain conversation archiving functionality
 * 
 * @param client - OpenCode client instance
 * @param sessionId - Session ID to archive
 * @param groupDir - Group directory path for saving archives
 */
async function archiveSessionConversation(
  client: any,
  sessionId: string,
  groupDir: string
): Promise<void> {
  try {
    log(`Archiving conversation for session ${sessionId}...`);
    debugLog(`Archive context: sessionId=${sessionId}, groupDir=${groupDir}, timestamp=${new Date().toISOString()}`);
    
    // Fetch all messages from the session using OpenCode SDK
    // Requirement 7.1, 7.2, 7.3: Catch OpenCode SDK errors
    const response = await client.session.messages({
      path: { id: sessionId }
    });
    
    if (!response.data || response.data.length === 0) {
      log('No messages to archive');
      return;
    }
    
    debugLog(`Fetched ${response.data.length} messages from session ${sessionId}`);
    
    // Convert OpenCode messages to our ParsedMessage format
    const messages: ParsedMessage[] = [];
    
    for (const item of response.data) {
      const message = item.info;
      const parts = item.parts;
      
      if (message.role === 'user') {
        // Extract text from user message parts
        const textParts = parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('');
        
        if (textParts) {
          messages.push({ role: 'user', content: textParts });
        }
      } else if (message.role === 'assistant') {
        // Extract text from assistant message parts
        const textParts = parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('');
        
        if (textParts) {
          messages.push({ role: 'assistant', content: textParts });
        }
      }
    }
    
    if (messages.length === 0) {
      log('No text messages to archive');
      return;
    }
    
    debugLog(`Parsed ${messages.length} text messages for archiving`);
    
    // Try to get summary from the first user message
    const firstUserMessage = response.data.find((item: any) => item.info.role === 'user');
    const summary = firstUserMessage?.info.summary?.title || null;
    
    // Generate filename
    const name = summary ? sanitizeFilename(summary) : generateFallbackName();
    const conversationsDir = path.join(groupDir, 'conversations');
    fs.mkdirSync(conversationsDir, { recursive: true });
    
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${name}.md`;
    const filePath = path.join(conversationsDir, filename);
    
    // Format and save the archive
    const markdown = formatTranscriptMarkdown(messages, summary);
    fs.writeFileSync(filePath, markdown);
    
    log(`✓ Archived conversation to ${filename} (${messages.length} messages)`);
    debugLog(`Archive details: path=${filePath}, size=${markdown.length} bytes, summary=${summary || 'none'}`);
  } catch (err) {
    // Requirement 7.4, 7.5: Log errors with full context and continue gracefully
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    log(`ERROR: Failed to archive conversation for session ${sessionId}: ${errorMessage}`);
    if (errorStack) {
      log(`Stack trace: ${errorStack}`);
    }
    log(`Context: sessionId=${sessionId}, groupDir=${groupDir}, timestamp=${new Date().toISOString()}`);
    
    // Don't throw - archiving is non-critical, continue execution
  }
}

// Secrets that should never leak to subprocess environments
const SECRET_ENV_VARS = ['TELEGRAM_BOT_TOKEN'];

/**
 * Verify that secrets are not present in process.env.
 * OpenCode SDK spawns subprocesses that inherit process.env,
 * so secrets must only exist in the local sdkEnv variable.
 */
function verifySecretsNotInProcessEnv(): void {
  const leakedSecrets: string[] = [];
  
  for (const secretKey of SECRET_ENV_VARS) {
    if (process.env[secretKey]) {
      leakedSecrets.push(secretKey);
    }
  }
  
  if (leakedSecrets.length > 0) {
    const error = `SECURITY ERROR: Secrets found in process.env: ${leakedSecrets.join(', ')}. ` +
                  `Secrets must only be in sdkEnv to prevent leakage to subprocesses.`;
    log(error);
    throw new Error(error);
  }
  
  log('✓ Secret isolation verified: No secrets in process.env');
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Detect if a task is complex and should use the orchestrator agent.
 * Complex tasks benefit from multi-agent delegation and specialized subagents.
 * 
 * @param prompt - The user's prompt
 * @returns true if task is complex, false for simple tasks
 */
function detectComplexTask(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  // Language-agnostic explicit agent mention (e.g. @planner, @researcher, @task-executor).
  // If user mentions a specific agent (other than @build), route through orchestrator.
  const explicitAgentMention = prompt.match(/(^|\s)@([a-z0-9][a-z0-9_-]{1,63})\b/i)?.[2]?.toLowerCase();
  if (explicitAgentMention && explicitAgentMention !== 'build') {
    return true;
  }

  // Always treat explicit task-workflow signals as complex.
  if (
    lowerPrompt.includes('/tasks/') ||
    lowerPrompt.includes('\\tasks\\') ||
    lowerPrompt.includes('plan_created') ||
    /-\s*\[\s?[x ]\s?\]/i.test(prompt)
  ) {
    return true;
  }

  // Specific multi-step patterns that clearly need orchestrator
  const multiStepPatterns = [
    /recherche.*et.*résume/i,
    /search.*and.*summarize/i,
    /find.*and.*create/i,
    /analyse.*et.*compare/i,
    /cherche.*puis.*fait/i,
  ];

  if (multiStepPatterns.some(pattern => pattern.test(prompt))) {
    return true;
  }

  // Default to simple task (build agent) — orchestrator is opt-in via @orchestrator
  return false;
}


/**
 * Add deterministic path hints for common virtual paths used by users.
 * Example: /tasks/foo.md should resolve to {groupDir}/tasks/foo.md for the current group.
 */
function applyPathHints(prompt: string, groupDir: string): string {
  const mentionsTasksPath =
    prompt.includes('/tasks/') ||
    prompt.includes('\\tasks\\') ||
    /(^|\s)(\.?[\\/])?tasks[\\/]/i.test(prompt);

  if (!mentionsTasksPath) {
    return prompt;
  }

  const groupTasksPath = path.join(groupDir, 'tasks').replace(/\\/g, '/');
  const hint = [
    '',
    '[SYSTEM PATH HINT]',
    `If the user references /tasks/... it maps to ${groupTasksPath}/... for this group.`,
    'This refers to FILE TASKS (markdown files in group/tasks), not scheduled tasks in IPC/DB.',
    'When user asks about /tasks files, inspect the filesystem first (group/tasks) before using any scheduled-task tool.',
    'Do not search project root for these task files unless explicitly requested.',
  ].join('\n');

  return `${prompt}\n${hint}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
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
    }
  }

  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
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

/**
 * Check for _close sentinel.
 */
function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

interface IpcMessage {
  text: string;
  model?: string;
  agent?: string;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found (with optional model/agent overrides), or empty array.
 */
function drainIpcInput(): IpcMessage[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    const messages: IpcMessage[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message') {
          if (data.text) {
            messages.push({ text: data.text, model: data.model, agent: data.agent });
          } else if (data.model || data.agent) {
            // Empty text but has model/agent preferences — store as metadata-only message
            // The real text will arrive in a subsequent IPC file from the message-loop
            messages.push({ text: '', model: data.model, agent: data.agent });
          }
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the combined message with model/agent from the latest IPC file, or null if _close.
 */
function waitForIpcMessage(): Promise<IpcMessage | null> {
  return new Promise((resolve) => {
    // Accumulate model/agent from metadata-only messages across polls
    let pendingModel: string | undefined;
    let pendingAgent: string | undefined;
    
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        // Track model/agent from any message that has them
        for (const m of messages) {
          if (m.model) pendingModel = m.model;
          if (m.agent) pendingAgent = m.agent;
        }
        
        const texts = messages.filter(m => m.text).map(m => m.text);
        if (texts.length > 0) {
          resolve({
            text: texts.join('\n'),
            model: pendingModel,
            agent: pendingAgent,
          });
          return;
        }
        // Only metadata messages (empty text) — wait for real text
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

// Parse "provider/model" string into { providerID, modelID } for the SDK.
// Module-level so both runQuery() and main() can use it.
function parseModelOverride(modelStr?: string): { providerID: string; modelID: string } | undefined {
  if (!modelStr) return undefined;
  const slashIdx = modelStr.indexOf('/');
  if (slashIdx > 0) {
    return { providerID: modelStr.slice(0, slashIdx), modelID: modelStr.slice(slashIdx + 1) };
  }
  return undefined;
}

/**
 * Run a single query and stream results via writeOutput.
 * Uses OpenCode SDK's session.prompt() and event.subscribe() for streaming.
 * Pipes IPC messages into the session by calling prompt() again.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.5
 */
async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  mcpServerPath: string,
  containerInput: ContainerInput,
  sdkEnv: Record<string, string | undefined>,
  groupDir: string,
  ipcBaseDir: string,
  globalDir: string | undefined,
  resumeAt?: string,
  existingClient?: any,
  contextAlreadyInjected?: boolean
): Promise<{ newSessionId?: string; lastAssistantUuid?: string; closedDuringQuery: boolean; client: any; contextInjected: boolean; hadError?: boolean }> {
  const effectivePrompt = applyPathHints(prompt, groupDir);

  // Reuse existing OpenCode client or create a new one
  let client: any;
  
  if (existingClient) {
    log('Reusing existing OpenCode client');
    client = existingClient;
  } else {
    // Create OpenCode client (Requirements 4.1, 4.2, 4.3, 4.4)
    // MCP servers are registered dynamically via client.mcp.add() in main()
    client = await createOpencodeClient(sdkEnv);
  }
  
  // Session creation and resumption logic (Requirements 2.1, 2.2, 2.3, 2.4)
  let currentSessionId: string;
  
  try {
    if (!sessionId || !sessionId.startsWith('ses_')) {
      // No session ID or legacy (non-OpenCode) session ID — create a new session
      if (sessionId && !sessionId.startsWith('ses_')) {
        log(`⚠ Discarding legacy session ID: ${sessionId} (not an OpenCode ses_ ID)`);
      }
      log('Creating new OpenCode session...');
      
      const sessionResult = await client.session.create();
      // Handle both response styles: { data: { id } } (fields) or { id } (data)
      currentSessionId = sessionResult.data?.id ?? sessionResult.id;
      
      log(`✓ Created new session: ${currentSessionId}`);
    } else {
      // Valid OpenCode session ID — verify it exists before resuming
      currentSessionId = sessionId;
      log(`Verifying session exists: ${currentSessionId}`);
      try {
        const listResp = await client.session.list();
        const sessions = listResp.data ?? listResp;
        const exists = Array.isArray(sessions) && sessions.some((s: any) => (s.id || s.data?.id) === currentSessionId);
        if (!exists) {
          log(`⚠ Session ${currentSessionId} not found in OpenCode — creating fresh session`);
          const sessionResult = await client.session.create();
          currentSessionId = sessionResult.data?.id ?? sessionResult.id;
          log(`✓ Created replacement session: ${currentSessionId}`);
        } else {
          log(`✓ Session verified, resuming: ${currentSessionId}`);
        }
      } catch (verifyErr: any) {
        log(`⚠ Could not verify session (${verifyErr?.message}), proceeding anyway`);
      }
    }
  } catch (error) {
    // Requirement 7.4, 7.5: Log errors with full context and return error status
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    log(`ERROR: Failed to create/resume session: ${errorMessage}`);
    if (errorStack) {
      log(`Stack trace: ${errorStack}`);
    }
    log(`Context: sessionId=${sessionId || 'none'}, groupFolder=${containerInput.groupFolder}`);
    
    // Return error via container output protocol (Requirement 7.5)
    writeOutput({
      status: 'error',
      result: null,
      error: `Session management failed: ${errorMessage}`,
      newSessionId: sessionId
    });
    
    // Return gracefully instead of throwing — don't crash the process
    return { newSessionId: sessionId, lastAssistantUuid: undefined, closedDuringQuery: false, client, contextInjected: contextAlreadyInjected || false, hadError: true };
  }

  // Track the session ID for return (Requirements 2.3, 2.4)
  let newSessionId: string = currentSessionId;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;
  let closedDuringQuery = false;

  // Load global AGENTS.md as additional system context (shared across all groups)
  // Check both new structure (dna/) and legacy (root)
  const globalDnaDir = globalDir ? path.join(globalDir, 'dna') : '/workspace/global/dna';
  const globalAgentsMdPath = fs.existsSync(path.join(globalDnaDir, 'AGENTS.md'))
    ? path.join(globalDnaDir, 'AGENTS.md')
    : globalDir ? path.join(globalDir, 'AGENTS.md') : '/workspace/global/AGENTS.md';
  let globalAgentsMd: string | undefined;
  if (!containerInput.isMain && fs.existsSync(globalAgentsMdPath)) {
    globalAgentsMd = fs.readFileSync(globalAgentsMdPath, 'utf-8');
    log(`Loaded global AGENTS.md (${globalAgentsMd.length} chars)`);
  }

  // Load group-specific context files (AGENTS.md, GUIDELINES.md, IDENTITY.md, SOUL.md, TOOLS.md)
  // These files contain group-specific instructions, personality, and capabilities
  // Check both new structure (dna/) and legacy (root) for backward compatibility
  const dnaDir = path.join(groupDir, 'dna');
  const groupContextFiles = ['AGENTS.md', 'GUIDELINES.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md'];
  const groupContexts: string[] = [];
  
  for (const filename of groupContextFiles) {
    // Try dna/ first (new structure), then root (legacy)
    const dnaPath = path.join(dnaDir, filename);
    const legacyPath = path.join(groupDir, filename);
    const filePath = fs.existsSync(dnaPath) ? dnaPath : legacyPath;
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      groupContexts.push(`\n## ${filename}\n\n${content}`);
      log(`Loaded ${filename} from ${filePath.includes('/dna/') ? 'dna/' : 'root'} (${content.length} chars)`);
    } else {
      log(`${filename} not found - skipping`);
    }
  }
  
  const groupContext = groupContexts.length > 0 ? groupContexts.join('\n\n') : undefined;

  // Load MEMORY.md for long-term context (main group only)
  // Check both new structure (dna/) and legacy (root)
  let memoryContext: string | undefined;
  if (containerInput.isMain) {
    const dnaMemoryPath = path.join(dnaDir, 'MEMORY.md');
    const legacyMemoryPath = path.join(groupDir, 'MEMORY.md');
    const memoryPath = fs.existsSync(dnaMemoryPath) ? dnaMemoryPath : legacyMemoryPath;
    
    if (fs.existsSync(memoryPath)) {
      memoryContext = fs.readFileSync(memoryPath, 'utf-8');
      log(`Loaded MEMORY.md from ${memoryPath.includes('/dna/') ? 'dna/' : 'root'} (${memoryContext.length} chars)`);
    } else {
      log('MEMORY.md not found - will be created when needed');
    }
  }

  // Generate platform-aware paths first (needed for database access)
  const isDirectMode = !!containerInput.directMode;
  const platform = process.platform; // 'win32', 'linux', 'darwin'
  const dbPath = isDirectMode
    ? path.join(containerInput.directMode!.projectDir!, 'store', 'messages.db')
    : '/workspace/project/store/messages.db';

  // Load recent conversation history from SQLite (last message only)
  // Note: OpenCode sessions maintain full conversation memory automatically.
  // These messages serve as initial context for new sessions or after crashes.
  // Skip when forceNewSession is true (user used /new command)
  let conversationContext: string | undefined;
  if (containerInput.forceNewSession) {
    log('Skipping conversation history (forceNewSession=true)');
  } else {
  try {
    // Import better-sqlite3 dynamically to access the database
    const Database = (await import('better-sqlite3')).default;
    const dbInstance = new Database(dbPath, { readonly: true });
    
    const recentMessages = dbInstance.prepare(`
      SELECT sender_name, content, timestamp
      FROM messages
      WHERE chat_jid = ?
        AND is_bot_message = 0
        AND content NOT LIKE 'Andy:%'
      ORDER BY timestamp DESC
      LIMIT 1
    `).all(containerInput.chatJid) as Array<{
      sender_name: string;
      content: string;
      timestamp: string;
    }>;
    
    dbInstance.close();
    
    if (recentMessages.length > 0) {
      // Reverse to get chronological order (oldest first)
      recentMessages.reverse();
      
      const formattedMessages = recentMessages.map(msg => {
        const date = new Date(msg.timestamp);
        const timeStr = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        return `[${timeStr}] ${msg.sender_name}: ${msg.content}`;
      }).join('\n');
      
      conversationContext = `## Recent Conversation History\n\n${formattedMessages}`;
      log(`Loaded ${recentMessages.length} recent messages from SQLite`);
    }
  } catch (err) {
    log(`Failed to load conversation history: ${err instanceof Error ? err.message : String(err)}`);
    // Non-critical - continue without conversation history
  }
  } // end forceNewSession else

  // Generate platform-aware environment context for the agent.
  // This replaces hardcoded /workspace/ paths in AGENTS.md files,
  // making EureClaw work on Windows, Linux, and macOS without templates.
  // Requirement 9.3: Generate platform-specific environment context
  const shell = platform === 'win32' ? 'PowerShell/cmd' : 'bash';
  const groupsBasePath = isDirectMode
    ? path.join(containerInput.directMode!.projectDir!, 'groups')
    : '/workspace/project/groups';
  const globalMemoryPath = globalDir
    ? path.join(globalDir, 'AGENTS.md')
    : '/workspace/global/AGENTS.md';

  const envContext = [
    `\n## Runtime Environment`,
    `- Platform: ${platform} (${isDirectMode ? 'direct mode' : 'container mode'})`,
    `- Shell: ${shell}`,
    `- Current group folder: ${containerInput.groupFolder}`,
    `- Current group path: groups/${containerInput.groupFolder}/`,
    `- Is main group: ${containerInput.isMain ? 'yes' : 'no'}`,
    `- Working directory: ${groupDir}`,
    `- SQLite database: ${dbPath}`,
    `- Groups base directory: ${groupsBasePath}`,
    `- Global memory: ${globalMemoryPath}`,
    `- IPC directory: ${ipcBaseDir}`,
    ``,
    `Use these paths for file operations and database queries.`,
    `IMPORTANT: When delegating to subagents (Task tool), ALWAYS include the current group folder in the prompt.`,
    `Example: Task(agent="task-planner", prompt="[GROUP: ${containerInput.groupFolder}] Create a plan to ...")`,
    `This ensures subagents write files to the correct group workspace (groups/${containerInput.groupFolder}/).`,
    ``,
    `For group management, prefer MCP tools (mcp__eureclaw__register_group, etc.).`,
    `IMPORTANT: mcp__eureclaw__list_tasks shows SCHEDULED tasks (alarms/cron), not markdown task files under group/tasks.`,
    `If the user mentions /tasks/... path or a .md task file, treat it as filesystem task file lookup in group/tasks.`,
  ].join('\n');

  // Determine which agent to use.
  // Priority order:
  // 1) Explicit user override in prompt (@orchestrator / @build)
  // 2) Explicit mention of any known subagent (@researcher, @email, etc.)
  // 2) Environment default (EURECLAW_DEFAULT_AGENT=orchestrator|build)
  // 3) Heuristic complexity detection
  const promptLower = effectivePrompt.toLowerCase();
  const envDefaultAgent = (process.env.EURECLAW_DEFAULT_AGENT || '').toLowerCase();

  // Discover available subagent names dynamically from .opencode/agents
  // so newly added agents work without code changes.
  const agentsDirForRouting = isDirectMode
    ? path.join(containerInput.directMode!.projectDir!, '.opencode', 'agents')
    : '/workspace/project/.opencode/agents';
  let knownAgentNames = new Set<string>();
  try {
    if (fs.existsSync(agentsDirForRouting)) {
      const files = fs.readdirSync(agentsDirForRouting).filter(f => f.endsWith('.md'));
      knownAgentNames = new Set(files.map(f => path.basename(f, '.md').toLowerCase()));
    }
  } catch (err) {
    log(`⚠ Failed to discover agents for routing: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Extract explicit @agent mentions from user prompt.
  const mentionedAgents = Array.from(
    new Set(
      [...promptLower.matchAll(/(^|\s)@([a-z0-9][a-z0-9_-]{1,63})\b/g)].map(m => m[2])
    )
  );
  const mentionedKnownSubagent = mentionedAgents.find(
    a => a !== 'build' && a !== 'orchestrator' && knownAgentNames.has(a)
  );

  let agentName: string = 'build'; // Default to build
  let routingReason = '';

  // Priority 1: Web UI override (from containerInput)
  if (containerInput.agent) {
    agentName = containerInput.agent;
    routingReason = `web UI override (${containerInput.agent})`;
  } else if (promptLower.includes('@orchestrator')) {
    agentName = 'orchestrator';
    routingReason = 'explicit @orchestrator override in prompt';
  } else if (promptLower.includes('@build')) {
    agentName = 'build';
    routingReason = 'explicit @build override in prompt';
  } else if (promptLower.includes('@plan')) {
    agentName = 'plan';
    routingReason = 'explicit @plan override in prompt';
  } else if (mentionedKnownSubagent) {
    agentName = 'orchestrator';
    routingReason = `explicit @${mentionedKnownSubagent} mention (known subagent)`;
  } else if (envDefaultAgent === 'orchestrator' || envDefaultAgent === 'build' || envDefaultAgent === 'plan') {
    agentName = envDefaultAgent;
    routingReason = `EURECLAW_DEFAULT_AGENT=${envDefaultAgent}`;
  } else {
    const useOrchestrator = detectComplexTask(effectivePrompt);
    agentName = useOrchestrator ? 'orchestrator' : 'build';
    routingReason = useOrchestrator ? 'complexity heuristic' : 'simple-task heuristic';
  }

  if (agentName === 'orchestrator') {
    log(`🧠 Using orchestrator agent (${routingReason})`);
  } else if (agentName === 'plan') {
    log(`📋 Using plan agent (${routingReason})`);
  } else if (agentName === 'build') {
    log(`⚡ Using build agent (${routingReason})`);
  } else {
    log(`🎯 Using ${agentName} agent (${routingReason})`);
  }

  // Load session context (agents and skills available)
  // This is generated by scripts/generate-session-context.ts
  let sessionContext = '';
  try {
    const sessionContextPath = isDirectMode
      ? path.join(containerInput.directMode!.projectDir!, '.opencode', 'session-context.md')
      : '/workspace/project/.opencode/session-context.md';
    
    if (fs.existsSync(sessionContextPath)) {
      sessionContext = fs.readFileSync(sessionContextPath, 'utf-8');
      log(`Loaded session context (${sessionContext.length} chars)`);
    } else {
      log(`⚠ Session context not found at ${sessionContextPath}`);
    }
  } catch (err) {
    log(`⚠ Failed to load session context: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Discover agents and skills dynamically for orchestrator
  let agentsAndSkillsContext = '';
  if (agentName === 'orchestrator') {
    try {
      log('🔍 Discovering available agents and skills...');
      
      // Discover agents by scanning .opencode/agents/
      const agentsDir = isDirectMode
        ? path.join(containerInput.directMode!.projectDir!, '.opencode', 'agents')
        : '/workspace/project/.opencode/agents';
      
      const agents: Array<{ name: string; description: string }> = [];
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
        for (const file of agentFiles) {
          const filePath = path.join(agentsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Extract frontmatter description
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let description = 'No description available';
          
          if (frontmatterMatch) {
            const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
            if (descMatch) {
              description = descMatch[1].trim().replace(/^["']|["']$/g, '');
            }
          }
          
          // Fallback: first non-heading line
          if (description === 'No description available') {
            const lines = content.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith('#')) {
                description = trimmed.slice(0, 150);
                break;
              }
            }
          }
          
          agents.push({
            name: path.basename(file, '.md'),
            description
          });
        }
      }
      
      // Discover skills by scanning .opencode/skills/
      const skillsDir = isDirectMode
        ? path.join(containerInput.directMode!.projectDir!, '.opencode', 'skills')
        : '/workspace/project/.opencode/skills';
      
      const skills: Array<{ name: string; description: string }> = [];
      if (fs.existsSync(skillsDir)) {
        const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        
        for (const dir of skillDirs) {
          const skillFile = path.join(skillsDir, dir, 'SKILL.md');
          if (!fs.existsSync(skillFile)) continue;
          
          const content = fs.readFileSync(skillFile, 'utf-8');
          
          // Extract frontmatter description
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let description = 'No description available';
          
          if (frontmatterMatch) {
            const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
            if (descMatch) {
              description = descMatch[1].trim().replace(/^["']|["']$/g, '');
            }
          }
          
          // Fallback: first non-heading line
          if (description === 'No description available') {
            const lines = content.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith('#')) {
                description = trimmed.slice(0, 150);
                break;
              }
            }
          }
          
          skills.push({
            name: dir,
            description
          });
        }
      }
      
      // Build context
      const agentsList = agents.map(a => `- **@${a.name}**: ${a.description}`).join('\n');
      const skillsList = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');
      
      agentsAndSkillsContext = `
## Available Subagents

You can delegate tasks to these specialized agents:

${agentsList || 'No agents found'}

## Available Skills

These skills provide additional capabilities:

${skillsList || 'No skills found'}

Use the Task tool to invoke agents when appropriate.
`;
      
      log(`✅ Discovered ${agents.length} agents and ${skills.length} skills`);
    } catch (err) {
      log(`⚠ Failed to discover agents/skills: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Requirement 9.4: Build final system prompt with all context
  const systemAppend = [
    globalAgentsMd,
    groupContext,
    memoryContext,
    conversationContext,
    envContext,
    agentsAndSkillsContext
  ].filter(Boolean).join('\n\n');
  
  // Helper: call noReply prompt with a 30s timeout
  const CONTEXT_TIMEOUT_MS = 30_000;
  const injectContext = async (sid: string, text: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);
    try {
      return await client.session.prompt({
        path: { id: sid },
        body: { noReply: true, parts: [{ type: 'text', text }] },
        signal: controller.signal as any,
      });
    } finally {
      clearTimeout(timer);
    }
  };
  
  // Requirement 9.1, 9.5: Pass system prompt to OpenCode SDK session configuration
  // Use session.prompt with noReply:true to inject context without triggering AI response
  // (session.init is for analyzing the app and creating AGENTS.md, not for system prompts)
  // 
  // OPTIMIZATION: Only inject context once per session, not on every message.
  // OpenCode sessions maintain full conversation memory automatically.
  // Re-injecting context on every message causes 80k+ token cache reads and slows everything down.
  let contextInjected = contextAlreadyInjected || false;
  
  if (!contextInjected) {
    try {
      log(`Injecting system context into session ${currentSessionId} (${systemAppend.length} chars)...`);
      const contextResp = await injectContext(currentSessionId, systemAppend);
      log(`Context injection response: ${JSON.stringify(contextResp?.data ?? contextResp).slice(0, 300)}`);
      log(`Session ${currentSessionId} context injected successfully`);
      contextInjected = true;
    } catch (error) {
      // Requirement 7.4, 7.5: Log errors with full context and return error status
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      log(`ERROR: Failed to inject system context: ${errorMessage}`);
      if (errorStack) {
        log(`Stack trace: ${errorStack}`);
      }
      log(`Context: sessionId=${currentSessionId}, contextLength=${systemAppend.length}`);
      
      // Return error via container output protocol (Requirement 7.5)
      writeOutput({
        status: 'error',
        result: null,
        error: `Context injection failed: ${errorMessage}`,
        newSessionId: currentSessionId
      });
      
      // Return gracefully instead of throwing — don't crash the process
      return { newSessionId: currentSessionId, lastAssistantUuid: undefined, closedDuringQuery: false, client, contextInjected: false, hadError: true };
    }
  } else {
    log(`Skipping context injection (already injected for this session)`);
  }

  // Discover additional directories mounted at /workspace/extra/* (container mode)
  // In direct mode, extra dirs would be configured differently
  const extraDirs: string[] = [];
  const extraBase = isDirectMode ? '' : '/workspace/extra';
  if (extraBase && fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        extraDirs.push(fullPath);
      }
    }
  }
  if (extraDirs.length > 0) {
    log(`Additional directories: ${extraDirs.join(', ')}`);
  }

  // Send message and get response (Requirement 3.1)
  // session.prompt() is SYNCHRONOUS — it blocks until the AI responds and returns
  // the complete response in { data: { info: AssistantMessage, parts: Part[] } }
  const messageTimestamp = new Date().toISOString();
  log(`Sending message to session ${currentSessionId} with agent: ${agentName}...`);
  debugLog(`Message metadata: length=${effectivePrompt.length} chars, chatJid=${containerInput.chatJid}, timestamp=${messageTimestamp}, agent=${agentName}`);

  // Poll for _close sentinel during the blocking prompt call
  let closedDuringPrompt = false;
  const pollInterval = setInterval(() => {
    if (shouldClose()) {
      log('✓ Close sentinel detected during prompt');
      closedDuringPrompt = true;
      clearInterval(pollInterval);
    }
  }, IPC_POLL_MS);

  // Helper: call session.prompt with a timeout (default 10 minutes)
  // Keep this aligned with provider timeout expectations (often 600000 ms).
  const PROMPT_TIMEOUT_MS = Number(process.env.PROMPT_TIMEOUT_MS || 10 * 60 * 1000);

  const modelOverride = parseModelOverride(containerInput.model);
  if (modelOverride) {
    log(`🔧 Model override: ${modelOverride.providerID}/${modelOverride.modelID}`);
  }

  // Current model override — set from containerInput, may be updated by main() via containerInput.model
  let currentModelOverride = modelOverride;

  const promptWithTimeout = async (sid: string, text: string, agent?: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS);
    try {
      const resp = await client.session.prompt({
        path: { id: sid },
        body: { 
          agent, // Use specified agent (orchestrator, build, etc.)
          model: currentModelOverride, // Override model from web UI (if set)
          parts: [{ type: 'text', text }] 
        },
        signal: controller.signal as any,
      });
      return resp;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // session.prompt() blocks until AI responds
    // Returns { data: { info: AssistantMessage, parts: Part[] }, request, response }
    let response: any;
    try {
      response = await promptWithTimeout(currentSessionId, effectivePrompt, agentName);
    } catch (promptErr: any) {
      // If session might be stale/expired, retry with a fresh session
      const msg = promptErr?.message || String(promptErr);
      const isSessionError = msg.includes('fetch failed') || msg.includes('abort') || msg.includes('timeout') || msg.includes('404') || msg.includes('not found') || msg.includes('ContextOverflow') || msg.includes('context_length') || msg.includes('context window') || msg.includes('maximum context length');
      if (isSessionError && sessionId) {
        log(`⚠ Prompt failed (${msg}), recreating client and retrying with fresh session...`);
        try {
          // Recreate the HTTP client — the old one may have a dead connection
          client = await createOpencodeClient(sdkEnv);
          const freshSession = await client.session.create();
          currentSessionId = freshSession.data?.id ?? freshSession.id;
          newSessionId = currentSessionId;
          log(`✓ Created fresh session: ${currentSessionId}`);
          // Re-inject context into fresh session
          await injectContext(currentSessionId, systemAppend);
          response = await promptWithTimeout(currentSessionId, effectivePrompt, agentName);
        } catch (retryErr: any) {
          log(`ERROR: Retry with fresh session also failed: ${retryErr?.message || String(retryErr)}`);
          throw retryErr;
        }
      } else {
        throw promptErr;
      }
    }

    clearInterval(pollInterval);

    log(`✓ Response received from session ${currentSessionId}`);
    
    // Debug: log the raw response structure to understand what the SDK returns
    log(`Response keys: ${Object.keys(response || {}).join(', ')}`);
    log(`Response.data type: ${typeof response?.data}`);
    if (response?.data) {
      log(`Response.data keys: ${Object.keys(response.data).join(', ')}`);
      log(`Response.data snippet: ${JSON.stringify(response.data).slice(0, 500)}`);
    } else {
      log(`Raw response snippet: ${JSON.stringify(response).slice(0, 500)}`);
    }

    // Extract response data — handle both responseStyle 'fields' and 'data'
    let responseData = response.data ?? response;
    let parts = responseData.parts || [];
    
    log(`Extracted parts count: ${parts.length}, parts types: ${parts.map((p: any) => p.type).join(', ')}`);

    // Detect ContextOverflowError — the SDK returns HTTP 200 with the error
    // embedded in responseData.info.error, not as a thrown exception.
    // When this happens, the session is saturated and we must start fresh.
    const infoError = responseData.info?.error;
    const errorName = infoError?.name || infoError?.type || '';
    const errorMessage2 = infoError?.message || '';
    if (errorName.includes('ContextOverflow') || errorName.includes('context_length') || 
        errorMessage2.includes('context window') || errorMessage2.includes('token limit') ||
        errorMessage2.includes('maximum context length')) {
      log(`⚠ ContextOverflowError detected: ${errorName} — ${errorMessage2}`);
      log(`Session ${currentSessionId} is saturated, creating fresh session and retrying...`);
      
      try {
        client = await createOpencodeClient(sdkEnv);
        const freshSession = await client.session.create();
        currentSessionId = freshSession.data?.id ?? freshSession.id;
        newSessionId = currentSessionId;
        log(`✓ Created fresh session after overflow: ${currentSessionId}`);
        
        // Re-inject context into fresh session
        await injectContext(currentSessionId, systemAppend);
        
        // Retry the prompt
        const retryResponse = await promptWithTimeout(currentSessionId, effectivePrompt, agentName);
        const retryData = retryResponse.data ?? retryResponse;
        responseData = retryData;
        parts = retryData.parts || [];
        log(`✓ Retry response received, parts: ${parts.length}`);
      } catch (overflowRetryErr: any) {
        log(`ERROR: Retry after ContextOverflow failed: ${overflowRetryErr?.message || String(overflowRetryErr)}`);
        writeOutput({
          status: 'error',
          result: null,
          error: `Context overflow — session was reset but retry failed: ${overflowRetryErr?.message || String(overflowRetryErr)}`,
          newSessionId: currentSessionId,
        });
        throw overflowRetryErr;
      }
    }
    // Extract text from response parts
    const textParts = parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text || '')
      .join('');

    // Build metadata from responseData.info (contains modelID, providerID, agent, tokens, cost)
    const info = responseData.info || {};
    const outputMetadata: ContainerOutput['metadata'] = {
      modelID: info.modelID || undefined,
      providerID: info.providerID || undefined,
      mode: info.mode || undefined,
      agent: info.agent || info.mode || undefined,
      tokens: info.tokens ? {
        total: info.tokens.total || 0,
        input: info.tokens.input || 0,
        output: info.tokens.output || 0,
        reasoning: info.tokens.reasoning || 0,
        cacheRead: info.tokens.cache?.read || 0,
        cacheWrite: info.tokens.cache?.write || 0,
      } : undefined,
      cost: info.cost ?? undefined,
    };
    if (outputMetadata.modelID) {
      log(`📊 Model: ${outputMetadata.providerID}/${outputMetadata.modelID}, agent: ${outputMetadata.agent}, tokens: ${JSON.stringify(outputMetadata.tokens)}`);
    }

    if (textParts) {
      resultCount++;
      log(`✓ Assistant response #${resultCount}: ${textParts.slice(0, 200)}${textParts.length > 200 ? '...' : ''}`);

      writeOutput({
        status: 'success',
        result: textParts,
        newSessionId: currentSessionId,
        metadata: outputMetadata,
      });
    } else {
      // No text parts — try fetching messages as fallback
      log(`⚠ No text parts in prompt response, trying session.messages fallback...`);
      let fallbackText = '';
      try {
        const msgsResp = await client.session.messages({ path: { id: currentSessionId } });
        const msgs = (msgsResp as any).data || msgsResp;
        if (Array.isArray(msgs) && msgs.length > 0) {
          const lastAssistant = [...msgs].reverse().find((m: any) => m.info?.role === 'assistant');
          if (lastAssistant) {
            fallbackText = (lastAssistant.parts || [])
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text || '')
              .join('');
          }
        }
      } catch (fetchErr) {
        log(`⚠ Fallback fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
      }

      if (fallbackText) {
        resultCount++;
        log(`✓ Got response via fallback: ${fallbackText.slice(0, 200)}${fallbackText.length > 200 ? '...' : ''}`);
        writeOutput({ status: 'success', result: fallbackText, newSessionId: currentSessionId, metadata: outputMetadata });
      } else {
        log(`⚠ Empty response from session ${currentSessionId}`);
        writeOutput({ status: 'success', result: '[No response]', newSessionId: currentSessionId, metadata: outputMetadata });
      }
    }

    // Track message info for resumption
    const messageInfo = responseData.info;
    if (messageInfo?.id) {
      lastAssistantUuid = messageInfo.id;
    }

    closedDuringQuery = closedDuringPrompt;

  } catch (error) {
    clearInterval(pollInterval);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    log(`ERROR: Failed to send message / get response: ${errorMessage}`);
    if (errorStack) {
      log(`Stack trace: ${errorStack}`);
    }
    log(`Context: sessionId=${currentSessionId}, promptLength=${effectivePrompt.length}`);

    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to send message: ${errorMessage}`,
      newSessionId: currentSessionId
    });

    // Don't throw — return gracefully so the query loop can continue.
    // Model timeouts and network errors should not crash the entire agent process.
    return { newSessionId: currentSessionId, lastAssistantUuid: undefined, closedDuringQuery: false, client, contextInjected, hadError: true };
  }

  log(`Query completed successfully`);
  log(`Summary: events=${messageCount}, results=${resultCount}, lastAssistantUuid=${lastAssistantUuid || 'none'}, closedDuringQuery=${closedDuringQuery}`);
  debugLog(`Query statistics: sessionId=${currentSessionId}, groupFolder=${containerInput.groupFolder}, chatJid=${containerInput.chatJid}, timestamp=${new Date().toISOString()}`);
  
  return { newSessionId, lastAssistantUuid, closedDuringQuery, client, contextInjected, hadError: false };
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    // Delete the temp file the entrypoint wrote — it contains secrets
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    
    log(`=== EureClaw Agent Runner Started ===`);
    log(`Group: ${containerInput.groupFolder}, ChatJID: ${containerInput.chatJid}, IsMain: ${containerInput.isMain}`);
    debugLog(`Container input: sessionId=${containerInput.sessionId || 'none'}, isScheduledTask=${containerInput.isScheduledTask || false}, directMode=${!!containerInput.directMode}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  // Build SDK env: merge secrets into process.env for the SDK only.
  // Secrets never touch process.env itself, so Bash subprocesses can't see them.
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    sdkEnv[key] = value;
  }
  
  debugLog(`SDK environment configured with ${Object.keys(containerInput.secrets || {}).length} secrets`);
  
  // Verify that secrets are not in process.env (Requirements 5.4, 8.1)
  // This is our alternative to PreToolUse hooks - prevention instead of interception
  verifySecretsNotInProcessEnv();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  // Pre-create the OpenCode client so we can register MCP before the first query
  let preClient: any = null;

  let sessionId = containerInput.sessionId;

  // Direct mode: override hardcoded container paths with real host paths
  // Requirements: 10.2, 10.3, 10.4
  let ipcBaseDir = '/workspace/ipc';
  let groupDir = '/workspace/group';
  let globalDir: string | undefined = '/workspace/global';
  if (containerInput.directMode) {
    ipcBaseDir = containerInput.directMode.ipcDir;
    groupDir = containerInput.directMode.groupDir;
    globalDir = containerInput.directMode.globalDir;
    IPC_INPUT_DIR = path.join(ipcBaseDir, 'input');
    IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
    
    log(`Direct mode enabled`);
    log(`Paths: ipc=${ipcBaseDir}, group=${groupDir}, global=${globalDir || 'none'}`);
    debugLog(`Direct mode configuration: platform=${process.platform}, projectDir=${containerInput.directMode.projectDir || 'none'}`);
    
    // Fix PATH for Windows: ensure node is findable by SDK subprocesses
    // Requirement 10.4: Configure client with real host paths
    // OpenCode SDK spawns subprocesses that inherit process.env, so we need to update it
    if (process.platform === 'win32' && process.env.PATH) {
      const nodePath = 'C:\\Program Files\\nodejs';
      if (!process.env.PATH.includes(nodePath)) {
        process.env.PATH = `${nodePath};${process.env.PATH}`;
        log(`Added ${nodePath} to PATH for SDK subprocesses`);
      }
    }
    
    // Pass HEADED and GROUP_FOLDER to subprocesses (for browser automation)
    // These are set by direct-runner.ts and need to be inherited by bash commands
    if (process.env.HEADED) {
      log(`HEADED=${process.env.HEADED} will be passed to subprocesses`);
    }
    if (process.env.GROUP_FOLDER) {
      log(`GROUP_FOLDER=${process.env.GROUP_FOLDER} will be passed to subprocesses`);
    }
  } else {
    log(`Container mode enabled (paths: /workspace/*)`);
  }

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel from previous container runs
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
    log(`Processing scheduled task`);
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    debugLog(`Pending messages total length: ${pending.join('\n').length} chars`);
    prompt += '\n' + pending.join('\n');
  }
  
  log(`Initial prompt prepared: ${prompt.length} chars`);
  debugLog(`Prompt preview: ${prompt.slice(0, 150)}${prompt.length > 150 ? '...' : ''}`);

  // Register EureClaw MCP server dynamically with the OpenCode server.
  // This makes tools like send_message, send_image, schedule_task available to the agent.
  // Must be done before the first query so the agent can use these tools.
  try {
    preClient = await createOpencodeClient(sdkEnv);
    log('Registering EureClaw MCP server with OpenCode...');

    // Disconnect existing eureclaw MCP server if any (env vars may have changed)
    try {
      await preClient.mcp.disconnect({ path: { name: 'eureclaw' } });
      debugLog('Disconnected existing eureclaw MCP server');
    } catch {
      // Server may not exist yet — that's fine
    }

    // Build the command array for the MCP server process.
    // The OpenCode server spawns this as a subprocess.
    // Use the compiled JS from dist/ with absolute path so it works from any cwd.
    const isDirectMode = !!containerInput.directMode;
    const projectDir = containerInput.directMode?.projectDir || process.cwd();
    const mcpServerAbsPath = isDirectMode
      ? path.join(projectDir, 'container', 'agent-runner', 'dist', 'ipc-mcp-stdio.js')
      : mcpServerPath;
    const mcpCommand = ['node', mcpServerAbsPath];

    // Environment variables for the MCP server process
    const mcpEnv: Record<string, string> = {
      EURECLAW_CHAT_JID: containerInput.chatJid,
      EURECLAW_GROUP_FOLDER: containerInput.groupFolder,
      EURECLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
      EURECLAW_IPC_DIR: ipcBaseDir,
      EURECLAW_GROUP_DIR: groupDir,
      PROJECT_DIR: containerInput.directMode?.projectDir || '/workspace/project',
    };

    await preClient.mcp.add({
      body: {
        name: 'eureclaw',
        config: {
          type: 'local' as const,
          command: mcpCommand,
          environment: mcpEnv,
          enabled: true,
          timeout: 10000,
        },
      },
    });

    log('✓ EureClaw MCP server registered successfully');

    // Verify it's connected
    try {
      const status = await preClient.mcp.status();
      const statusData = (status as any).data ?? status;
      if (Array.isArray(statusData)) {
        const eureclaw = statusData.find((s: any) => s.name === 'eureclaw');
        if (eureclaw) {
          log(`MCP server 'eureclaw' status: ${JSON.stringify(eureclaw).slice(0, 200)}`);
        }
      }
    } catch {
      // Non-critical — just for logging
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`⚠ Failed to register EureClaw MCP server: ${errorMessage}`);
    log('Agent will continue without MCP tools (send_message, send_image, etc.)');
    // Non-fatal — agent can still work, just without EureClaw-specific tools
  }

  // Query loop: run query → wait for IPC message → run new query → repeat
  // OpenCode client is created on first query and reused for subsequent queries
  let resumeAt: string | undefined;
  let clientInstance: any = preClient;
  let queryCount = 0;
  let contextInjected = false; // Track if context has been injected for this session
  const ARCHIVE_INTERVAL = 10; // Archive every 10 queries
  
  log(`Starting query loop...`);
  debugLog(`Configuration: archiveInterval=${ARCHIVE_INTERVAL}, sessionId=${sessionId || 'new'}`);
  
  try {
    while (true) {
      queryCount++;
      log(`--- Query #${queryCount} ---`);
      log(`Session: ${sessionId || 'new'}, ResumeAt: ${resumeAt || 'latest'}`);
      debugLog(`Query context: chatJid=${containerInput.chatJid}, groupFolder=${containerInput.groupFolder}, timestamp=${new Date().toISOString()}`);

      let queryResult;
      try {
        queryResult = await runQuery(prompt, sessionId, mcpServerPath, containerInput, sdkEnv, groupDir, ipcBaseDir, globalDir, resumeAt, clientInstance, contextInjected);
      } catch (queryErr) {
        // Query failed catastrophically (e.g. session creation failed).
        // Write error output but DON'T crash — exit the loop gracefully.
        const errMsg = queryErr instanceof Error ? queryErr.message : String(queryErr);
        log(`ERROR: Query #${queryCount} failed: ${errMsg}`);
        writeOutput({
          status: 'error',
          result: null,
          newSessionId: sessionId,
          error: errMsg
        });
        // Exit the loop gracefully instead of process.exit(1)
        break;
      }
      
      // Store OpenCode client for reuse across queries
      if (!clientInstance) {
        clientInstance = queryResult.client;
        log(`✓ OpenCode client initialized and will be reused for subsequent queries`);
      }
      
      // Track context injection status
      if (queryResult.contextInjected) {
        contextInjected = true;
      }
      
      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
        debugLog(`Session ID updated: ${sessionId}`);
      }
      if (queryResult.lastAssistantUuid) {
        resumeAt = queryResult.lastAssistantUuid;
        debugLog(`Resume point updated: ${resumeAt}`);
      }

      // If the query had a model/network error, the error output was already
      // written inside runQuery. Exit the loop gracefully — the host process
      // will see the error and report it to the user without a crash.
      if (queryResult.hadError) {
        log(`Query #${queryCount} had an error, exiting loop gracefully`);
        break;
      }
      
      // Archive conversation periodically (OpenCode SDK doesn't have PreCompact hooks)
      // Requirement 5.3: Maintain conversation archiving functionality
      if (sessionId && queryCount % ARCHIVE_INTERVAL === 0 && clientInstance) {
        log(`Periodic archive triggered (query count: ${queryCount})`);
        await archiveSessionConversation(clientInstance, sessionId, groupDir);
      }

      // If _close was consumed during the query, exit immediately.
      // Don't emit a session-update marker (it would reset the host's
      // idle timer and cause a 30-min delay before the next _close).
      if (queryResult.closedDuringQuery) {
        log('✓ Close sentinel consumed during query, exiting');
        break;
      }

      // Emit session update so host can track it
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log(`Query #${queryCount} completed, waiting for next IPC message...`);
      debugLog(`Waiting state: sessionId=${sessionId}, resumeAt=${resumeAt || 'latest'}, timestamp=${new Date().toISOString()}`);

      // Wait for the next message or _close sentinel
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('✓ Close sentinel received, exiting');
        break;
      }

      // Update model override if the IPC message carries a new preference
      if (nextMessage.model) {
        const newModel = parseModelOverride(nextMessage.model);
        if (newModel) {
          log(`🔧 Model override updated: ${newModel.providerID}/${newModel.modelID}`);
          // Update containerInput so the next runQuery() picks up the new model
          containerInput.model = nextMessage.model;
        }
      }

      log(`Received new message (${nextMessage.text.length} chars), starting query #${queryCount + 1}`);
      debugLog(`New message preview: ${nextMessage.text.slice(0, 100)}${nextMessage.text.length > 100 ? '...' : ''}`);
      prompt = nextMessage.text;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    log(`ERROR: Agent execution failed: ${errorMessage}`);
    if (errorStack) {
      log(`Stack trace: ${errorStack}`);
    }
    log(`Context: sessionId=${sessionId || 'none'}, queryCount=${queryCount}, groupFolder=${containerInput.groupFolder}, chatJid=${containerInput.chatJid}`);
    
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage
    });
    // Exit gracefully (code 0) — the error is reported via the output protocol.
    // process.exit(1) was causing the host to show "Agent exited with code 1"
    // which is misleading — it's a model/network error, not a system crash.
  } finally {
    // Note: OpenCode client doesn't need explicit cleanup
    // The client just makes HTTP requests to the OpenCode server
    log(`=== EureClaw Agent Runner Finished ===`);
  }
}

main();
