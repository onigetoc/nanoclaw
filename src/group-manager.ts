/**
 * Group registration, template management, and group utilities.
 */
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, GROUPS_DIR } from './config.js';
import { getAllChats, setRegisteredGroup } from './db.js';
import { getRegisteredGroups } from './state.js';
import { RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import type { AvailableGroup } from './container-runner.js';

/**
 * Register a new group and create its folder structure.
 */
export function registerGroup(jid: string, group: RegisteredGroup): void {
  const registeredGroups = getRegisteredGroups();
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  copyTemplatesToGroup(groupDir);

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Copy template files from groups/templates/ into a new group folder.
 * Renames .tpl.md → .md and substitutes {{ASSISTANT_NAME}}.
 * Skips if the group already has .md files (not a fresh group).
 */
export function copyTemplatesToGroup(groupDir: string): void {
  const existingFiles = fs.readdirSync(groupDir);
  const hasMdFiles = existingFiles.some(
    (f) => f.endsWith('.md') && !f.endsWith('.tpl.md'),
  );
  if (hasMdFiles) return;

  const templatesDir = path.join(GROUPS_DIR, 'templates');
  if (!fs.existsSync(templatesDir)) {
    logger.warn({ templatesDir }, 'Templates directory not found, skipping template copy');
    return;
  }

  const templates = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.tpl.md'));
  if (templates.length === 0) return;

  const variables: Record<string, string> = {
    ASSISTANT_NAME,
  };

  for (const tplFile of templates) {
    let content = fs.readFileSync(path.join(templatesDir, tplFile), 'utf-8');

    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    const outputName = tplFile.replace('.tpl.md', '.md');
    fs.writeFileSync(path.join(groupDir, outputName), content, 'utf-8');
  }

  logger.info(
    { groupDir, templateCount: templates.length },
    'Copied templates to new group',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredGroups = getRegisteredGroups();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && (c.jid.endsWith('@g.us') || c.jid.startsWith('tg:')))
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/**
 * Determine if a JID represents a private/DM chat.
 */
export function isPrivateChat(jid: string): boolean {
  if (jid.endsWith('@s.whatsapp.net')) return true;
  if (jid.endsWith('@g.us')) return false;

  if (jid.startsWith('tg:')) {
    const numericId = jid.replace(/^tg:/, '');
    return !numericId.startsWith('-');
  }

  return false;
}
