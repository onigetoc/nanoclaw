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

export interface Message {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
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

  async getMessages(chatJid: string, since?: string): Promise<Message[]> {
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request<{ messages: Message[] }>(
      `/chats/${encodeURIComponent(chatJid)}/messages${query}`,
    );
    return result.messages.map((m) => ({
      ...m,
      is_from_me: !!m.is_from_me,
      is_bot_message: !!m.is_bot_message,
    }));
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

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  }

  private abortController: AbortController | null = null;
  private messageListeners: ((message: Message) => void)[] = [];

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
                if (data.type === 'message' && data.is_bot_message && data.content && !data.id?.startsWith('typing_')) {
                  const message: Message = {
                    id: data.id,
                    chat_jid: data.chatJid,
                    sender: 'bot',
                    sender_name: data.sender_name,
                    content: data.content,
                    timestamp: data.timestamp,
                    is_from_me: data.is_from_me,
                    is_bot_message: data.is_bot_message,
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
      })
      .catch((err) => {
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
