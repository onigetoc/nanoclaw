import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowDown, Bug, MessageCircle, Moon, Sun } from 'lucide-react';
import { apiService, type ChatInfo, type Message, type ApiToken, type ConnectionStatus, type StatusEvent } from './api';
import { useSettings } from './useSettings';
import { getUiModelsSync, type UiModel } from './utils/models';
import { formatDate } from './types';
import type { ChatState } from './types';
import { LoginScreen } from './components/LoginScreens';
import { CreateTokenScreen, TokenCreatedScreen } from './components/TokenSetupScreens';
import ChatSidebar from './components/ChatSidebar';
import MessageBubble from './components/MessageBubble';
import ComposerBar from './components/ComposerBar';
import AdminPage from './settings/AdminPage';
import DebugPanel from './DebugPanel';
import { useModelStore, getPersistedModel } from './stores/modelStore';

const SELECTED_CHAT_STORAGE_KEY = 'eureclaw_selected_chat_jid';
const THEME_STORAGE_KEY = 'eureclaw_theme';
const PAGE_SIZE = 30;

function App() {
  const [state, setState] = useState<ChatState>({
    chats: [], selectedChat: null, messages: [], connected: false, loading: false, error: null,
  });
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenSetup, setShowTokenSetup] = useState(false);
  const [newToken, setNewToken] = useState<ApiToken | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });
  const [serverStatus, setServerStatus] = useState<ConnectionStatus>({ serverOnline: false, sseConnected: false });
  const [, forceUpdate] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [availableModels, setAvailableModels] = useState<UiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [composerHeight, setComposerHeight] = useState(176);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());
  const [agentStatus, setAgentStatus] = useState<StatusEvent | null>(null);
  const [chatStatuses, setChatStatuses] = useState<Map<string, StatusEvent>>(new Map());
  const { settings, updateSetting, resetSettings } = useSettings();
  const { setSelectedModel } = useModelStore();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const loadOlderRef = useRef<() => void>(() => {});

  const isDark = theme === 'dark';

  // Load models on mount — read persisted model synchronously (no hydration race)
  useEffect(() => {
    const models = getUiModelsSync();
    setAvailableModels(models);
    if (models.length > 0) {
      const persisted = getPersistedModel();
      const initialModel = persisted && models.find(m => m.id === persisted)
        ? persisted
        : models[0].id;
      setSelectedModelId(initialModel);
      setSelectedModel(initialModel);
    }
  }, []);

  // Reload models when returning from settings (skip initial mount)
  const settingsReturnRef = useRef(false);
  useEffect(() => {
    if (showSettingsPage) {
      settingsReturnRef.current = true;
      return;
    }
    if (!settingsReturnRef.current) return;
    settingsReturnRef.current = false;
    
    const models = getUiModelsSync();
    setAvailableModels(models);
    if (models.length > 0 && !models.find(m => m.id === selectedModelId)) {
      setSelectedModelId(models[0].id);
    } else if (models.length === 0) {
      setSelectedModelId('');
    }
  }, [showSettingsPage]);

  // Listen for localStorage changes (when models are checked/unchecked in settings)
  useEffect(() => {
    const handleStorageChange = () => {
      const models = getUiModelsSync();
      setAvailableModels(models);
      // Update selected model if it's no longer available
      if (models.length > 0 && !models.find(m => m.id === selectedModelId)) {
        setSelectedModelId(models[0].id);
      } else if (models.length === 0) {
        setSelectedModelId('');
      }
    };

    // Listen for custom event from ModelsSection
    window.addEventListener('eureclaw-models-changed', handleStorageChange);
    return () => window.removeEventListener('eureclaw-models-changed', handleStorageChange);
  }, [selectedModelId]);

  // --- Data loading ---
  const loadChats = async () => {
    try {
      const chats = await apiService.getChats();
      const rememberedJid = localStorage.getItem(SELECTED_CHAT_STORAGE_KEY);
      setState((s) => {
        const current = s.selectedChat ? chats.find((c) => c.jid === s.selectedChat?.jid) || null : null;
        const remembered = rememberedJid ? chats.find((c) => c.jid === rememberedJid) || null : null;
        const selectedChat = current || remembered || chats[0] || null;
        return { ...s, chats, selectedChat, messages: selectedChat?.jid === s.selectedChat?.jid ? s.messages : [], connected: true, error: null };
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
      console.error('Failed to load chats:', err);
      if (errorMsg.includes('Invalid or inactive token') || errorMsg.includes('Not authenticated')) {
        apiService.clearToken();
        setToken(null);
        return;
      }
      setState((s) => ({ ...s, connected: false, error: errorMsg }));
    }
  };

  const loadMessages = async (chatJid: string) => {
    try {
      const { messages, hasMore } = await apiService.getMessages(chatJid, { limit: PAGE_SIZE });
      setHasMoreMessages(!!hasMore);
      setState((s) => (s.selectedChat?.jid === chatJid ? { ...s, messages } : s));
      requestAnimationFrame(() => { requestAnimationFrame(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }); });
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const loadOlderMessages = async () => {
    if (isLoadingOlder || !hasMoreMessages || !state.selectedChat) return;
    const oldest = state.messages[0];
    if (!oldest) return;
    setIsLoadingOlder(true);
    try {
      const { messages: older, hasMore } = await apiService.getMessages(state.selectedChat.jid, { limit: PAGE_SIZE, before: oldest.timestamp });
      setHasMoreMessages(!!hasMore);
      if (older.length > 0) {
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        setState((s) => ({ ...s, messages: [...older, ...s.messages] }));
        requestAnimationFrame(() => { if (container) container.scrollTop += container.scrollHeight - prevScrollHeight; });
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };
  loadOlderRef.current = loadOlderMessages;

  // --- Effects ---
  useEffect(() => {
    const savedToken = apiService.getToken();
    if (savedToken) { setToken(savedToken); apiService.setToken(savedToken); }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return undefined;
    apiService.setToken(token);
    void loadChats();
    apiService.connectToEvents();
    apiService.startHealthMonitor();

    const unsubscribeMsg = apiService.onMessage((message) => {
      setState((s) => {
        if (s.selectedChat?.jid === message.chat_jid) {
          if (s.messages.some((m) => m.id === message.id)) return s;
          
          // Detect /new command response - clear message history for fresh session
          console.log('📨 Message received:', {
            is_bot_message: message.is_bot_message,
            content: message.content.substring(0, 50),
            includes_new: message.content.includes('New session created')
          });
          
          const isNewSessionMessage = message.is_bot_message && 
            message.content.includes('New session created');
          
          if (isNewSessionMessage) {
            console.log('🆕 New session detected - reloading messages from backend');
            // Reload messages from backend instead of clearing abruptly
            // This avoids the scroll-jump caused by emptying the DOM
            void loadMessages(message.chat_jid);
            return s; // Don't update state here, loadMessages will do it
          }
          
          return { ...s, messages: [...s.messages, message] };
        }
        // Message for a different chat - mark as unread
        setUnreadChats((prev) => new Set(prev).add(message.chat_jid));
        return s;
      });
    });

    const unsubscribeStatus = apiService.onStatus((event) => {
      // Track per-chat status for sidebar indicators
      setChatStatuses((prev) => {
        const next = new Map(prev);
        if (event.status === 'done') {
          next.delete(event.chatJid);
        } else {
          next.set(event.chatJid, event);
        }
        return next;
      });

      // Track selected chat status for the composer area
      if (event.status === 'done') {
        setTimeout(() => setAgentStatus(null), 2000);
        setAgentStatus({ ...event, detail: 'Done' });
      } else {
        setAgentStatus(event);
      }
    });

    const unsubscribeConn = apiService.onConnectionChange((status) => {
      setServerStatus(status);
      if (status.serverOnline && !status.sseConnected) { void loadChats(); apiService.connectToEvents(); }
      setState((s) => ({ ...s, connected: status.serverOnline, error: status.serverOnline ? null : s.error }));
    });

    return () => { unsubscribeMsg(); unsubscribeStatus(); unsubscribeConn(); apiService.disconnectFromEvents(); apiService.stopHealthMonitor(); };
  }, [token]);

  useEffect(() => { if (state.selectedChat) void loadMessages(state.selectedChat.jid); }, [state.selectedChat]);

  // --- Scroll ---
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => { messagesEndRef.current?.scrollIntoView({ behavior }); };

  const scrollToBottomFast = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const target = container.scrollHeight - container.clientHeight;
    const start = container.scrollTop;
    const distance = target - start;
    if (distance <= 0) return;
    const duration = Math.min(200, Math.max(80, distance * 0.15));
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - (1 - progress) * (1 - progress);
      container.scrollTop = start + distance * ease;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const updateScrollState = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = messagesContainerRef.current;
      if (!container) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const nearBottom = distanceFromBottom < 140;
      setIsNearBottom(nearBottom);
      setShowScrollToBottom(!nearBottom);
      if (container.scrollTop < 100) loadOlderRef.current();
    });
  }, []);

  // Throttle scroll events
  const throttledUpdateScrollState = useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  useEffect(() => { if (isNearBottom) scrollToBottom(); else setShowScrollToBottom(true); }, [state.messages, isNearBottom]);
  useEffect(() => () => { if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current); }, []);

  // --- Chat actions ---
  const selectChat = (chat: ChatInfo) => {
    setState((s) => {
      // If clicking the same chat, don't clear messages
      if (s.selectedChat?.jid === chat.jid) {
        return s;
      }
      return { ...s, selectedChat: chat, messages: [] };
    });
    // Only reset scroll state if switching to a different chat
    if (state.selectedChat?.jid !== chat.jid) {
      setHasMoreMessages(false);
      setIsNearBottom(true);
      setShowScrollToBottom(false);
    }
    // Mark chat as read
    setUnreadChats((prev) => {
      const next = new Set(prev);
      next.delete(chat.jid);
      return next;
    });
    localStorage.setItem(SELECTED_CHAT_STORAGE_KEY, chat.jid);
    inputRef.current?.focus();
  };

  const sendMessage = useCallback(async (content: string, fileAttachments?: File[], mode?: 'analyze' | 'transfer', agent?: string, model?: string) => {
    if (!state.selectedChat) return;
    const trimmed = content.trim();
    if (!trimmed && (!fileAttachments || fileAttachments.length === 0)) return;

    let finalContent = trimmed;
    if (fileAttachments && fileAttachments.length > 0) {
      const descriptions: string[] = [];
      const attachMode = mode || 'analyze';

      if (attachMode === 'transfer') {
        // File Transfer mode — save all files to group uploads
        try {
          const uploadResult = await apiService.uploadFiles(state.selectedChat.jid, fileAttachments);
          for (const f of uploadResult.files) {
            descriptions.push(`[Attached file: ${f.path}]`);
          }
        } catch (err) {
          console.error('Failed to upload files:', err);
          descriptions.push(`[File transfer failed: ${err instanceof Error ? err.message : 'Unknown error'}]`);
        }
      } else {
        // Read Media mode — analyze images/audio via vision/transcription (same as Telegram)
        for (const file of fileAttachments) {
          if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
            try {
              const result = await apiService.analyzeMedia(state.selectedChat.jid, file);
              if (result.type === 'image') {
                descriptions.push(`[Photo: ${result.description}]`);
              } else if (result.type === 'audio') {
                descriptions.push(`[Audio: ${result.description}]`);
              } else {
                descriptions.push(result.description);
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error('Failed to analyze media:', errMsg);
              descriptions.push(`[${file.type.startsWith('image/') ? 'Photo' : 'Audio'}: ${errMsg}]`);
            }
          } else {
            // Non-media files in Read Media mode → still analyze (returns [File: name])
            try {
              const result = await apiService.analyzeMedia(state.selectedChat.jid, file);
              descriptions.push(result.description);
            } catch (err) {
              descriptions.push(`[File: ${file.name}]`);
            }
          }
        }
      }

      if (descriptions.length > 0) {
        const mediaText = descriptions.join('\n');
        finalContent = trimmed ? `${trimmed}\n\n${mediaText}` : mediaText;
      }
    }

    if (!finalContent) return;

    const optimisticMsg: Message = {
      id: `local_${Date.now()}`, chat_jid: state.selectedChat.jid, sender: 'me', sender_name: 'You',
      content: finalContent, timestamp: new Date().toISOString(), is_from_me: false, is_bot_message: false,
      attachments: fileAttachments?.map(f => ({ name: f.name, type: f.type, size: f.size })),
    };
    setState((s) => ({ ...s, messages: [...s.messages, optimisticMsg] }));
    try { 
      // Use provided agent/model from slash commands or dropdown, otherwise use defaults
      const finalAgent = agent || undefined; // undefined means use opencode.json default
      const finalModel = model || undefined; // undefined means use opencode.json default
      
      console.log('📤 Sending message with:', { 
        agent: finalAgent || '(default from opencode.json)', 
        model: finalModel || '(default from opencode.json)',
        hasSlashCommand: !!(agent || model)
      });
      
      await apiService.sendMessage(state.selectedChat.jid, finalContent, finalModel, finalAgent); 
    } catch (err) { console.error('Failed to send message:', err); }
  }, [state.selectedChat]);

  const handleOptimisticMessage = useCallback((msg: Message) => {
    setState((s) => ({ ...s, messages: [...s.messages, msg] }));
  }, []);

  const handleRemoveOptimisticMessage = useCallback((id: string) => {
    setState((s) => ({ ...s, messages: s.messages.filter(m => m.id !== id) }));
  }, []);

  // --- Grouped messages ---
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let dateCursor = '';
    for (const msg of state.messages) {
      const msgDate = formatDate(msg.timestamp);
      if (msgDate !== dateCursor) { dateCursor = msgDate; groups.push({ date: msgDate, messages: [msg] }); }
      else { groups[groups.length - 1].messages.push(msg); }
    }
    return groups;
  }, [state.messages]);

  // --- Render: Login screens ---
  if (!token && !showTokenSetup) {
    return (
      <LoginScreen
        isDark={isDark} tokenInput={tokenInput} setTokenInput={setTokenInput}
        setToken={setToken} setShowTokenSetup={setShowTokenSetup}
        forceUpdate={() => forceUpdate((n) => n + 1)}
      />
    );
  }

  if (showTokenSetup && !newToken) {
    return <CreateTokenScreen isDark={isDark} setNewToken={setNewToken} setToken={setToken} setShowTokenSetup={setShowTokenSetup} />;
  }

  if (newToken && !token) {
    return <TokenCreatedScreen isDark={isDark} newToken={newToken} setToken={setToken} setNewToken={setNewToken} />;
  }

  // --- Render: Main app ---
  return (
    <div className={`flex h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      {/* Settings page overlay */}
      {showSettingsPage && (
        <div className="absolute inset-0 z-50">
          <AdminPage
            onBack={() => setShowSettingsPage(false)}
            isDark={isDark}
            serverOnline={serverStatus.serverOnline}
            settings={settings}
            onUpdateSetting={updateSetting}
            onResetSettings={resetSettings}
          />
        </div>
      )}

      {/* Main chat interface - hidden when settings are open */}
      <div className={`flex h-screen w-full ${showSettingsPage ? 'hidden' : ''}`}>
        <ChatSidebar
          isDark={isDark} chats={state.chats} selectedChat={state.selectedChat}
          connected={state.connected} error={state.error} serverOnline={serverStatus.serverOnline}
          unreadChats={unreadChats}
          chatStatuses={chatStatuses}
          availableModels={[]}
          onSelectChat={selectChat} onOpenSettings={() => setShowSettingsPage(true)}
          onDisconnect={() => setToken(null)}
        />

        <main className={`relative flex min-w-0 flex-1 flex-col ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
          {state.selectedChat ? (
            <>
              <header className={`flex h-16 items-center justify-between border-b px-4 md:px-6 ${isDark ? 'border-zinc-800 bg-zinc-950/90' : 'border-zinc-200 bg-zinc-50/90'}`}>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold md:text-lg">{state.selectedChat.name || state.selectedChat.jid}</h2>
                  <p className={`truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{state.selectedChat.jid}</p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <button
                    type="button" onClick={() => updateSetting('debugPanel', !settings.debugPanel)}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      settings.debugPanel
                        ? isDark ? 'border-amber-700/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25' : 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
                        : isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                    }`}
                    title={settings.debugPanel ? 'Hide debug panel' : 'Show debug panel'}
                  >
                    <Bug className="h-4 w-4" />
                  </button>
                  <button
                    type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </header>

              <div ref={messagesContainerRef} onScroll={throttledUpdateScrollState} className="flex-1 overflow-y-auto px-3 py-4 md:px-6" style={{ willChange: 'scroll-position' }}>
                <div className="mx-auto w-full max-w-4xl">
                  {isLoadingOlder && (
                    <div className="flex justify-center py-3"><div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" /></div>
                  )}
                  {groupedMessages.map((group) => (
                    <div key={group.date} className="mb-6">
                      <div className="my-5 text-center text-xs text-zinc-500">{group.date}</div>
                      <div className="space-y-3">
                        {group.messages.map((msg) => (
                          <MessageBubble 
                            key={msg.id} 
                            msg={msg} 
                            isDark={isDark} 
                            onSendCommand={(cmd) => { 
                              scrollToBottomFast();
                              setTimeout(() => {
                                setIsNearBottom(true);
                                void sendMessage(`/${cmd}`);
                              }, 250);
                            }} 
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {showScrollToBottom && (
                <button
                  type="button" onClick={() => { scrollToBottom(); setShowScrollToBottom(false); }}
                  style={{ bottom: composerHeight + 10 }}
                  className={`absolute left-1/2 z-20 -translate-x-1/2 rounded-full border p-3 shadow-lg backdrop-blur transition ${isDark ? 'border-zinc-700 bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-white/95 text-zinc-700 hover:bg-zinc-100'}`}
                  title="Scroll to bottom"
                >
                  <ArrowDown className="h-5 w-5" />
                </button>
              )}

              {agentStatus && agentStatus.status !== 'done' && agentStatus.chatJid === state.selectedChat.jid && (
                <div className={`flex items-center gap-2 px-4 py-2 text-xs ${
                  agentStatus.status === 'error'
                    ? isDark ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-600'
                    : agentStatus.status === 'queued'
                    ? isDark ? 'bg-amber-950/40 text-amber-400' : 'bg-amber-50 text-amber-700'
                    : isDark ? 'bg-zinc-800/80 text-emerald-400' : 'bg-zinc-100 text-emerald-600'
                }`}>
                  {agentStatus.status === 'queued' ? (
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${isDark ? 'bg-amber-500/20' : 'bg-amber-200/60'}`}>
                      Queue
                    </span>
                  ) : agentStatus.status !== 'error' ? (
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                    </span>
                  ) : null}
                  <span>{agentStatus.detail || agentStatus.status}</span>
                </div>
              )}

              <ComposerBar
                isDark={isDark} connected={state.connected} selectedChatJid={state.selectedChat.jid}
                selectedModelId={selectedModelId} onSelectModel={(modelId) => {
                  setSelectedModelId(modelId);
                  setSelectedModel(modelId);
                }}
                availableModels={availableModels}
                onSendMessage={sendMessage} onOptimisticMessage={handleOptimisticMessage}
                onRemoveOptimisticMessage={handleRemoveOptimisticMessage}
                onComposerResize={setComposerHeight} inputRef={inputRef}
              />
            </>
          ) : (
            <div className={`flex flex-1 flex-col items-center justify-center ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <MessageCircle className={`mb-2 h-10 w-10 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
              <h2 className={`text-xl font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>Select a chat to start</h2>
              <p className="mt-1 text-sm">Choose a conversation from the sidebar</p>
            </div>
          )}
        </main>

        {settings.debugPanel && state.selectedChat && (
          <DebugPanel messages={state.messages} onClose={() => updateSetting('debugPanel', false)} isDark={isDark} chatFolder={state.selectedChat?.groupInfo?.folder} />
        )}
      </div>
    </div>
  );
}

export default App;
