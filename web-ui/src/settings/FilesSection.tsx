import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Download, Copy, Save, Pencil, RefreshCw, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { preserveParagraphBreaks } from '../utils/message-utils';
import { apiService, type MdFileEntry } from '../api';
import { useTokenCount } from '../hooks/useTokenCount';

interface WorkspaceInfo { name: string; folders: string[] }
interface FilesSectionProps { isDark: boolean }
interface CacheEntry<T> { data: T; timestamp: number }

/** Folder labels for display */
const FOLDER_LABELS: Record<string, string> = {
  memory: '🧠 Memory', workspace: '📁 Workspace', docs: '📄 Docs',
  logs: '📋 Logs', uploads: '📤 Uploads', downloads: '📥 Downloads',
  conversations: '💬 Conversations', tasks: '✅ Tasks', skills: '🛠️ Skills',
};

// ── Module-level cache (survives component unmount) ──
const TREE_TTL = 60_000;   // 60s for trees
const FILE_TTL = 30_000;   // 30s for file content
const treeCache = new Map<string, CacheEntry<MdFileEntry[]>>();
const fileCache = new Map<string, CacheEntry<{ content: string; modified: string; size: number }>>();
let cachedWorkspaces: CacheEntry<WorkspaceInfo[]> | null = null;
let cachedSelectedWorkspace = '';
let cachedSelectedFile: string | null = null;
let cachedExpandedFolders: Set<string> = new Set(['memory']);

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttl) return entry.data;
  return null;
}

function extractDownloadFileId(filePath: string): string | null {
  const match = filePath.match(/(?:^|\/)workspace\/downloads\/(\d+-[a-z0-9]+)_.+$/i);
  return match ? match[1] : null;
}

