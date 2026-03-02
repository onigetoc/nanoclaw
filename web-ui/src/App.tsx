import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowDown, MessageCircle, Moon, Sun } from 'lucide-react';
import { apiService, type ChatInfo, type Message, type ApiToken, type ConnectionStatus } from './api';
import { useSettings } from './useSettings';
import { UI_MODELS } from './utils/models';
import { formatDate } from './types';
import type { ChatState } from './types';
import { LoginScreen } from './components/LoginScreens';
import { CreateTokenScreen, TokenCreatedScreen } from './components/TokenSetupScreens';
import ChatSidebar from './components/ChatSidebar';
import MessageBubble from './components/MessageBubble';
import ComposerBar from './components/ComposerBar';
import SettingsPage from './SettingsPage';
import DebugPanel from './DebugPanel';

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
  const [selectedModelId, setSelectedModelId] = useState(UI_MODELS[0].id);
  const [composerHeight, setComposerHeight] = useState(176);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const { settings, updateSetting, resetSettings } = useSettings();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const loadOlderRef = useRef<() => void>(() => {});

  const isDark = theme === 'dark';

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
          return { ...s, messages: [...s.messages, message] };
        }
        return s;
      });
    });

    const unsubscribeConn = apiService.onConnectionChange((status) => {
      setServerStatus(status);
      if (status.serverOnline && !status.sseConnected) { void loadChats(); apiService.connectToEvents(); }
      setState((s) => ({ ...s, connected: status.serverOnline, error: status.serverOnline ? null : s.error }));
    });

    return () => { unsubscribeMsg(); unsubscribeConn(); apiService.disconnectFromEvents(); apiService.stopHealthMonitor(); };
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

  useEffect(() => { if (isNearBottom) scrollToBottom(); else setShowScrollToBottom(true); }, [state.messages, isNearBottom]);
  useEffect(() => () => { if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current); }, []);

  // --- Chat actions ---
  const selectChat = (chat: ChatInfo) => {
    setState((s) => ({ ...s, selectedChat: chat, messages: [] }));
    setHasMoreMessages(false);
    setIsNearBottom(true);
    localStorage.setItem(SELECTED_CHAT_STORAGE_KEY, chat.jid);
    setShowScrollToBottom(false);
    inputRef.current?.focus();
  };

  const sendMessage = useCallback(async (content: string, fileAttachments?: File[]) => {
    if (!state.selectedChat) return;
    const trimmed = content.trim();
    if (!trimmed && (!fileAttachments || fileAttachments.length === 0)) return;

    // Separate media (images/audio → analyze like Telegram) from files (→ transfer)
    let finalContent = trimmed;
    if (fileAttachments && fileAttachments.length > 0) {
      const descriptions: string[] = [];
      const transferFiles: File[] = [];

      for (const file of fileAttachments) {
        if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
          // Analyze via vision/transcription — same pipeline as Telegram
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
          transferFiles.push(file);
        }
      }

      // Transfer non-media files to group uploads
      if (transferFiles.length > 0) {
        try {
          const uploadResult = await apiService.uploadFiles(state.selectedChat.jid, transferFiles);
          for (const f of uploadResult.files) {
            descriptions.push(`[Attached file: ${f.path}]`);
          }
        } catch (err) {
          console.error('Failed to upload files:', err);
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
    try { await apiService.sendMessage(state.selectedChat.jid, finalContent); } catch (err) { console.error('Failed to send message:', err); }
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
      <ChatSidebar
        isDark={isDark} chats={state.chats} selectedChat={state.selectedChat}
        connected={state.connected} error={state.error} serverOnline={serverStatus.serverOnline}
        settings={settings} onSelectChat={selectChat} onOpenSettings={() => setShowSettingsPage(true)}
        onToggleDebug={() => updateSetting('debugPanel', false)} onDisconnect={() => setToken(null)}
      />

      {showSettingsPage && (
        <aside className={`flex w-80 shrink-0 flex-col border-r ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
          <SettingsPage settings={settings} onUpdate={updateSetting} onReset={resetSettings} onClose={() => setShowSettingsPage(false)} isDark={isDark} />
        </aside>
      )}

      <main className={`relative flex min-w-0 flex-1 flex-col ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
        {state.selectedChat ? (
          <>
            <header className={`flex h-16 items-center justify-between border-b px-4 md:px-6 ${isDark ? 'border-zinc-800 bg-zinc-950/90' : 'border-zinc-200 bg-zinc-50/90'}`}>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold md:text-lg">{state.selectedChat.name || state.selectedChat.jid}</h2>
                <p className={`truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{state.selectedChat.jid}</p>
              </div>
              <button
                type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                className={`ml-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </header>

            <div ref={messagesContainerRef} onScroll={updateScrollState} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
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

            <ComposerBar
              isDark={isDark} connected={state.connected} selectedChatJid={state.selectedChat.jid}
              selectedModelId={selectedModelId} onSelectModel={setSelectedModelId}
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
  );
}

export default App;
