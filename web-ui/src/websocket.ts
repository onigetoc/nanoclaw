/**
 * EureClaw WebSocket Client Module
 *
 * Browser-side WebSocket client for real-time control panel events.
 * Replaces the SSE /events transport with a WebSocket connection on /ws.
 * Handles authentication, reconnection with exponential backoff, and
 * event distribution to registered listeners.
 */

import type { Message, StatusEvent } from './api.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WsConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
}

export interface StepEvent {
  chatJid: string;
  executionId: string;
  step: {
    timestamp: string;
    phase: string;
    message: string;
    metadata?: Record<string, unknown>;
  };
  timestamp: string;
}

export interface ExecutionUpdateEvent {
  execution: {
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
    steps?: Array<{
      timestamp: string;
      phase: string;
      message: string;
      durationMs?: number;
      metadata?: Record<string, unknown>;
    }>;
  };
}

/** Internal state for the WebSocket client */
interface WsState {
  socket: WebSocket | null;
  token: string;
  connected: boolean;
  authenticated: boolean;
  reconnectAttempt: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const CLOSE_CODE_UNAUTHORIZED = 4401;

// ---------------------------------------------------------------------------
// WebSocketClient
// ---------------------------------------------------------------------------

export class WebSocketClient {
  private wsUrl: string;
  private state: WsState;

  private messageListeners: ((message: Message) => void)[] = [];
  private statusListeners: ((event: StatusEvent) => void)[] = [];
  private stepListeners: ((event: StepEvent) => void)[] = [];
  private executionUpdateListeners: ((event: ExecutionUpdateEvent) => void)[] = [];
  private connectionListeners: ((status: WsConnectionStatus) => void)[] = [];

  constructor(baseUrl: string) {
    // Convert http(s):// to ws(s):// and append /ws
    this.wsUrl = baseUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      + '/ws';

    this.state = {
      socket: null,
      token: '',
      connected: false,
      authenticated: false,
      reconnectAttempt: 0,
      reconnectDelay: INITIAL_RECONNECT_DELAY,
      maxReconnectDelay: MAX_RECONNECT_DELAY,
      reconnectTimer: null,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Open a WebSocket connection and authenticate with the given token.
   * If already connected, disconnects first.
   */
  connect(token: string): void {
    this.state.token = token;

    // Clean up any existing connection
    this.cleanupSocket();
    this.cancelReconnect();

    this.openSocket();
  }

  /**
   * Gracefully close the connection and stop reconnection attempts.
   */
  disconnect(): void {
    this.cancelReconnect();
    this.cleanupSocket();

    this.state.token = '';
    this.state.reconnectAttempt = 0;
    this.state.reconnectDelay = INITIAL_RECONNECT_DELAY;

    this.updateConnectionStatus(false, false, 0);
  }

  /** Whether the client is currently connected and authenticated. */
  get isConnected(): boolean {
    return this.state.connected && this.state.authenticated;
  }

  /**
   * Register a listener for incoming message events.
   * Returns an unsubscribe function.
   */
  onMessage(callback: (message: Message) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      const idx = this.messageListeners.indexOf(callback);
      if (idx > -1) this.messageListeners.splice(idx, 1);
    };
  }

  /**
   * Register a listener for status events.
   * Returns an unsubscribe function.
   */
  onStatus(callback: (event: StatusEvent) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      const idx = this.statusListeners.indexOf(callback);
      if (idx > -1) this.statusListeners.splice(idx, 1);
    };
  }

  /**
   * Register a listener for execution step events.
   * Returns an unsubscribe function.
   */
  onStep(callback: (event: StepEvent) => void): () => void {
    this.stepListeners.push(callback);
    return () => {
      const idx = this.stepListeners.indexOf(callback);
      if (idx > -1) this.stepListeners.splice(idx, 1);
    };
  }

  /**
   * Register a listener for execution update events (start, complete, error).
   * Returns an unsubscribe function.
   */
  onExecutionUpdate(callback: (event: ExecutionUpdateEvent) => void): () => void {
    this.executionUpdateListeners.push(callback);
    return () => {
      const idx = this.executionUpdateListeners.indexOf(callback);
      if (idx > -1) this.executionUpdateListeners.splice(idx, 1);
    };
  }

  /**
   * Register a listener for connection status changes.
   * Immediately emits the current status. Returns an unsubscribe function.
   */
  onConnectionChange(callback: (status: WsConnectionStatus) => void): () => void {
    this.connectionListeners.push(callback);
    // Emit current status immediately
    callback({
      connected: this.state.connected && this.state.authenticated,
      reconnecting: this.state.reconnectTimer !== null,
      reconnectAttempt: this.state.reconnectAttempt,
    });
    return () => {
      const idx = this.connectionListeners.indexOf(callback);
      if (idx > -1) this.connectionListeners.splice(idx, 1);
    };
  }

  /** Send an application-level ping to measure latency. */
  sendPing(): void {
    this.send({ type: 'ping' });
  }

  // -------------------------------------------------------------------------
  // Socket lifecycle
  // -------------------------------------------------------------------------

