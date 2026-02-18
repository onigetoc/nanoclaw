import fs from 'fs';
import path from 'path';

import { GROUPS_DIR, TRIGGER_PATTERN } from './config.js';
import { hasGroupWithFolder, setRegisteredGroup } from './db.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface AutoRegistrationResult {
  registered: boolean;
  reason: 'already_exists' | 'registered' | 'not_eligible';
}

/**
 * Check if the 'main' group already exists.
 * 
 * @returns true if main group is registered, false otherwise
 */
export function hasMainGroup(): boolean {
  return hasGroupWithFolder('main');
}

/**
 * Initialize the main group folder structure and files.
 * Creates:
 * - groups/main/
 * - groups/main/logs/
 * - groups/main/conversations/
 * - groups/main/AGENTS.md
 * - groups/global/AGENTS.md (if not exists)
 * 
 * @param groupFolder - The folder name (always 'main' for auto-registration)
 */
export function initializeGroupFolders(groupFolder: string): void {
  const groupPath = path.join(GROUPS_DIR, groupFolder);
  const logsPath = path.join(groupPath, 'logs');
  const conversationsPath = path.join(groupPath, 'conversations');
  const agentsPath = path.join(groupPath, 'AGENTS.md');
  const globalAgentsPath = path.join(GROUPS_DIR, 'global', 'AGENTS.md');

  // Create folder structure
  fs.mkdirSync(groupPath, { recursive: true });
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
  const globalPath = path.join(GROUPS_DIR, 'global');
  fs.mkdirSync(globalPath, { recursive: true });
  
  if (!fs.existsSync(globalAgentsPath)) {
    const globalTemplate = `# Global Memory

This memory is shared across all groups. Store general knowledge and capabilities here.

## Available Skills

Skills are located in \`.opencode/skills/\`. To use a skill, read its SKILL.md file.

## Capabilities

- Web search and content fetching
- File reading and writing
- Code analysis and generation
- Task scheduling
- Multi-group management
`;
    fs.writeFileSync(globalAgentsPath, globalTemplate, 'utf-8');
  }
}

/**
 * Attempt to auto-register a chat as the 'main' group.
 * 
 * @param chatJid - The JID of the chat attempting to register
 * @param chatName - The name of the chat (user name for private, group name for groups)
 * @param isPrivateChat - Whether this is a private/DM chat
 * @returns Result indicating whether registration occurred
 */
export function attemptAutoRegistration(
  chatJid: string,
  chatName: string,
  isPrivateChat: boolean,
): AutoRegistrationResult {
  // Check if main group already exists
  if (hasMainGroup()) {
    return { registered: false, reason: 'already_exists' };
  }

  // Auto-register this chat as main
  const group: RegisteredGroup = {
    name: chatName || chatJid, // Fallback to JID if name is empty
    folder: 'main',
    trigger: TRIGGER_PATTERN.source,
    added_at: new Date().toISOString(),
    requiresTrigger: false, // Main group doesn't need @mentions
  };

  try {
    // Initialize folder structure first
    initializeGroupFolders('main');

    // Register in database
    setRegisteredGroup(chatJid, group);

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
