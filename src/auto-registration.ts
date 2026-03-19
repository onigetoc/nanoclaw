import fs from 'fs';
import path from 'path';

import { WORKSPACES_DIR, TRIGGER_PATTERN } from './config.js';
import { hasWorkspaceWithFolder, setRegisteredWorkspace } from './db.js';
import { logger } from './logger.js';
import { RegisteredWorkspace } from './types.js';

export interface AutoRegistrationResult {
  registered: boolean;
  reason: 'already_exists' | 'registered' | 'not_eligible';
}

/**
 * Check if the 'main' workspace already exists.
 * 
 * @returns true if main workspace is registered, false otherwise
 */
export function hasMainWorkspace(): boolean {
  return hasWorkspaceWithFolder('main');
}

/**
 * Initialize the main workspace folder structure and files.
 * Creates:
 * - workspaces/main/dna/
 * - workspaces/main/workspace/ (screenshots, reports, tasks, downloads)
 * - workspaces/main/uploads/
 * - workspaces/main/logs/
 * - workspaces/main/conversations/
 * - workspaces/main/dna/AGENTS.md
 * - workspaces/global/dna/AGENTS.md (if not exists)
 * 
 * @param workspaceFolder - The folder name (always 'main' for auto-registration)
 */
export function initializeWorkspaceFolders(workspaceFolder: string): void {
  const wsRootPath = path.join(WORKSPACES_DIR, workspaceFolder);
  const dnaPath = path.join(wsRootPath, 'dna');
  const workspacePath = path.join(wsRootPath, 'workspace');
  const logsPath = path.join(wsRootPath, 'logs');
  const conversationsPath = path.join(wsRootPath, 'conversations');
  const uploadsPath = path.join(wsRootPath, 'uploads');
  const agentsPath = path.join(dnaPath, 'AGENTS.md');
  const globalDnaPath = path.join(WORKSPACES_DIR, 'global', 'dna');
  const globalAgentsPath = path.join(globalDnaPath, 'AGENTS.md');

  // Create folder structure
  fs.mkdirSync(dnaPath, { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'reports'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'downloads'), { recursive: true });
  fs.mkdirSync(uploadsPath, { recursive: true });
  fs.mkdirSync(logsPath, { recursive: true });
  fs.mkdirSync(conversationsPath, { recursive: true });

  // Create main AGENTS.md if it doesn't exist
  if (!fs.existsSync(agentsPath)) {
    const mainTemplate = `# Memory for Main Chat

This is your personal chat memory. You can store information here that you want to remember across conversations.

## About Me

[The agent can write information about you here]

## Preferences

[Your preferences and settings]

## Projects

[Information about your projects]
`;
    fs.writeFileSync(agentsPath, mainTemplate, 'utf-8');
  }

  // Create global AGENTS.md if it doesn't exist
  fs.mkdirSync(globalDnaPath, { recursive: true });
  
  if (!fs.existsSync(globalAgentsPath)) {
    const globalTemplate = `# Global Memory

This memory is shared across all workspaces. Store general knowledge and capabilities here.

## Available Skills

Skills are located in \`.opencode/skills/\`. To use a skill, read its SKILL.md file.

## Capabilities

- Web search and content fetching
- File reading and writing
- Code analysis and generation
- Task scheduling
- Multi-workspace management
`;
    fs.writeFileSync(globalAgentsPath, globalTemplate, 'utf-8');
  }
}

/**
 * Attempt to auto-register a chat as the 'main' workspace.
 * 
 * @param chatJid - The JID of the chat attempting to register
 * @param chatName - The name of the chat (user name for private, workspace name for workspaces)
 * @param isPrivateChat - Whether this is a private/DM chat
 * @returns Result indicating whether registration occurred
 */
export function attemptAutoRegistration(
  chatJid: string,
  chatName: string,
  isPrivateChat: boolean,
): AutoRegistrationResult {
  // Check if main workspace already exists
  if (hasMainWorkspace()) {
    return { registered: false, reason: 'already_exists' };
  }

  // Auto-register this chat as main workspace
  const workspace: RegisteredWorkspace = {
    name: chatName || chatJid, // Fallback to JID if name is empty
    folder: 'main',
    trigger: TRIGGER_PATTERN.source,
    added_at: new Date().toISOString(),
    requiresTrigger: false, // Main workspace doesn't need @mentions
  };

  try {
    // Initialize folder structure first
    initializeWorkspaceFolders('main');

    // Register in database
    setRegisteredWorkspace(chatJid, workspace);

    return { registered: true, reason: 'registered' };
  } catch (error) {
    // If registration fails, log and return failure
    logger.error(
      { 
        jid: chatJid, 
        name: chatName, 
        isPrivate: isPrivateChat,
        error: error instanceof Error ? error.message : String(error) 
      },
      'Auto-registration failed during folder/database setup',
    );
    return { registered: false, reason: 'not_eligible' };
  }
}
