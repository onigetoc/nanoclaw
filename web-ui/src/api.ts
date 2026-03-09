const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4300';

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  isRegistered: boolean;
  groupInfo: RegisteredGroup | null;
}

export interface RegisteredGroup {
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
  tokens?: { total: number; input: number; output: number; reasoning: number };
  cost?: number;
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
  groupName: string;
  groupFolder: string;
  chatJid: string;
  agentType: string;
  status: 'started' | 'running' | 'completed' | 'error';
  model: string;
  sessionId?: string;
  messageCount: number;
  duration?: number;
  error?: string;
  outputSent: boolean;
}

export interface MonitoringData {
  system: {
    openCodeServerStatus: 'running' | 'stopped' | 'error';
    openCodeServerPort: number;
    activeAgents: number;
    registeredGroups: number;
    isSleeping: boolean;
    uptime: number;
  };
  stats: {
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    byAgent: Record<string, number>;
    byGroup: Record<string, number>;
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
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
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
    const result = await this.request<{ messages: Message[]; hasMore?: boolean }>(
      `/chats/${encodeURIComponent(chatJid)}/messages${query}`,
    );
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
  ): Promise<{ success: boolean; messageId: string; timestamp: string }> {
    const result = await this.request<{
      success: boolean;
      messageId: string;
      timestamp: string;
    }>(`/chats/${encodeURIComponent(chatJid)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, channel: 'web' }),
    });
    return result;
  }

  async uploadFiles(
    chatJid: string,
    files: File[],
  ): Promise<{ success: boolean; files: Array<{ name: string; path: string }> }> {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatJid)}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
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

    const response = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatJid)}/analyze`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Analysis failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async sendAudio(
    chatJid: string,
    audioFile: File,
  ): Promise<{ success: boolean; messageId: string; timestamp: string; transcribedText: string }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('file', audioFile);

    const response = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatJid)}/audio`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getGroups(): Promise<Record<string, RegisteredGroup>> {
    const result = await this.request<{
      groups: Record<string, RegisteredGroup>;
    }>('/groups');
    return result.groups;
  }

  async createGroup(
    name: string,
    folder: string,
  ): Promise<{ success: boolean; jid: string; name: string; folder: string }> {
    const result = await this.request<{
      success: boolean;
      jid: string;
      name: string;
      folder: string;
    }>('/groups', {
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

  async getMonitoring(): Promise<MonitoringData> {
    const result = await this.request<MonitoringData>('/monitoring');
    return result;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const result = await this.request<SystemInfo>('/system/info');
    return result;
  }

  async getAuthProviders(): Promise<ProviderInfo[]> {
    const result = await this.request<{ providers: ProviderInfo[] }>('/auth/providers');
    return result.providers;
  }

  async setAuthProvider(provider: string, key: string): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/provider', {
      method: 'POST',
      body: JSON.stringify({ provider, key }),
    });
  }

  async removeAuthProvider(provider: string): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/provider/remove', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  }

  async getProviders(): Promise<{ providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; provider: string; context_length?: number; pricing?: { prompt?: number; completion?: number } }> }>; popular: string[] }> {
    return this.request('/models/providers');
  }

  async clearModelsCache(): Promise<{ success: boolean; message: string }> {
    return this.request('/models/cache/clear', { method: 'POST' });
  }

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  }

  async restartOpenCodeServer(): Promise<{ success: boolean; message: string }> {
    return this.request('/system/restart-opencode', { method: 'GET' });
  }

  private abortController: AbortController | null = null;
  private messageListeners: ((message: Message) => void)[] = [];
  private connectionListeners: ((status: ConnectionStatus) => void)[] = [];
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private _serverOnline = false;
  private _sseConnected = false;

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
    this.healthInterval = setInterval(() => void this.performHealthCheck(), 5000);
  }

  stopHealthMonitor(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const resp = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
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

  private setSseConnected(connected: boolean): void {
    const changed = this._sseConnected !== connected;
    this._sseConnected = connected;
    if (changed) {
      this.notifyConnectionListeners();
    }
  }

  private notifyConnectionListeners(): void {
    const status: ConnectionStatus = {
      serverOnline: this._serverOnline,
      sseConnected: this._sseConnected,
    };
    this.connectionListeners.forEach((cb) => cb(status));
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.push(callback);
    // Immediately emit current status
    callback({ serverOnline: this._serverOnline, sseConnected: this._sseConnected });
    return () => {
      const idx = this.connectionListeners.indexOf(callback);
      if (idx > -1) this.connectionListeners.splice(idx, 1);
    };
  }

  connectToEvents(): void {
    const token = this.getToken();
    if (!token) return;

    this.disconnectFromEvents();

    this.abortController = new AbortController();

    fetch(`${API_BASE}/events`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: this.abortController.signal,
    })
      .then(async (response) => {
        if (!response.body) return;
        this.setSseConnected(true);
        this.setServerOnline(true);
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
                if (data.type === 'message' && data.content && !data.id?.startsWith('typing_')) {
                  const message: Message = {
                    id: data.id,
                    chat_jid: data.chatJid,
                    sender: data.is_bot_message ? 'bot' : (data.sender || 'user'),
                    sender_name: data.sender_name,
                    content: data.content,
                    timestamp: data.timestamp,
                    is_from_me: data.is_from_me ?? false,
                    is_bot_message: data.is_bot_message ?? false,
                    metadata: data.metadata,
                  };
                  this.messageListeners.forEach((listener) =>
                    listener(message),
                  );
                }
              } catch (e) {
                console.error('Failed to parse SSE message:', e);
              }
            }
          }
        }
        // Stream ended (server closed connection)
        this.setSseConnected(false);
      })
      .catch((err) => {
        this.setSseConnected(false);
        if (err.name !== 'AbortError') {
          console.error('SSE connection error, reconnecting...');
          setTimeout(() => this.connectToEvents(), 5000);
        }
      });
  }

  disconnectFromEvents(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setSseConnected(false);
  }

  onMessage(callback: (message: Message) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      const index = this.messageListeners.indexOf(callback);
      if (index > -1) this.messageListeners.splice(index, 1);
    };
  }
}

export const apiService = new ApiService();
