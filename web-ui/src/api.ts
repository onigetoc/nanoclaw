import { WebSocketClient } from './websocket.js';
import type { WsConnectionStatus, StepEvent, ExecutionUpdateEvent } from './websocket.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4300';

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  isRegistered: boolean;
  workspaceInfo: RegisteredWorkspace | null;
}

export interface RegisteredWorkspace {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
}

export interface MessageMetadata {
  modelID?: string;
  providerID?: string;
  mode?: string;
  agent?: string;
  tokens?: {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  cost?: number;
  reasoning?: string;
}

export interface Message {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
  metadata?: MessageMetadata;
  attachments?: Array<{ name: string; type: string; size: number }>;
}

export interface ConnectionStatus {
  serverOnline: boolean;
  sseConnected: boolean;
}

export interface ApiConfig {
  assistantName: string;
  apiPort: number;
}

export interface ApiToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

export interface AgentExecution {
  id: string;
  timestamp: string;
  workspaceName: string;
  workspaceFolder: string;
  chatJid: string;
  agentType: string;
  status: 'started' | 'running' | 'completed' | 'error';
  model: string;
  sessionId?: string;
  messageCount: number;
  duration?: number;
  error?: string;
  outputSent: boolean;
  steps?: ExecutionStep[];
}

export interface ExecutionStep {
  timestamp: string;
  phase:
    | 'queue'
    | 'init'
    | 'context'
    | 'model'
    | 'fallback'
    | 'response'
    | 'error'
    | 'done'
    | 'tool';
  message: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface ScheduledTaskInfo {
  id: string;
  workspace_folder: string;
  workspace_name: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'workspace' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLogEntry {
  id: number;
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
  log_file: string | null;
}

export interface MonitoringData {
  system: {
    openCodeServerStatus: 'running' | 'stopped' | 'error';
    openCodeServerPort: number;
    activeAgents: number;
    registeredWorkspaces: number;
    isSleeping: boolean;
    uptime: number;
  };
  stats: {
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    byAgent: Record<string, number>;
    byWorkspace: Record<string, number>;
  };
  active: AgentExecution[];
  recent: AgentExecution[];
  sessions: Record<string, string>;
  systemInfo?: SystemInfo;
}

export interface SystemInfo {
  platform: string;
  platformName: string;
  containerMode: 'apple-container' | 'docker' | 'direct';
  containerAvailable: boolean;
  dockerInstalled?: boolean;
  dockerRunning?: boolean;
  dockerFunctional?: boolean;
  securityLevel: 'high' | 'medium' | 'low';
  recommendation?: string;
  nodeVersion?: string;
  opencodeVersion?: string;
  opencodeFunctional?: boolean;
}

export interface ProviderInfo {
  provider: string;
  label: string;
  placeholder: string;
  configured: boolean;
}

export interface ScannedKey {
  envVar: string;
  provider: string;
  label: string;
  masked: string;
  alreadyConfigured: boolean;
}

export interface EnvVarEntry {
  name: string;
  label: string;
  createdAt: string;
}

export interface StatusEvent {
  chatJid: string;
  status:
    | 'processing'
    | 'connecting'
    | 'waiting'
    | 'responding'
    | 'error'
    | 'done'
    | 'queued';
  detail?: string;
  timestamp: string;
}

export interface MdFileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: MdFileEntry[];
  size?: number;
  modified?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  source: 'project' | 'project-claude' | 'global' | 'global-claude';
  path: string;
}

export interface AgentInfo {
  name: string;
  description: string;
  mode: string;
  source: 'config' | 'file' | 'registry';
}

export interface PluginInfo {
  name: string;
  version?: string;
}

export interface McpServerInfo {
  name: string;
  command?: string;
  disabled: boolean;
}

export interface OpenCodeStatus {
  skills: SkillInfo[];
  agents: AgentInfo[];
  plugins: PluginInfo[];
  mcpServers: McpServerInfo[];
}

// ── Activity Event Panel types ───────────────────────────────────────────────

export interface ActivityEvent {
  ts: number;
  type: string;
  properties: Record<string, unknown>;
  icon: string;
  label: string;
  category: 'session' | 'tool' | 'file' | 'command' | 'error' | 'message' | 'other';
  chatJid?: string;
  folder?: string;
}

export interface ActivityFile {
  filename: string;
  size: number;
  modified: string;
}

export interface ActivityStatsData {
  totalEvents: number;
  duration: number;
  filesEdited: string[];
  commandsRun: number;
  errors: number;
  toolsUsed: Map<string, number>;
  isActive: boolean;
}

class ApiService {
  private token: string | null = null;

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('eureclaw_token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('eureclaw_token');
    }
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem('eureclaw_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true,
  ): Promise<T> {
    const token = this.getToken();
    if (requireAuth && !token) {
      throw new Error('Not authenticated');
    }

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    // Only set Content-Type: application/json when there's actually a body
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (token && requireAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async createToken(name?: string): Promise<ApiToken> {
    const result = await this.request<ApiToken>(
      '/tokens',
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      },
      false,
    );
    return result;
  }

  async getTokens(): Promise<
    Array<{
      id: string;
      name: string;
      createdAt: string;
      lastUsed: string | null;
      active: boolean;
    }>
  > {
    const result = await this.request<{
      tokens: Array<{
        id: string;
        name: string;
        createdAt: string;
        lastUsed: string | null;
        active: boolean;
      }>;
    }>('/tokens');
    return result.tokens;
  }

  async revokeToken(id: string): Promise<void> {
    await this.request(`/tokens/${id}`, { method: 'DELETE' });
  }

  async addChatToToken(tokenId: string, chatJid: string): Promise<void> {
    await this.request(`/tokens/${tokenId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ chatJid }),
    });
  }

  async getTokenChats(tokenId: string): Promise<ChatInfo[]> {
    const result = await this.request<{ chats: ChatInfo[] }>(
      `/tokens/${tokenId}/chats`,
    );
    return result.chats;
  }

  async getChats(): Promise<ChatInfo[]> {
    const result = await this.request<{ chats: ChatInfo[] }>('/chats');
    return result.chats;
  }

  async getMessages(
    chatJid: string,
    options?: { since?: string; limit?: number; before?: string },
  ): Promise<{ messages: Message[]; hasMore?: boolean }> {
    const params = new URLSearchParams();
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', options.before);
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request<{
      messages: Message[];
      hasMore?: boolean;
    }>(`/chats/${encodeURIComponent(chatJid)}/messages${query}`);
    const messages = result.messages.map((m) => ({
      ...m,
      is_from_me: !!m.is_from_me,
      is_bot_message: !!m.is_bot_message,
      metadata: m.metadata,
    }));
    return { messages, hasMore: result.hasMore };
  }

  async sendMessage(
    chatJid: string,
    content: string,
    model?: string,
    agent?: string,
  ): Promise<{ success: boolean; messageId: string; timestamp: string }> {
    const body: Record<string, unknown> = {
      content,
      channel: 'web',
    };

    if (model) body.model = model;
    if (agent) body.agent = agent;

    const result = await this.request<{
      success: boolean;
      messageId: string;
      timestamp: string;
    }>(`/chats/${encodeURIComponent(chatJid)}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return result;
  }

  async uploadFiles(
    chatJid: string,
    files: File[],
  ): Promise<{
    success: boolean;
    files: Array<{ name: string; path: string }>;
  }> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(
      `${API_BASE}/chats/${encodeURIComponent(chatJid)}/upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async analyzeMedia(
    chatJid: string,
    file: File,
  ): Promise<{ success: boolean; type: string; description: string }> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
      `${API_BASE}/chats/${encodeURIComponent(chatJid)}/analyze`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Analysis failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /** Persist reasoning/thinking text into the message's metadata in SQLite */
  async saveMessageReasoning(messageId: string, reasoning: string): Promise<void> {
    const token = this.getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/messages/${encodeURIComponent(messageId)}/reasoning`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reasoning }),
      });
    } catch {
      // Best-effort — don't break the UI if this fails
    }
  }

  async sendAudio(
    chatJid: string,
    audioFile: File,
  ): Promise<{
    success: boolean;
    messageId: string;
    timestamp: string;
    transcribedText: string;
  }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('file', audioFile);

    const response = await fetch(
      `${API_BASE}/chats/${encodeURIComponent(chatJid)}/audio`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getWorkspaces(): Promise<Record<string, RegisteredWorkspace>> {
    const result = await this.request<{
      workspaces: Record<string, RegisteredWorkspace>;
    }>('/workspaces');
    return result.workspaces;
  }

  async createWorkspace(
    name: string,
    folder: string,
  ): Promise<{ success: boolean; jid: string; name: string; folder: string }> {
    const result = await this.request<{
      success: boolean;
      jid: string;
      name: string;
      folder: string;
    }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, folder }),
    });
    return result;
  }

  async getSessions(): Promise<Record<string, string>> {
    const result = await this.request<{ sessions: Record<string, string> }>(
      '/sessions',
    );
    return result.sessions;
  }

  async getConfig(): Promise<ApiConfig> {
    const result = await this.request<ApiConfig>('/config');
    return result;
  }

  async getAvailableAgents(): Promise<{
    agents: Array<{ id: string; name: string; description: string }>;
  }> {
    const result = await this.request<{
      agents: Array<{ id: string; name: string; description: string }>;
    }>('/agents');
    return result;
  }

  async getMonitoring(): Promise<MonitoringData> {
    const result = await this.request<MonitoringData>('/monitoring');
    return result;
  }

  async getExecutionDetail(id: string): Promise<AgentExecution | null> {
    try {
      const result = await this.request<AgentExecution>(
        `/monitoring/executions/${id}`,
      );
      return result;
    } catch {
      return null;
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const result = await this.request<SystemInfo>('/system/info');
    return result;
  }

  async getOpenCodeStatus(): Promise<OpenCodeStatus> {
    const result = await this.request<OpenCodeStatus>('/opencode/status');
    return result;
  }

  async toggleMcpServer(name: string, enabled: boolean): Promise<void> {
    await this.request<{ success: boolean }>(`/opencode/mcp/${encodeURIComponent(name)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  async getAuthProviders(): Promise<ProviderInfo[]> {
    const result = await this.request<{ providers: ProviderInfo[] }>(
      '/auth/providers',
    );
    return result.providers;
  }

  async scanApiKeys(): Promise<ScannedKey[]> {
    const result = await this.request<{ keys: ScannedKey[] }>('/auth/scan');
    return result.keys;
  }

  async addScannedKey(
    envVar: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/scan/add', {
      method: 'POST',
      body: JSON.stringify({ envVar }),
    });
  }

  async setAuthProvider(
    provider: string,
    key: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/provider', {
      method: 'POST',
      body: JSON.stringify({ provider, key }),
    });
  }

  async removeAuthProvider(
    provider: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/provider/remove', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  }

  // --- Environment Variables ---

  async getEnvVars(): Promise<EnvVarEntry[]> {
    const result = await this.request<{ variables: EnvVarEntry[] }>(
      '/envvar/list',
    );
    return result.variables;
  }

  async setEnvVar(
    name: string,
    value: string,
    label?: string,
  ): Promise<{ success: boolean; name: string; message: string }> {
    return this.request('/envvar/set', {
      method: 'POST',
      body: JSON.stringify({ name, value, label }),
    });
  }

  async removeEnvVar(
    name: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/envvar/remove', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getProviders(): Promise<{
    providers: Array<{
      id: string;
      name: string;
      models: Array<{
        id: string;
        name: string;
        provider: string;
        context_length?: number;
        pricing?: { prompt?: number; completion?: number };
      }>;
    }>;
    popular: string[];
  }> {
    return this.request('/models/providers');
  }

  /** Fetch real providers/models from the running OpenCode server (proxied via EureClaw API). */
  async getOpenCodeProviders(): Promise<{
    providers: Array<{
      id: string;
      name: string;
      models: Record<
        string,
        {
          id: string;
          name: string;
          cost: { input: number; output: number };
          limit: { context: number; output: number };
        }
      >;
    }>;
  }> {
    return this.request('/opencode/providers');
  }

  async clearModelsCache(): Promise<{ success: boolean; message: string }> {
    return this.request('/models/cache/clear', { method: 'POST' });
  }

  // === Scheduled Tasks / Cron Jobs ===

  async getTasks(workspace?: string): Promise<ScheduledTaskInfo[]> {
    const query = workspace
      ? `?workspace=${encodeURIComponent(workspace)}`
      : '';
    const result = await this.request<{ tasks: ScheduledTaskInfo[] }>(
      `/tasks${query}`,
    );
    return result.tasks;
  }

  async getTask(
    id: string,
  ): Promise<{ task: ScheduledTaskInfo; logs: TaskRunLogEntry[] }> {
    return this.request(`/tasks/${encodeURIComponent(id)}`);
  }

  async getRunLog(
    runId: number,
  ): Promise<{
    content: string | null;
    truncated?: boolean;
    path?: string;
    message?: string;
  }> {
    return this.request(`/tasks/run-log/${runId}`);
  }

  async createTask(data: {
    workspace_folder: string;
    chat_jid: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    context_mode?: string;
  }): Promise<{ success: boolean; id: string }> {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(
    id: string,
    data: {
      prompt?: string;
      schedule_type?: string;
      schedule_value?: string;
      workspace_folder?: string;
    },
  ): Promise<{ success: boolean }> {
    return this.request(`/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id: string): Promise<{ success: boolean }> {
    return this.request(`/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async pauseTask(id: string): Promise<{ success: boolean }> {
    return this.request(`/tasks/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
    });
  }

  async resumeTask(id: string): Promise<{ success: boolean }> {
    return this.request(`/tasks/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
    });
  }

  async triggerTask(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/tasks/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    });
  }

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  }

  async restartOpenCodeServer(): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.request('/system/restart-opencode', { method: 'GET' });
  }

  // === Markdown File Browser ===

  async getMdWorkspaces(): Promise<{
    workspaces: Array<{ name: string; folders: string[] }>;
  }> {
    return this.request('/md/workspaces');
  }

  async getMdTree(
    workspace: string,
  ): Promise<{ workspace: string; tree: MdFileEntry[] }> {
    return this.request(`/md/workspaces/${encodeURIComponent(workspace)}/tree`);
  }

  async getMdFile(
    workspace: string,
    filePath: string,
  ): Promise<{
    path: string;
    content: string;
    size: number;
    modified: string;
  }> {
    return this.request(
      `/md/workspaces/${encodeURIComponent(workspace)}/file?path=${encodeURIComponent(filePath)}`,
    );
  }

  async saveMdFile(
    workspace: string,
    filePath: string,
    content: string,
  ): Promise<{ success: boolean; size: number; modified: string }> {
    return this.request(
      `/md/workspaces/${encodeURIComponent(workspace)}/file?path=${encodeURIComponent(filePath)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ content }),
      },
    );
  }

  async getMdFileBlob(workspace: string, filePath: string): Promise<Blob> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(
      `${API_BASE}/md/workspaces/${encodeURIComponent(workspace)}/raw?path=${encodeURIComponent(filePath)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.blob();
  }

  async getFileBlobByRelativeUrl(relativeUrl: string): Promise<Blob> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const normalized = relativeUrl.startsWith('/')
      ? relativeUrl
      : `/${relativeUrl}`;
    const response = await fetch(`${API_BASE}${normalized}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.blob();
  }

  async getWorkspaceDownloadBlob(
    workspaceFolder: string,
    fileId: string,
  ): Promise<Blob> {
    return this.getFileBlobByRelativeUrl(
      `/files/${encodeURIComponent(workspaceFolder)}/${encodeURIComponent(fileId)}`,
    );
  }

  // ── Activity Event Panel ─────────────────────────────────────────────────

  private activityStreamController: AbortController | null = null;
  private activityEventListeners: Set<(event: ActivityEvent) => void> = new Set();

  async getActivityFiles(jid: string): Promise<ActivityFile[]> {
    const data = await this.request<{ files: ActivityFile[] }>(`/chats/${encodeURIComponent(jid)}/activity`);
    return data.files;
  }

  async getActivityEvents(
    jid: string,
    filename: string,
    options?: { limit?: number; since?: number },
  ): Promise<ActivityEvent[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.since) params.set('since', String(options.since));
    const qs = params.toString();
    const url = `/chats/${encodeURIComponent(jid)}/activity/${encodeURIComponent(filename)}${qs ? `?${qs}` : ''}`;
    const data = await this.request<{ events: ActivityEvent[] }>(url);
    return data.events;
  }

  connectToActivityStream(jid: string): void {
    const token = this.getToken();
    if (!token) return;

    this.disconnectFromActivityStream();

    this.activityStreamController = new AbortController();
    const url = `${API_BASE}/chats/${encodeURIComponent(jid)}/activity/stream`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: this.activityStreamController.signal,
    })
      .then(async (response) => {
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as ActivityEvent;
                for (const cb of this.activityEventListeners) cb(data);
              } catch { /* ignore malformed */ }
            }
          }
        }
        this.activityStreamController = null;
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Activity stream error:', err);
        }
        this.activityStreamController = null;
      });
  }

  disconnectFromActivityStream(): void {
    if (this.activityStreamController) {
      this.activityStreamController.abort();
      this.activityStreamController = null;
    }
  }

  onActivityEvent(callback: (event: ActivityEvent) => void): () => void {
    this.activityEventListeners.add(callback);
    return () => { this.activityEventListeners.delete(callback); };
  }

  private wsClient: WebSocketClient;
  private connectionListeners: ((status: ConnectionStatus) => void)[] = [];
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private _serverOnline = false;
  private _wsConnected = false;

  constructor() {
    this.wsClient = new WebSocketClient(API_BASE);

    // Bridge WsConnectionStatus → ConnectionStatus
    this.wsClient.onConnectionChange((wsStatus: WsConnectionStatus) => {
      this.setWsConnected(wsStatus.connected);
    });
  }

  /** Current server online status */
  get serverOnline(): boolean {
    return this._serverOnline;
  }

  /** Start periodic health checks (call once after setting token) */
  startHealthMonitor(): void {
    this.stopHealthMonitor();
    // Immediate first check
    void this.performHealthCheck();
    // Poll every 5 seconds
    this.healthInterval = setInterval(
      () => void this.performHealthCheck(),
      5000,
    );
  }

  stopHealthMonitor(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const resp = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (resp.ok) {
        this.setServerOnline(true);
      } else {
        this.setServerOnline(false);
      }
    } catch {
      this.setServerOnline(false);
    }
  }

  private setServerOnline(online: boolean): void {
    const changed = this._serverOnline !== online;
    this._serverOnline = online;
    if (changed) {
      this.notifyConnectionListeners();
    }
  }

  private setWsConnected(connected: boolean): void {
    const changed = this._wsConnected !== connected;
    this._wsConnected = connected;
    if (changed) {
      this.notifyConnectionListeners();
    }
  }

  private notifyConnectionListeners(): void {
    const status: ConnectionStatus = {
      serverOnline: this._serverOnline,
      sseConnected: this._wsConnected,
    };
    this.connectionListeners.forEach((cb) => cb(status));
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.push(callback);
    // Immediately emit current status
    callback({
      serverOnline: this._serverOnline,
      sseConnected: this._wsConnected,
    });
    return () => {
      const idx = this.connectionListeners.indexOf(callback);
      if (idx > -1) this.connectionListeners.splice(idx, 1);
    };
  }

  connectToEvents(): void {
    const token = this.getToken();
    if (!token) return;

    this.wsClient.connect(token);
  }

  disconnectFromEvents(): void {
    this.wsClient.disconnect();
  }

  onMessage(callback: (message: Message) => void): () => void {
    return this.wsClient.onMessage(callback);
  }

  onStatus(callback: (event: StatusEvent) => void): () => void {
    return this.wsClient.onStatus(callback);
  }

  onStep(callback: (event: StepEvent) => void): () => void {
    return this.wsClient.onStep(callback);
  }

  onExecutionUpdate(callback: (event: ExecutionUpdateEvent) => void): () => void {
    return this.wsClient.onExecutionUpdate(callback);
  }

  private chatStreamController: AbortController | null = null;
  private deltaListeners: ((content: string, partID: string, chatJid: string, folder: string) => void)[] = [];

  connectToChatStream(sessionId?: string): void {
    const token = this.getToken();
    if (!token) return;

    this.disconnectFromChatStream();

    this.chatStreamController = new AbortController();
    const url = sessionId
      ? `${API_BASE}/chat/stream?sessionId=${encodeURIComponent(sessionId)}`
      : `${API_BASE}/chat/stream`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: this.chatStreamController.signal,
    })
      .then(async (response) => {
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'delta' && data.content) {
                  this.deltaListeners.forEach((cb) => cb(data.content, data.partID || '', data.chatJid || '', data.folder || ''));
                } else if (data.type === 'error') {
                  console.error('Chat stream error:', data.message);
                }
              } catch (e) {
                console.error('Failed to parse SSE message:', e);
              }
            }
          }
        }
        this.chatStreamController = null;
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Chat stream error:', err);
        }
        this.chatStreamController = null;
      });
  }

  disconnectFromChatStream(): void {
    if (this.chatStreamController) {
      this.chatStreamController.abort();
      this.chatStreamController = null;
    }
  }

  onDelta(callback: (content: string, partID: string, chatJid: string, folder: string) => void): () => void {
    this.deltaListeners.push(callback);
    return () => {
      const index = this.deltaListeners.indexOf(callback);
      if (index > -1) this.deltaListeners.splice(index, 1);
    };
  }
}

export const apiService = new ApiService();
