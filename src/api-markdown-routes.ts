/**
 * API Markdown Routes — browse, read, and edit .md files from the web UI.
 *
 * Endpoints:
 *   GET  /md/groups                          — list groups with their browsable folders
 *   GET  /md/groups/:group/tree              — file tree for a group (dna + workspace .md files)
 *   GET  /md/groups/:group/file?path=...     — read a markdown file
 *   PUT  /md/groups/:group/file?path=...     — save a markdown file
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { GROUPS_DIR } from './config.js';

interface MdFileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: MdFileEntry[];
  size?: number;
  modified?: string;
}

/** Folders we expose inside each group */
const BROWSABLE_FOLDERS = ['dna', 'workspace', 'docs'];

/** Allowed file extensions for reading/writing */
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv'];

function isAllowedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

/** Recursively scan a directory for browsable files. */
function scanDirectory(dirPath: string, relativeTo: string): MdFileEntry[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries: MdFileEntry[] = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

    if (item.isDirectory()) {
      // Skip hidden folders, node_modules, downloads (already has its own endpoint)
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'downloads') continue;
      const children = scanDirectory(fullPath, relativeTo);
      if (children.length > 0) {
        entries.push({ name: item.name, path: relPath, type: 'folder', children });
      }
    } else if (item.isFile() && isAllowedFile(item.name)) {
      const stat = fs.statSync(fullPath);
      entries.push({
        name: item.name,
        path: relPath,
        type: 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  }

  // Sort: folders first, then files alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/** Validate that a relative path doesn't escape the group directory */
function isPathSafe(relativePath: string): boolean {
  const normalized = path.normalize(relativePath);
  return !normalized.startsWith('..') && !path.isAbsolute(normalized);
}

/** Check that the path starts with one of the browsable folders */
function isInBrowsableFolder(relativePath: string): boolean {
  const first = relativePath.split('/')[0];
  return BROWSABLE_FOLDERS.includes(first);
}

export function registerMarkdownRoutes(fastify: FastifyInstance, authenticate: any): void {

  /** List all groups with their available browsable folders */
  fastify.get('/md/groups', { preHandler: authenticate }, async () => {
    if (!fs.existsSync(GROUPS_DIR)) return { groups: [] };

    const groupDirs = fs.readdirSync(GROUPS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'templates');

    const groups = groupDirs.map(d => {
      const groupPath = path.join(GROUPS_DIR, d.name);
      const folders = BROWSABLE_FOLDERS.filter(f => fs.existsSync(path.join(groupPath, f)));
      return { name: d.name, folders };
    });

    return { groups };
  });

  /** Get file tree for a specific group */
  fastify.get('/md/groups/:group/tree', { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { group } = request.params as { group: string };
      const groupPath = path.join(GROUPS_DIR, group);

      if (!fs.existsSync(groupPath)) {
        return reply.code(404).send({ error: 'Group not found' });
      }

      const tree: MdFileEntry[] = [];
      for (const folder of BROWSABLE_FOLDERS) {
        const folderPath = path.join(groupPath, folder);
        if (!fs.existsSync(folderPath)) continue;
        const children = scanDirectory(folderPath, groupPath);
        tree.push({ name: folder, path: folder, type: 'folder', children });
      }

      return { group, tree };
    },
  );

  /** Read a file's content */
  fastify.get('/md/groups/:group/file', { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { group } = request.params as { group: string };
      const { path: filePath } = request.query as { path?: string };

      if (!filePath) return reply.code(400).send({ error: 'Missing path query parameter' });
      if (!isPathSafe(filePath)) return reply.code(400).send({ error: 'Invalid path' });
      if (!isInBrowsableFolder(filePath)) return reply.code(403).send({ error: 'Access denied' });

      const fullPath = path.join(GROUPS_DIR, group, filePath);
      if (!fs.existsSync(fullPath)) return reply.code(404).send({ error: 'File not found' });

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const stat = fs.statSync(fullPath);
        return {
          path: filePath,
          content,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      } catch (err) {
        logger.error({ err, group, filePath }, 'Failed to read markdown file');
        return reply.code(500).send({ error: 'Failed to read file' });
      }
    },
  );

  /** Save (overwrite) a file's content */
  fastify.put('/md/groups/:group/file', { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { group } = request.params as { group: string };
      const { path: filePath } = request.query as { path?: string };
      const body = request.body as { content?: string } | undefined;

      if (!filePath) return reply.code(400).send({ error: 'Missing path query parameter' });
      if (!isPathSafe(filePath)) return reply.code(400).send({ error: 'Invalid path' });
      if (!isInBrowsableFolder(filePath)) return reply.code(403).send({ error: 'Access denied' });
      if (body?.content === undefined) return reply.code(400).send({ error: 'Missing content in body' });

      const fullPath = path.join(GROUPS_DIR, group, filePath);

      // Only allow saving to existing files (no arbitrary file creation for security)
      if (!fs.existsSync(fullPath)) return reply.code(404).send({ error: 'File not found' });

      try {
        fs.writeFileSync(fullPath, body.content, 'utf-8');
        const stat = fs.statSync(fullPath);
        logger.info({ group, filePath }, 'Markdown file saved via web UI');
        return { success: true, size: stat.size, modified: stat.mtime.toISOString() };
      } catch (err) {
        logger.error({ err, group, filePath }, 'Failed to save markdown file');
        return reply.code(500).send({ error: 'Failed to save file' });
      }
    },
  );
}
