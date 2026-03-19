/**
 * Workspace registration, template management, and workspace utilities.
 */
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, WORKSPACES_DIR } from './config.js';
import { getAllChats, setRegisteredWorkspace } from './db.js';
import { getRegisteredWorkspaces } from './state.js';
import { RegisteredWorkspace } from './types.js';
import { logger } from './logger.js';
import type { AvailableWorkspace } from './container-runner.js';

/**
 * Register a new workspace and create its folder structure.
 * 
 * New structure:
 * workspaces/{name}/
 * ├── dna/           ← Personality files (AGENTS.md, IDENTITY.md, etc.)
 * ├── workspace/     ← Agent-generated content
 * │   ├── screenshots/
 * │   ├── reports/
 * │   ├── tasks/
 * │   └── downloads/
 * ├── uploads/       ← User-uploaded files
 * ├── logs/          ← Execution logs
 * └── conversations/ ← Conversation archives
 */
export function registerWorkspace(jid: string, workspace: RegisteredWorkspace): void {
  const registeredGroups = getRegisteredWorkspaces();
  registeredGroups[jid] = workspace;
  setRegisteredWorkspace(jid, workspace);

  const workspaceDir = path.join(WORKSPACES_DIR, workspace.folder);
  
  // Create folder structure
  fs.mkdirSync(path.join(workspaceDir, 'dna'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'workspace', 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'workspace', 'reports'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'workspace', 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'workspace', 'downloads'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'conversations'), { recursive: true });

  copyTemplatesToWorkspace(workspaceDir);

  logger.info(
    { jid, name: workspace.name, folder: workspace.folder },
    'Workspace registered',
  );
}

/**
 * Copy template files from workspaces/templates/ into a new workspace's dna/ folder.
 * Renames .tpl.md → .md and substitutes {{ASSISTANT_NAME}}.
 * Skips if the workspace already has .md files in dna/ (not a fresh workspace).
 */
export function copyTemplatesToWorkspace(workspaceDir: string): void {
  const dnaDir = path.join(workspaceDir, 'dna');
  fs.mkdirSync(dnaDir, { recursive: true });
  
  const existingFiles = fs.readdirSync(dnaDir);
  const hasMdFiles = existingFiles.some(
    (f) => f.endsWith('.md') && !f.endsWith('.tpl.md'),
  );
  if (hasMdFiles) return;

  const templatesDir = path.join(WORKSPACES_DIR, 'templates');
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
    fs.writeFileSync(path.join(dnaDir, outputName), content, 'utf-8');
  }

  logger.info(
    { workspaceDir, dnaDir, templateCount: templates.length },
    'Copied templates to new workspace dna/',
  );
}

/**
 * Get available workspaces list for the agent.
 * Returns workspaces ordered by most recent activity.
 */
export function getAvailableWorkspaces(): AvailableWorkspace[] {
  const chats = getAllChats();
  const registeredGroups = getRegisteredWorkspaces();
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