  private openSocket(): void {
    try {
      const socket = new WebSocket(this.wsUrl);
      this.state.socket = socket;

      socket.onopen = () => {
        // Connection opened — send auth message
        this.send({ type: 'auth', token: this.state.token });
      };

      socket.onmessage = (event: MessageEvent) => {
        this.handleMessage(event);
      };

      socket.onclose = (event: CloseEvent) => {
        this.handleClose(event);
      };

      socket.onerror = () => {
        // The close event will fire after this, so we handle reconnection there.
        // Just log for debugging.
        console.warn('[WS] Connection error');
      };
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(event: MessageEvent): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      console.warn('[WS] Received malformed JSON, ignoring');
      return;
    }

    const type = data.type as string | undefined;
    if (!type) return;

    switch (type) {
      case 'auth_ok':
        this.handleAuthOk();
        break;
      case 'message':
        this.handleMessageEvent(data);
        break;
      case 'status':
        this.handleStatusEvent(data);
        break;
      case 'step':
        this.handleStepEvent(data);
        break;
      case 'execution_update':
        this.handleExecutionUpdateEvent(data);
        break;
      case 'pong':
        // Application-level pong — could be used for latency measurement
        break;
      default:
        // Unknown type — ignore silently
        break;
    }
  }

  private handleAuthOk(): void {
    this.state.authenticated = true;
    this.state.connected = true;

    // Reset backoff on successful connection
    this.state.reconnectAttempt = 0;
    this.state.reconnectDelay = INITIAL_RECONNECT_DELAY;

    this.updateConnectionStatus(true, false, 0);
  }

  private handleMessageEvent(data: Record<string, unknown>): void {
    // Skip typing indicators
    const id = data.id as string | undefined;
    if (id?.startsWith('typing_')) return;

    const content = data.content as string | undefined;
    if (!content) return;

    const message: Message = {
      id: (data.id as string) || '',
      chat_jid: (data.chatJid as string) || '',
      sender: data.is_bot_message ? 'bot' : (data.sender as string) || 'user',
      sender_name: (data.sender_name as string) || '',
      content,
      timestamp: (data.timestamp as string) || '',
      is_from_me: (data.is_from_me as boolean) ?? false,
      is_bot_message: (data.is_bot_message as boolean) ?? false,
      metadata: data.metadata as Message['metadata'],
    };

    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private handleStatusEvent(data: Record<string, unknown>): void {
    const statusEvent: StatusEvent = {
      chatJid: (data.chatJid as string) || '',
      status: data.status as StatusEvent['status'],
      detail: data.detail as string | undefined,
      timestamp: (data.timestamp as string) || '',
    };

    for (const listener of this.statusListeners) {
      listener(statusEvent);
    }
  }

  private handleStepEvent(data: Record<string, unknown>): void {
    const stepEvent: StepEvent = {
      chatJid: (data.chatJid as string) || '',
      executionId: (data.executionId as string) || '',
      step: data.step as StepEvent['step'],
      timestamp: (data.timestamp as string) || '',
    };

    for (const listener of this.stepListeners) {
      listener(stepEvent);
    }
  }

  private handleExecutionUpdateEvent(data: Record<string, unknown>): void {
    const event: ExecutionUpdateEvent = {
      execution: data.execution as ExecutionUpdateEvent['execution'],
    };

    for (const listener of this.executionUpdateListeners) {
      listener(event);
    }
  }

  // -------------------------------------------------------------------------
  // Close & reconnection
  // -------------------------------------------------------------------------

  private handleClose(event: CloseEvent): void {
    const wasAuthenticated = this.state.authenticated;
    this.state.connected = false;
    this.state.authenticated = false;
    this.state.socket = null;

    // If closed with 4401 (unauthorized), don't reconnect — token is invalid
    if (event.code === CLOSE_CODE_UNAUTHORIZED) {
      this.updateConnectionStatus(false, false, 0);
      return;
    }

    // If we had a token and were previously connected (or trying to),
    // attempt reconnection
    if (this.state.token) {
      if (wasAuthenticated) {
        // Was connected — notify disconnection and start reconnecting
        this.updateConnectionStatus(false, true, this.state.reconnectAttempt);
      }
      this.scheduleReconnect();
    } else {
      this.updateConnectionStatus(false, false, 0);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delay: min(2000 * 2^n, 30000) where n = reconnectAttempt
   */
  private scheduleReconnect(): void {
    this.cancelReconnect();

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.state.reconnectAttempt),
      this.state.maxReconnectDelay,
    );

    this.state.reconnectDelay = delay;

    this.updateConnectionStatus(false, true, this.state.reconnectAttempt);

    this.state.reconnectTimer = setTimeout(() => {
      this.state.reconnectTimer = null;
      this.state.reconnectAttempt++;
      this.openSocket();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.state.reconnectTimer !== null) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private cleanupSocket(): void {
    const socket = this.state.socket;
    if (socket) {
      // Remove handlers to prevent triggering reconnection
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }

      this.state.socket = null;
    }

    this.state.connected = false;
    this.state.authenticated = false;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.state.socket?.readyState === WebSocket.OPEN) {
      this.state.socket.send(JSON.stringify(payload));
    }
  }

  private updateConnectionStatus(
    connected: boolean,
    reconnecting: boolean,
    reconnectAttempt: number,
  ): void {
    const status: WsConnectionStatus = {
      connected,
      reconnecting,
      reconnectAttempt,
    };
    for (const listener of this.connectionListeners) {
      listener(status);
    }
  }
}
