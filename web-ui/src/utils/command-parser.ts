/**
 * Command parser for web UI slash commands
 * Parses commands like /plan, /model gpt-4o, etc. and extracts parameters
 * Similar to how OpenCode native UI handles commands
 */

export interface ParsedCommand {
  agent?: string;
  model?: string;
  message: string; // The cleaned message without commands
}

/**
 * Parse slash commands from user input
 * Examples:
 *   "/plan analyze this code" → { agent: "plan", message: "analyze this code" }
 *   "/model gpt-4o /plan do this" → { agent: "plan", model: "openai/gpt-4o", message: "do this" }
 *   "regular message" → { message: "regular message" }
 */
export function parseCommands(input: string): ParsedCommand {
  const result: ParsedCommand = {
    message: input.trim(),
  };

  if (!input.trim().startsWith('/')) {
    return result;
  }

  const parts = input.trim().split(/\s+/);
  const messageParts: string[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];

    if (!part.startsWith('/')) {
      // Not a command, add to message
      messageParts.push(part);
      i++;
      continue;
    }

    const command = part.slice(1).toLowerCase();

    // Agent commands: /plan, /build, /orchestrator, etc.
    if (command === 'plan' || command === 'build' || command === 'orchestrator' || command === 'planner') {
      result.agent = command;
      i++;
      continue;
    }

    // Model command: /model <model-id>
    if (command === 'model') {
      i++;
      if (i < parts.length && !parts[i].startsWith('/')) {
        result.model = parts[i];
        i++;
      }
      continue;
    }

    // Unknown command, treat as part of message
    messageParts.push(part);
    i++;
  }

  result.message = messageParts.join(' ').trim();
  return result;
}

/**
 * Build command prefix from agent and model selections
 * Used when user selects from dropdown menus
 */
export function buildCommandPrefix(agent?: string, model?: string): string {
  const parts: string[] = [];
  
  if (agent && agent !== 'build') {
    // Only add /agent if it's not the default 'build'
    parts.push(`/${agent}`);
  }
  
  if (model) {
    parts.push(`/model ${model}`);
  }
  
  return parts.length > 0 ? parts.join(' ') + ' ' : '';
}

/**
 * Normalize model ID to provider/model format
 * Examples:
 *   "gpt-4o" → "openai/gpt-4o"
 *   "claude-3-5-sonnet" → "anthropic/claude-3-5-sonnet-20241022"
 *   "gemini-2.0-flash-exp" → "google/gemini-2.0-flash-exp"
 */
export function normalizeModelId(modelId: string): string {
  // If already has provider prefix, return as-is
  if (modelId.includes('/')) {
    return modelId;
  }

  // Map common model names to full IDs
  const modelMap: Record<string, string> = {
    'gpt-4o': 'openai/gpt-4o',
    'gpt-4': 'openai/gpt-4',
    'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
    'claude-3-5-sonnet': 'anthropic/claude-3-5-sonnet-20241022',
    'claude-3-opus': 'anthropic/claude-3-opus-20240229',
    'claude-3-sonnet': 'anthropic/claude-3-sonnet-20240229',
    'claude-3-haiku': 'anthropic/claude-3-haiku-20240307',
  };

  if (modelMap[modelId]) {
    return modelMap[modelId];
  }

  // Try to infer provider from model name
  if (modelId.startsWith('gpt-')) {
    return `openai/${modelId}`;
  }
  if (modelId.startsWith('claude-')) {
    return `anthropic/${modelId}`;
  }
  if (modelId.startsWith('gemini-')) {
    return `google/${modelId}`;
  }

  // Return as-is if we can't determine provider
  return modelId;
}
