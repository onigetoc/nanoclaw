/**
 * API Markdown Routes — browse, read, and edit .md files from the web UI.
 *
 * Endpoints:
 *   GET  /md/workspaces                              — list workspaces with their browsable folders
 *   GET  /md/workspaces/:workspace/tree              — file tree for a workspace (dna + workspace .md files)
 *   GET  /md/workspaces/:workspace/file?path=...     — read a markdown file
 *   PUT  /md/workspaces/:workspace/file?path=...     — save a markdown file
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { WORKSPACES_DIR } from './config.js';

interface MdFileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: MdFileEntry[];
  size?: number;
  modified?: string;
}

/** Folders we expose inside each workspace */
const BROWSABLE_FOLDERS = ['dna', 'workspace', 'docs', 'logs', 'uploads', 'downloads', 'conversations', 'tasks', 'skills'];

/** Allowed file extensions for reading/writing */
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.log', '.png', '.jpg', '.jpeg', '.html', '.js', '.ts']);

function isAllowedFile(filePath: string): boolean {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// ── Server-side tree cache (invalidated on write) ──
const TREE_CACHE_TTL = 30_000; // 30s
const treeCache = new Map<string, { data: MdFileEntry[]; timestamp: number }>();

function getCachedTree(workspace: string): MdFileEntry[] | null {
  const entry = treeCache.get(workspace);
  if (entry && Date.now() - entry.timestamp < TREE_CACHE_TTL) return entry.data;
  return null;
}

/** Recursively scan a directory for browsable files (async). */
async function scanDirectory(dirPath: string, relativeTo: string): Promise<MdFileEntry[]> {
  try {
    await fs.access(dirPath);
  } catch {
    return [];
  }

  const entries: MdFileEntry[] = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  // Gather stat promises for files in parallel
  const filePromises: Promise<MdFileEntry | null>[] = [];

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

    if (item.isDirectory()) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const children = await scanDirectory(fullPath, relativeTo);
      entries.push({ name: item.name, path: relPath, type: 'folder', children });
    } else if (item.isFile() && isAllowedFile(item.name)) {
      filePromises.push(
        fs.stat(fullPath).then(stat => ({
          name: item.name,
          path: relPath,
          type: 'file' as const,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        })).catch(() => null),
      );
    }
  }

  const fileResults = await Promise.all(filePromises);
  for (const f of fileResults) {
    if (f) entries.push(f);
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/** Validate that a relative path doesn't escape the workspace directory */
function isPathSafe(relativePath: string): boolean {
  const normalized = path.normalize(relativePath);
  return !normalized.startsWith('..') && !path.isAbsolute(normalized);
}

/** Check that the path starts with one of the browsable folders or is a root-level file */
function isAccessible(relativePath: string): boolean {
  const parts = relativePath.split('/');
  // Root-level file (no subfolder) — allowed if it has an allowed extension
  if (parts.length === 1) return isAllowedFile(relativePath);
  // Otherwise must be inside a browsable folder
  return BROWSABLE_FOLDERS.includes(parts[0]);
}

export function registerMarkdownRoutes(fastify: FastifyInstance, authenticate: any): void {

  /** List all workspaces with their available browsable folders */
  fastify.get('/md/workspaces', { preHandler: authenticate }, async () => {
    try {
      await fs.access(WORKSPACES_DIR);
    } catch {
      return { workspaces: [] };
    }

    const items = await fs.readdir(WORKSPACES_DIR, { withFileTypes: true });
    const workspaceDirs = items.filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'templates');

    const workspaces = await Promise.all(workspaceDirs.map(async d => {
      const workspacePath = path.join(WORKSPACES_DIR, d.name);
      const folderChecks = await Promise.all(
        BROWSABLE_FOLDERS.map(async f => {
          try { await fs.access(path.join(workspacePath, f)); return f; } catch { return null; }
        }),
      );
      return { name: d.name, folders: folderChecks.filter(Boolean) as string[] };
    }));

    return { workspaces };
  });

  /** Get file tree for a specific workspace */
  fastify.get('/md/workspaces/:workspace/tree', { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { workspace } = request.params as { workspace: string };
      const workspacePath = path.join(WORKSPACES_DIR, workspace);

      try {
        await fs.access(workspacePath);
      } catch {
        return reply.code(404).send({ error: 'Workspace not found' });
      }

      // Check server-side cache first
      const cached = getCachedTree(workspace);
      if (cached) return { workspace, tree: cached };

      const tree: MdFileEntry[] = [];

      // Scan root-level files in the workspace (not inside any subfolder)
      const rootItems = await fs.readdir(workspacePath, { withFileTypes: true });
      const rootFilePromises: Promise<MdFileEntry | null>[] = [];
      for (const item of rootItems) {
        if (item.isFile() && isAllowedFile(item.name)) {
          const fullPath = path.join(workspacePath, item.name);
          rootFilePromises.push(
            fs.stat(fullPath).then(stat => ({
              name: item.name,
              path: item.name,
              type: 'file' as const,
              size: stat.size,
              modified: stat.mtime.toISOString(),
            })).catch(() => null),
          );
        }
      }

      const folderScans = BROWSABLE_FOLDERS.map(async folder => {
        const folderPath = path.join(workspacePath, folder);
        try {
          await fs.access(folderPath);
          const children = await scanDirectory(folderPath, workspacePath);
          return { name: folder, path: folder, type: 'folder' as const, children };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(folderScans);
      for (const r of results) {
        if (r) tree.push(r);
      }

      // Add root-level files
      const rootFiles = await Promise.all(rootFilePromises);
      for (const f of rootFiles) {
        if (f) tree.push(f);
      }

      treeCache.set(workspace, { data: tree, timestamp: Date.now() });
      return { workspace, tree };
    },
  );

  /** Read a file's content */
  fastify.get('/md/workspaces/:workspace/file', { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { workspace } = request.params as { workspace: string };
      const { path: filePath } = request.query as { path?: string };

      if (!filePath) return reply.code(400).send({ error: 'Missing path query parameter' });
      if (!isPathSafe(filePath)) return reply.code(400).send({ error: 'Invalid path' });
      if (!isAccessible(filePath)) return reply.code(403).send({ error: 'Access denied' });

      const fullPath = path.join(WORKSPACES_DIR, workspace, filePath);

      try {
        const [content, stat] = await Promise.all([
          fs.readFile(fullPath, 'utf-8'),
          fs.stat(fullPath),
        ]);
        return { path: filePath, content, size: stat.size, modified: stat.mtime.toISOString() };
      } catch (err: any) {
        if (err.code === 'ENOENT') return reply.code(404).send({ error: 'File not found' });
        logger.error({ err, workspace, filePath }, 'Failed to read markdown file');
        return reply.code(500).send({ error: 'Failed to read file' });
      }
    },
  );

  /** Save (overwrite) a file's content */
  fastify.put('/md/workspaces/:workspace/file', { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { workspace } = request.params as { workspace: string };
      const { path: filePath } = request.query as { path?: string };
      const body = request.body as { content?: string } | undefined;

      if (!filePath) return reply.code(400).send({ error: 'Missing path query parameter' });
      if (!isPathSafe(filePath)) return reply.code(400).send({ error: 'Invalid path' });
      if (!isAccessible(filePath)) return reply.code(403).send({ error: 'Access denied' });
      if (body?.content === undefined) return reply.code(400).send({ error: 'Missing content in body' });

      const fullPath = path.join(WORKSPACES_DIR, workspace, filePath);

      try {
        await fs.access(fullPath);
      } catch {
        return reply.code(404).send({ error: 'File not found' });
      }

      try {
        await fs.writeFile(fullPath, body.content, 'utf-8');
        const stat = await fs.stat(fullPath);
        // Invalidate tree cache for this workspace
        treeCache.delete(workspace);
        logger.info({ workspace, filePath }, 'Markdown file saved via web UI');
        return { success: true, size: stat.size, modified: stat.mtime.toISOString() };
      } catch (err) {
        logger.error({ err, workspace, filePath }, 'Failed to save markdown file');
        return reply.code(500).send({ error: 'Failed to save file' });
      }
    },
  );
}