export default function FilesSection({ isDark }: FilesSectionProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>(cachedWorkspaces?.data ?? []);
  const [selectedWorkspace, setSelectedWorkspace] = useState(cachedSelectedWorkspace);
  const [tree, setTree] = useState<MdFileEntry[]>(() => {
    if (cachedSelectedWorkspace) return getCached(treeCache, cachedSelectedWorkspace, TREE_TTL) ?? [];
    return [];
  });
  const [selectedFile, setSelectedFile] = useState<string | null>(cachedSelectedFile);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fileModified, setFileModified] = useState('');
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(cachedExpandedFolders);
  const [error, setError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const initDone = useRef(false);

  const hasChanges = fileContent !== originalContent;
  const isImageFile = !!selectedFile && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(selectedFile);
  const isHtmlFile = !!selectedFile && /\.(html?)$/i.test(selectedFile);

  const clearBlobUrl = useCallback(() => {
    setFileBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // Token count (GPT tokenizer) — lazy-loaded, debounced
  const tokenCount = useTokenCount(fileContent);

  // Persist selections to module-level vars on change
  useEffect(() => { cachedSelectedWorkspace = selectedWorkspace; }, [selectedWorkspace]);
  useEffect(() => { cachedSelectedFile = selectedFile; }, [selectedFile]);
  useEffect(() => { cachedExpandedFolders = expandedFolders; }, [expandedFolders]);

  // Load workspaces on mount (with cache)
  useEffect(() => {
    if (cachedWorkspaces && Date.now() - cachedWorkspaces.timestamp < TREE_TTL) {
      setWorkspaces(cachedWorkspaces.data);
      if (!selectedWorkspace && cachedWorkspaces.data.length > 0) {
        setSelectedWorkspace(cachedWorkspaces.data[0].name);
      }
      return;
    }
    apiService.getMdWorkspaces().then(data => {
      const wsData = data.workspaces;
      cachedWorkspaces = { data: wsData, timestamp: Date.now() };
      setWorkspaces(wsData);
      if (!selectedWorkspace && wsData.length > 0) {
        setSelectedWorkspace(wsData[0].name);
      }
    }).catch(() => setError('Failed to load workspaces'));
  }, []);

  // Load tree when workspace changes (with cache)
  const loadTree = useCallback(async (workspace: string, force = false) => {
    if (!workspace) return;
    if (!force) {
      const cached = getCached(treeCache, workspace, TREE_TTL);
      if (cached) { setTree(cached); return; }
    }
    setTreeLoading(true);
    try {
      const data = await apiService.getMdTree(workspace);
      treeCache.set(workspace, { data: data.tree, timestamp: Date.now() });
      setTree(data.tree);
      if (!cachedExpandedFolders.size) setExpandedFolders(new Set(['memory']));
    } catch {
      setError('Failed to load file tree');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
    };
  }, [fileBlobUrl]);

  useEffect(() => {
    if (!selectedWorkspace) return;
    // On first mount, restore cached file if available
    if (!initDone.current && cachedSelectedFile) {
      initDone.current = true;
      const cachedFile = getCached(fileCache, `${selectedWorkspace}:${cachedSelectedFile}`, FILE_TTL);
      if (cachedFile) {
        setFileContent(cachedFile.content);
        setOriginalContent(cachedFile.content);
        setFileModified(cachedFile.modified);
      }
      void loadTree(selectedWorkspace);
      return;
    }
    initDone.current = true;
    clearBlobUrl();
    setSelectedFile(null);
    setFileContent('');
    setOriginalContent('');
    setIsEditing(false);
    void loadTree(selectedWorkspace);
  }, [selectedWorkspace, loadTree, clearBlobUrl]);

  const openFile = async (filePath: string) => {
    if (hasChanges && !confirm('You have unsaved changes. Discard?')) return;
    setError(null);
    clearBlobUrl();

    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filePath)) {
      setSelectedFile(filePath);
      setFileContent('');
      setOriginalContent('');
      setIsEditing(false);
      setLoading(true);
      try {
        let blob: Blob;
        try {
          // Preferred path when backend exposes /md/.../raw
          blob = await apiService.getMdFileBlob(selectedWorkspace, filePath);
        } catch {
          // Fallback for separate API deployments: load from /files endpoint if this image is in workspace/downloads
          const fileId = extractDownloadFileId(filePath);
          if (fileId) {
            blob = await apiService.getWorkspaceDownloadBlob(selectedWorkspace, fileId);
          } else {
            // Last fallback: some backends return a URL/path in content instead of bytes
            const data = await apiService.getMdFile(selectedWorkspace, filePath);
            const hinted = data.content.trim();
            if (hinted.startsWith('/')) {
              blob = await apiService.getFileBlobByRelativeUrl(hinted);
            } else {
              throw new Error('Image endpoint unavailable');
            }
          }
        }
        const url = URL.createObjectURL(blob);
        setFileBlobUrl(url);
      } catch {
        setError('Failed to load image');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Check file cache first
    const cacheKey = `${selectedWorkspace}:${filePath}`;
    const cached = getCached(fileCache, cacheKey, FILE_TTL);
    if (cached) {
      setSelectedFile(filePath);
      setFileContent(cached.content);
      setOriginalContent(cached.content);
      setFileModified(cached.modified);
      setIsEditing(false);
      return;
    }
    setSelectedFile(filePath);
    setFileContent('');
    setOriginalContent('');
    setIsEditing(false);
    setLoading(true);
    try {
      const data = await apiService.getMdFile(selectedWorkspace, filePath);
      fileCache.set(cacheKey, { data: { content: data.content, modified: data.modified, size: data.size }, timestamp: Date.now() });
      setFileContent(data.content);
      setOriginalContent(data.content);
      setFileModified(data.modified);
    } catch {
      setError('Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiService.saveMdFile(selectedWorkspace, selectedFile, fileContent);
      setOriginalContent(fileContent);
      setFileModified(result.modified);
      setIsEditing(false);
      // Update file cache + invalidate tree cache (size may have changed)
      const cacheKey = `${selectedWorkspace}:${selectedFile}`;
      fileCache.set(cacheKey, { data: { content: fileContent, modified: result.modified, size: result.size }, timestamp: Date.now() });
      treeCache.delete(selectedWorkspace);
    } catch {
      setError('Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    if (!selectedFile) return;
    if (isImageFile && fileBlobUrl) {
      const a = document.createElement('a');
      a.href = fileBlobUrl;
      a.download = selectedFile.split('/').pop() || 'image';
      a.click();
      return;
    }
    const mimeType = isHtmlFile ? 'text/html' : 'text/markdown';
    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.split('/').pop() || 'file.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const bg = isDark ? 'bg-zinc-900' : 'bg-white';
  const border = isDark ? 'border-zinc-700' : 'border-zinc-200';
  const textMuted = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const textMain = isDark ? 'text-zinc-100' : 'text-zinc-900';
  const hoverBg = isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100';
  const activeBg = isDark ? 'bg-zinc-700' : 'bg-zinc-100';

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left panel: file tree */}
      <div className={`w-64 shrink-0 rounded-lg border ${border} ${bg} flex flex-col`}>
        {/* Workspace selector */}
        <div className={`border-b ${border} p-3`}>
          <select
            value={selectedWorkspace}
            onChange={e => setSelectedWorkspace(e.target.value)}
            className={`w-full rounded-md border px-2 py-1.5 text-sm ${border} ${isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-white text-zinc-900'}`}
          >
            {workspaces.map(g => (
              <option key={g.name} value={g.name}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Tree */}
        <div className={`flex-1 overflow-y-auto p-2 ${isDark ? 'bg-zinc-800/50' : ''}`}>
          {treeLoading ? (
            <div className="flex flex-col gap-2 p-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className={`h-5 w-3/4 animate-pulse rounded ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
                  <div className={`ml-4 h-4 w-2/3 animate-pulse rounded ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                  <div className={`ml-4 h-4 w-1/2 animate-pulse rounded ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                </div>
              ))}
              <p className={`mt-2 text-center text-xs ${textMuted}`}>Loading files...</p>
            </div>
          ) : tree.length === 0 ? (
            <div className={`flex h-full items-center justify-center text-xs ${textMuted}`}>No files found</div>
          ) : (
            tree.map(folder => (
              <TreeNode
                key={folder.path}
                entry={folder}
                depth={0}
                selectedFile={selectedFile}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
                onSelectFile={openFile}
                isDark={isDark}
                hoverBg={hoverBg}
                activeBg={activeBg}
                textMuted={textMuted}
              />
            ))
          )}
        </div>

        {/* Refresh (force bypass cache) */}
        <div className={`border-t ${border} p-2`}>
          <button
            onClick={() => loadTree(selectedWorkspace, true)}
            className={`flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${textMuted} ${hoverBg}`}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Right panel: file viewer/editor */}
      <div className={`flex-1 rounded-lg border ${border} ${bg} flex min-w-0 flex-col`}>
        {selectedFile ? (
          <>
            {/* Toolbar */}
            <div className={`flex items-center justify-between border-b ${border} px-4 py-2`}>
              <div className="flex items-center gap-2 min-w-0">
                <FileText className={`h-4 w-4 shrink-0 ${textMuted}`} />
                <span className={`text-sm font-medium truncate ${textMain}`}>{selectedFile}</span>
                {!isImageFile && hasChanges && <span className="text-xs text-amber-400">● unsaved</span>}
              </div>
              <div className="flex items-center gap-1">
                {isImageFile ? (
                  <button onClick={downloadFile} title="Download"
                    className={`rounded-md p-1.5 ${textMuted} ${hoverBg}`}><Download className="h-3.5 w-3.5" /></button>
                ) : isEditing ? (
                  <>
                    <button onClick={() => { setIsEditing(false); setFileContent(originalContent); }}
                      className={`rounded-md px-2 py-1 text-xs ${textMuted} ${hoverBg}`}>Cancel</button>
                    <button onClick={saveFile} disabled={saving || !hasChanges}
                      className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">
                      <Save className="h-3 w-3" /> {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsEditing(true)} title="Edit"
                      className={`rounded-md p-1.5 ${textMuted} ${hoverBg}`}><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={copyContent} title="Copy"
                      className={`rounded-md p-1.5 ${textMuted} ${hoverBg}`}>
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={downloadFile} title="Download"
                      className={`rounded-md p-1.5 ${textMuted} ${hoverBg}`}><Download className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            </div>

            {/* Content area */}
            <div className={`flex-1 overflow-y-auto ${isDark ? 'bg-zinc-800/50' : ''}`}>
              {loading ? (
                <div className={`flex h-full items-center justify-center ${textMuted}`}>Loading...</div>
              ) : isImageFile ? (
                <div className="flex h-full items-center justify-center p-4">
                  {fileBlobUrl ? (
                    <img
                      src={fileBlobUrl}
                      alt={selectedFile}
                      className="max-h-full max-w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className={`${textMuted}`}>Unable to display image</div>
                  )}
                </div>
              ) : isEditing ? (
                <textarea
                  value={fileContent}
                  onChange={e => setFileContent(e.target.value)}
                  className={`h-full w-full resize-none border-0 p-4 font-mono text-sm focus:outline-none ${isDark ? 'bg-zinc-800/50 text-zinc-100' : 'bg-white text-zinc-900'}`}
                  spellCheck={false}
                />
              ) : isHtmlFile ? (
                <div className="h-full p-3">
                  <iframe
                    title={`HTML preview: ${selectedFile}`}
                    srcDoc={fileContent}
                    sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-scripts"
                    className={`h-full w-full rounded-md border ${border} ${isDark ? 'bg-white' : 'bg-white'}`}
                  />
                </div>
              ) : (
                <div className={`prose prose-base max-w-none p-4 ${isDark ? 'prose-invert' : ''}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{preserveParagraphBreaks(fileContent)}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* Footer */}
            {fileModified && !isImageFile && (
              <div className={`flex items-center justify-between border-t ${border} px-4 py-1.5 text-[11px] ${textMuted}`}>
                <span>Last modified: {new Date(fileModified).toLocaleString()}</span>
                {!isHtmlFile && tokenCount > 0 && <span>Tokens: {tokenCount.toLocaleString()} (GPT)</span>}
              </div>
            )}
          </>
        ) : (
          <div className={`flex h-full flex-col items-center justify-center gap-2 ${textMuted}`}>
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a file to view</p>
          </div>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-3 font-bold">×</button>
        </div>
      )}
    </div>
  );
}

/** Recursive tree node component */
function TreeNode({
  entry, depth, selectedFile, expandedFolders, onToggleFolder, onSelectFile,
  isDark, hoverBg, activeBg, textMuted,
}: {
  entry: MdFileEntry; depth: number; selectedFile: string | null;
  expandedFolders: Set<string>; onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void; isDark: boolean;
  hoverBg: string; activeBg: string; textMuted: string;
}) {
  const isFolder = entry.type === 'folder';
  const isExpanded = expandedFolders.has(entry.path);
  const isSelected = selectedFile === entry.path;
  const paddingLeft = 8 + depth * 16;

  const label = depth === 0 ? (FOLDER_LABELS[entry.name] || entry.name) : entry.name;

  if (isFolder) {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(entry.path)}
          className={`flex w-full items-center gap-1.5 rounded-md py-1 text-sm ${hoverBg} ${depth === 0 ? 'font-medium' : ''}`}
          style={{ paddingLeft }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {isExpanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
          <span className="truncate">{label}</span>
          {entry.children && <span className={`ml-auto pr-2 text-[10px] ${textMuted}`}>{entry.children.filter(c => c.type === 'file').length}</span>}
        </button>
        {isExpanded && entry.children?.map(child => (
          <TreeNode key={child.path} entry={child} depth={depth + 1} selectedFile={selectedFile}
            expandedFolders={expandedFolders} onToggleFolder={onToggleFolder} onSelectFile={onSelectFile}
            isDark={isDark} hoverBg={hoverBg} activeBg={activeBg} textMuted={textMuted} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(entry.path)}
      className={`flex w-full items-center gap-1.5 rounded-md py-1 text-sm ${isSelected ? activeBg : hoverBg}`}
      style={{ paddingLeft }}
    >
      <FileText className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
