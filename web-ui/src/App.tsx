import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowDown, Bot, HeartPulse, Activity, MessageCircle, Moon, Sun } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  apiService,
  type ChatInfo,
  type Message,
  type ApiToken,
  type ConnectionStatus,
  type StatusEvent,
} from './api';
import { useSettings } from './useSettings';
import { getUiModelsSync, type UiModel } from './utils/models';
import { formatDate } from './types';
import type { ChatState } from './types';
import { LoginScreen } from './components/LoginScreens';
import {
  CreateTokenScreen,
  TokenCreatedScreen,
} from './components/TokenSetupScreens';
import ChatSidebar from './components/ChatSidebar';
import MessageBubble from './components/MessageBubble';
import ComposerBar from './components/ComposerBar';
import AdminPage from './settings/AdminPage';
import PulsePanel from './PulsePanel';
import EventActivityPanel from './components/EventActivityPanel';
import { useModelStore, getPersistedModel } from './stores/modelStore';

import { ElapsedTimer } from './components/ElapsedTimer';

const SELECTED_CHAT_STORAGE_KEY = 'eureclaw_selected_chat_jid';
const THEME_STORAGE_KEY = 'eureclaw_theme';
const PAGE_SIZE = 30;

function App() {
  const [state, setState] = useState<ChatState>({
    chats: [],
    selectedChat: null,
    messages: [],
    connected: false,
    loading: false,
    error: null,
  });
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenSetup, setShowTokenSetup] = useState(false);
  const [newToken, setNewToken] = useState<ApiToken | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });
  const [serverStatus, setServerStatus] = useState<ConnectionStatus>({
    serverOnline: false,
    sseConnected: false,
  });
  const [, forceUpdate] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [availableModels, setAvailableModels] = useState<UiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [composerHeight, setComposerHeight] = useState(176);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());
  const [agentStatus, setAgentStatus] = useState<StatusEvent | null>(null);
  const [chatStatuses, setChatStatuses] = useState<Map<string, StatusEvent>>(
    new Map(),
  );
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'up' | 'down'>>({});
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const streamPartOrderRef = useRef<string[]>([]);
  const streamPartTextsRef = useRef<Map<string, string>>(new Map());
  const processingStartRef = useRef<string | null>(null);
  const { settings, updateSetting, resetSettings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { setSelectedModel } = useModelStore();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const loadOlderRef = useRef<() => void>(() => {});
  const streamingMessageIdRef = useRef<string | null>(null);
  const selectedChatRef = useRef<ChatInfo | null>(null);

  const isDark = theme === 'dark';

  // Load models on mount — read persisted model synchronously (no hydration race)
  useEffect(() => {
    const models = getUiModelsSync();
    setAvailableModels(models);
    if (models.length > 0) {
      const persisted = getPersistedModel();
      const initialModel =
        persisted && models.find((m) => m.id === persisted)
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
    if (models.length > 0 && !models.find((m) => m.id === selectedModelId)) {
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
      if (models.length > 0 && !models.find((m) => m.id === selectedModelId)) {
        setSelectedModelId(models[0].id);
      } else if (models.length === 0) {
        setSelectedModelId('');
      }
    };

    // Listen for custom event from ModelsSection
    window.addEventListener('eureclaw-models-changed', handleStorageChange);
    return () =>
      window.removeEventListener(
        'eureclaw-models-changed',
        handleStorageChange,
      );
  }, [selectedModelId]);

  // --- Data loading ---
  const loadChats = async () => {
    try {
      const chats = await apiService.getChats();
      const rememberedJid = localStorage.getItem(SELECTED_CHAT_STORAGE_KEY);
      setState((s) => {
        const current = s.selectedChat
          ? chats.find((c) => c.jid === s.selectedChat?.jid) || null
          : null;
        const remembered = rememberedJid
          ? chats.find((c) => c.jid === rememberedJid) || null
          : null;
        const selectedChat = current || remembered || chats[0] || null;
        return {
          ...s,
          chats,
          selectedChat,
          messages: selectedChat?.jid === s.selectedChat?.jid ? s.messages : [],
          connected: true,
          error: null,
        };
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
      console.error('Failed to load chats:', err);
      if (
        errorMsg.includes('Invalid or inactive token') ||
        errorMsg.includes('Not authenticated')
      ) {
        apiService.clearToken();
        setToken(null);
        return;
      }
      setState((s) => ({ ...s, connected: false, error: errorMsg }));
    }
  };

  const loadMessages = async (chatJid: string) => {
    try {
      const { messages, hasMore } = await apiService.getMessages(chatJid, {
        limit: PAGE_SIZE,
      });
      setHasMoreMessages(!!hasMore);
      setState((s) =>
        s.selectedChat?.jid === chatJid ? { ...s, messages } : s,
      );
      // Load feedback ratings for this chat
      apiService.getFeedbackForChat(chatJid).then((fb) => setFeedbackMap(fb)).catch(() => {});
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        });
      });
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
      const { messages: older, hasMore } = await apiService.getMessages(
        state.selectedChat.jid,
        { limit: PAGE_SIZE, before: oldest.timestamp },
      );
      setHasMoreMessages(!!hasMore);
      if (older.length > 0) {
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        setState((s) => ({ ...s, messages: [...older, ...s.messages] }));
        requestAnimationFrame(() => {
          if (container)
            container.scrollTop += container.scrollHeight - prevScrollHeight;
        });
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
    if (savedToken) {
      setToken(savedToken);
      apiService.setToken(savedToken);
    }
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

    // Track seen message IDs to prevent StrictMode double-processing
    // (React StrictMode mounts effects twice, creating duplicate SSE subscriptions)
    const seenMessageIds = new Set<string>();

    const unsubscribeMsg = apiService.onMessage((message) => {
      // Dedup before entering setState — prevents StrictMode double-fire
      if (seenMessageIds.has(message.id)) return;
      seenMessageIds.add(message.id);
      // Keep set from growing unbounded
      if (seenMessageIds.size > 200) {
        const iter = seenMessageIds.values();
        for (let i = 0; i < 100; i++) iter.next();
        // Can't easily trim a Set, just let it grow to 200 then clear old half
      }

      // Preserve thinking content in metadata (not in content — avoids token bloat).
      // The streaming partID logic accumulates thinking separately; attach it to
      // the message's metadata so MessageBubble can render the accordion.
      let enrichedMessage = message;
      if (message.is_bot_message && settingsRef.current.saveThinking) {
        const order = streamPartOrderRef.current;
        const texts = streamPartTextsRef.current;
        if (order.length >= 2) {
          const thinkingPid = order[0];
          const thinkingText = (texts.get(thinkingPid) || '')
            .replace(/<internal>[\s\S]*?<\/internal>/g, '')
            .replace(/<internal>[\s\S]*$/g, '')
            .trim();
          if (thinkingText) {
            enrichedMessage = {
              ...message,
              metadata: { ...message.metadata, reasoning: thinkingText },
            };
            // Persist reasoning to backend so it survives page reloads
            void apiService.saveMessageReasoning(message.id, thinkingText);
          }
        }
      }

      setState((s) => {
        if (s.selectedChat?.jid === enrichedMessage.chat_jid) {
          if (s.messages.some((m) => m.id === enrichedMessage.id)) return s;

          // Detect /new command response - clear message history for fresh session
          const isNewSessionMessage =
            enrichedMessage.is_bot_message &&
            enrichedMessage.content.includes('New session created');

          if (isNewSessionMessage) {
            console.log(
              '🆕 New session detected - reloading messages from backend',
            );
            void loadMessages(enrichedMessage.chat_jid);
            return s;
          }

          return { ...s, messages: [...s.messages, enrichedMessage] };
        }
        // Message for a different chat - mark as unread
        setUnreadChats((prev) => new Set(prev).add(enrichedMessage.chat_jid));
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

      // Track selected chat status for the composer area.
      // Only update agentStatus if the event belongs to the selected chat.
      // broadcastStatus sends events for each linked JID, so a direct
      // JID comparison is sufficient (web:work will match web:work).
      const selected = selectedChatRef.current;
      if (!selected || event.chatJid !== selected.jid) return;

      if (event.status === 'done') {
        processingStartRef.current = null;
        setTimeout(() => setAgentStatus(null), 2000);
        setAgentStatus({ ...event, detail: 'Done' });
      } else {
        // Capture the first non-done timestamp as the processing start
        if (!processingStartRef.current || event.status === 'processing') {
          processingStartRef.current = event.timestamp;
        }
        setAgentStatus({ ...event, timestamp: processingStartRef.current });
      }
    });

    const unsubscribeConn = apiService.onConnectionChange((status) => {
      setServerStatus(status);
      if (status.serverOnline && !status.sseConnected) {
        void loadChats();
        apiService.connectToEvents();
      }
      setState((s) => ({
        ...s,
        connected: status.serverOnline,
        error: status.serverOnline ? null : s.error,
      }));
    });

    // Listen for streaming token deltas from /chat/stream
    // Frontend separates thinking vs response by partID order:
    // - If only 1 partID seen so far → it's thinking (or response if model has no thinking)
    // - Once 2+ partIDs seen → first was thinking, last is response
    const unsubscribeDelta = apiService.onDelta((content, partID, _chatJid, folder) => {
      // Filter deltas to only show streaming for the currently selected chat.
      // Compare by workspace folder — this handles cross-channel matching
      // (e.g. tg:-xxx and web:work both belong to folder "work").
      const selected = selectedChatRef.current;
      if (selected && folder) {
        const selectedFolder = selected.workspaceInfo?.folder;
        if (selectedFolder && folder !== selectedFolder) {
          console.debug('[delta-filter] Skipping delta for folder', folder, '(selected:', selectedFolder, ')');
          return; // Different workspace — skip this delta
        }
      }

      const order = streamPartOrderRef.current;
      const texts = streamPartTextsRef.current;

      if (partID && !order.includes(partID)) {
        order.push(partID);
      }

      // Accumulate text for this partID
      const pid = partID || order[order.length - 1] || '_default';
      texts.set(pid, (texts.get(pid) || '') + content);

      if (order.length <= 1) {
        // Only 1 part so far — show as thinking (will become response if no 2nd part arrives)
        setThinkingContent(texts.get(pid) || '');
        setStreamingContent('');
      } else {
        // 2+ parts — first is thinking, last is response
        const thinkingPid = order[0];
        setThinkingContent(texts.get(thinkingPid) || '');
        // Combine all non-first parts as response
        const responseParts = order.slice(1).map(p => texts.get(p) || '').join('');
        setStreamingContent(responseParts);
      }
    });

    // Also track bot messages to clear streaming content
    const unsubscribeBotMsg = apiService.onMessage((message) => {
      if (message.is_bot_message) {
        // Only clear streaming if this bot message belongs to the selected chat's workspace.
        // Use folder comparison since the message may arrive via a linked JID
        // (e.g. tg:xxx instead of web:xxx for the same workspace).
        const selected = selectedChatRef.current;
        const selectedFolder = selected?.workspaceInfo?.folder;
        if (selected && selectedFolder) {
          // Derive folder from message's chat_jid
          const msgFolder = message.chat_jid.startsWith('web:')
            ? message.chat_jid.slice(4)
            : undefined;
          // If we can determine the folder and it doesn't match, skip
          if (msgFolder && msgFolder !== selectedFolder) return;
        }
        setStreamingContent('');
        setThinkingContent('');
        streamingMessageIdRef.current = null;
        streamPartOrderRef.current = [];
        streamPartTextsRef.current = new Map();
        apiService.disconnectFromChatStream();
      }
    });

    return () => {
      unsubscribeMsg();
      unsubscribeStatus();
      unsubscribeConn();
      unsubscribeDelta();
      unsubscribeBotMsg();
      apiService.disconnectFromEvents();
      apiService.disconnectFromChatStream();
      apiService.stopHealthMonitor();
    };
  }, [token]);

  useEffect(() => {
    selectedChatRef.current = state.selectedChat;
    if (state.selectedChat) void loadMessages(state.selectedChat.jid);
  }, [state.selectedChat]);

  // Auto-scroll when streaming response (not thinking) updates
  // Only auto-scroll if user hasn't scrolled up (isNearBottom)
  useEffect(() => {
    if (streamingContent && isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [streamingContent, isNearBottom]);

  // Scroll once when thinking first appears (to show the accordion)
  const thinkingScrolledRef = useRef(false);
  useEffect(() => {
    if (thinkingContent && !thinkingScrolledRef.current) {
      thinkingScrolledRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    if (!thinkingContent) {
      thinkingScrolledRef.current = false;
    }
  }, [thinkingContent]);

  // --- Scroll ---
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

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
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
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

  useEffect(() => {
    if (isNearBottom) scrollToBottom();
    else setShowScrollToBottom(true);
  }, [state.messages, isNearBottom]);
  useEffect(
    () => () => {
      if (scrollRafRef.current !== null)
        window.cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

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
      // Clear streaming state from previous chat
      setStreamingContent('');
      setThinkingContent('');
      streamingMessageIdRef.current = null;
      streamPartOrderRef.current = [];
      streamPartTextsRef.current = new Map();
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

  const handleFeedback = useCallback(
    async (messageId: string, rating: 'up' | 'down') => {
      const chat = state.selectedChat;
      if (!chat) return;
      const msg = state.messages.find((m) => m.id === messageId);
      const modelId = msg?.metadata?.modelID || 'unknown';
      const providerId = msg?.metadata?.providerID || 'unknown';

      // Optimistic update
      setFeedbackMap((prev) => {
        const next = { ...prev };
        if (next[messageId] === rating) {
          delete next[messageId]; // toggle off
        } else {
          next[messageId] = rating;
        }
        return next;
      });

      try {
        await apiService.submitFeedback(messageId, chat.jid, modelId, providerId, rating);
      } catch {
        // Revert on error
        apiService.getFeedbackForChat(chat.jid).then((fb) => setFeedbackMap(fb)).catch(() => {});
      }
    },
    [state.selectedChat, state.messages],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      fileAttachments?: File[],
      mode?: 'analyze' | 'transfer',
      agent?: string,
      model?: string,
    ) => {
      if (!state.selectedChat) return;
      const trimmed = content.trim();
      if (!trimmed && (!fileAttachments || fileAttachments.length === 0))
        return;

      let finalContent = trimmed;
      if (fileAttachments && fileAttachments.length > 0) {
        const descriptions: string[] = [];
        const attachMode = mode || 'analyze';

        if (attachMode === 'transfer') {
          // File Transfer mode — save all files to workspace uploads
          try {
            const uploadResult = await apiService.uploadFiles(
              state.selectedChat.jid,
              fileAttachments,
            );
            for (const f of uploadResult.files) {
              descriptions.push(`[Attached file: ${f.path}]`);
            }
          } catch (err) {
            console.error('Failed to upload files:', err);
            descriptions.push(
              `[File transfer failed: ${err instanceof Error ? err.message : 'Unknown error'}]`,
            );
          }
        } else {
          // Read Media mode — analyze images/audio via vision/transcription (same as Telegram)
          for (const file of fileAttachments) {
            if (
              file.type.startsWith('image/') ||
              file.type.startsWith('audio/')
            ) {
              try {
                const result = await apiService.analyzeMedia(
                  state.selectedChat.jid,
                  file,
                );
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
                descriptions.push(
                  `[${file.type.startsWith('image/') ? 'Photo' : 'Audio'}: ${errMsg}]`,
                );
              }
            } else {
              // Non-media files in Read Media mode → still analyze (returns [File: name])
              try {
                const result = await apiService.analyzeMedia(
                  state.selectedChat.jid,
                  file,
                );
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
        id: `local_${Date.now()}`,
        chat_jid: state.selectedChat.jid,
        sender: 'me',
        sender_name: 'You',
        content: finalContent,
        timestamp: new Date().toISOString(),
        is_from_me: false,
        is_bot_message: false,
        attachments: fileAttachments?.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
        })),
      };
      setState((s) => ({ ...s, messages: [...s.messages, optimisticMsg] }));

      // Start streaming token deltas for real-time display
      const streamId = `stream_${Date.now()}`;
      streamingMessageIdRef.current = streamId;
      setStreamingContent('');
      setThinkingContent('');
      streamPartOrderRef.current = [];
      streamPartTextsRef.current = new Map();
      apiService.connectToChatStream();

      try {
        // Use provided agent/model from slash commands or dropdown, otherwise use defaults
        const finalAgent = agent || undefined; // undefined means use opencode.json default
        const finalModel = model || undefined; // undefined means use opencode.json default

        console.log('📤 Sending message with:', {
          agent: finalAgent || '(default from opencode.json)',
          model: finalModel || '(default from opencode.json)',
          hasSlashCommand: !!(agent || model),
        });

        await apiService.sendMessage(
          state.selectedChat.jid,
          finalContent,
          finalModel,
          finalAgent,
        );
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [state.selectedChat],
  );

  const handleOptimisticMessage = useCallback((msg: Message) => {
    setState((s) => ({ ...s, messages: [...s.messages, msg] }));
  }, []);

  const handleRemoveOptimisticMessage = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      messages: s.messages.filter((m) => m.id !== id),
    }));
  }, []);

  // --- Grouped messages ---
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let dateCursor = '';
    for (const msg of state.messages) {
      const msgDate = formatDate(msg.timestamp);
      if (msgDate !== dateCursor) {
        dateCursor = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }
    return groups;
  }, [state.messages]);

  // --- Render: Login screens ---
  if (!token && !showTokenSetup) {
    return (
      <LoginScreen
        isDark={isDark}
        tokenInput={tokenInput}
        setTokenInput={setTokenInput}
        setToken={setToken}
        setShowTokenSetup={setShowTokenSetup}
        forceUpdate={() => forceUpdate((n) => n + 1)}
      />
    );
  }

  if (showTokenSetup && !newToken) {
    return (
      <CreateTokenScreen
        isDark={isDark}
        setNewToken={setNewToken}
        setToken={setToken}
        setShowTokenSetup={setShowTokenSetup}
      />
    );
  }

  if (newToken && !token) {
    return (
      <TokenCreatedScreen
        isDark={isDark}
        newToken={newToken}
        setToken={setToken}
        setNewToken={setNewToken}
      />
    );
  }

  // --- Render: Main app ---
  return (
    <div
      className={`flex h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}
    >
      {/* Settings page overlay — kept mounted to preserve section state */}
      <div className="absolute inset-0 z-50" style={{ display: showSettingsPage ? undefined : 'none' }}>
          <AdminPage
            onBack={() => setShowSettingsPage(false)}
            isDark={isDark}
            serverOnline={serverStatus.serverOnline}
            settings={settings}
            onUpdateSetting={updateSetting}
            onResetSettings={resetSettings}
          />
        </div>

      {/* Main chat interface - hidden when settings are open */}
      <div
        className={`flex h-screen w-full ${showSettingsPage ? 'hidden' : ''}`}
      >
        <ChatSidebar
          isDark={isDark}
          chats={state.chats}
          selectedChat={state.selectedChat}
          connected={state.connected}
          error={state.error}
          serverOnline={serverStatus.serverOnline}
          unreadChats={unreadChats}
          chatStatuses={chatStatuses}
          availableModels={[]}
          onSelectChat={selectChat}
          onOpenSettings={() => setShowSettingsPage(true)}
          onDisconnect={() => setToken(null)}
        />

        <main
          className={`relative flex min-w-0 flex-1 flex-col ${isDark ? 'bg-zinc-900' : 'bg-zinc-100'}`}
        >
          {state.selectedChat ? (
            <>
              <header
                className={`flex h-16 items-center justify-between border-b px-4 md:px-6 ${isDark ? 'border-zinc-800 bg-zinc-950/90' : 'border-zinc-300 bg-zinc-200/95'}`}
              >
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold md:text-lg">
                    {state.selectedChat.name || state.selectedChat.jid}
                  </h2>
                  <p
                    className={`truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
                  >
                    {state.selectedChat.jid}
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowActivityPanel((v) => !v)}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      showActivityPanel
                        ? isDark
                          ? 'border-emerald-700/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : isDark
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 shadow-sm'
                    }`}
                    title={showActivityPanel ? 'Hide activity panel' : 'Show activity panel'}
                  >
                    <Activity className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSetting('debugPanel', !settings.debugPanel)
                    }
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      settings.debugPanel
                        ? isDark
                          ? 'border-amber-700/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                          : 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
                        : isDark
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 shadow-sm'
                    }`}
                    title={
                      settings.debugPanel
                        ? 'Hide pulse'
                        : 'Show pulse'
                    }
                  >
                    <HeartPulse className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
                    }
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 shadow-sm'}`}
                    title={
                      theme === 'dark'
                        ? 'Switch to light mode'
                        : 'Switch to dark mode'
                    }
                  >
                    {theme === 'dark' ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </header>

              <div
                ref={messagesContainerRef}
                onScroll={throttledUpdateScrollState}
                className="flex-1 overflow-y-auto px-3 py-4 md:px-6"
                style={{ willChange: 'scroll-position' }}
              >
                <div className="mx-auto w-full max-w-4xl">
                  {isLoadingOlder && (
                    <div className="flex justify-center py-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                    </div>
                  )}
                  {groupedMessages.map((group) => (
                    <div key={group.date} className="mb-6">
                      <div className="my-5 text-center text-xs text-zinc-500">
                        {group.date}
                      </div>
                      <div className="space-y-3">
                        {group.messages.map((msg) => (
                          <MessageBubble
                            key={msg.id}
                            msg={msg}
                            isDark={isDark}
                            showThinking={settings.showThinking}
                            feedbackRating={feedbackMap[msg.id] ?? null}
                            onFeedbackChange={handleFeedback}
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
                  {/* Streaming message — appears as a real chat bubble */}
                  {(streamingContent || (thinkingContent && !streamingContent)) && (() => {
                    // Detect if content is <internal> leak (not real thinking)
                    const hasInternalLeak = !streamingContent && thinkingContent &&
                      streamPartOrderRef.current.length <= 1 &&
                      /<internal>/i.test(thinkingContent);

                    return (
                    <div className="mb-6">
                      <div className="space-y-3">
                        <div className="flex w-full justify-start">
                          <div className="w-full px-4 py-3">
                            <div className="mb-2">
                              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                                <Bot className="h-3.5 w-3.5" />
                                <span className="font-medium uppercase tracking-wider">Andy</span>
                              </div>
                            </div>

                            {/* Internal thinking indicator — shown when model leaks <internal> tags */}
                            {hasInternalLeak && (
                              <div className={`flex items-center gap-2 text-sm italic ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                                <span>Internal thinking</span>
                                <span className="flex gap-0.5">
                                  <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
                                  <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
                                  <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" />
                                </span>
                              </div>
                            )}

                            {/* Thinking accordion — single unified block for the entire streaming lifecycle.
                                Stable key prevents React from recreating it when streamingContent starts,
                                which would reset open/closed state and cause font size jumps.
                                Streaming response text is shown inside the accordion in italic. */}
                            {settings.showThinking && !hasInternalLeak && thinkingContent && (
                              <details key="streaming-thinking" className="mb-2 text-sm">
                                <summary className={`cursor-pointer select-none italic ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                  Thinking
                                  {!streamingContent && (
                                    <span className="inline-flex gap-0.5 ml-2 align-middle">
                                      <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
                                      <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]" />
                                      <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500" />
                                    </span>
                                  )}
                                </summary>
                                <pre className={`mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{thinkingContent.replace(/<internal>[\s\S]*?<\/internal>/g, '').replace(/<internal>[\s\S]*$/g, '').trim()}</pre>
                                {/* Streaming response inside accordion — italic like thinking */}
                                {streamingContent && (
                                  <div className={`mt-3 border-t pt-2 italic text-sm leading-relaxed ${isDark ? 'border-zinc-700/50 text-zinc-500' : 'border-zinc-300/50 text-zinc-400'}`}>
                                    <pre className="whitespace-pre-wrap font-sans">{streamingContent.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim()}</pre>
                                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle ml-1" />
                                  </div>
                                )}
                              </details>
                            )}

                            {/* Streaming response text — only shown when thinking is hidden or no thinking content */}
                            {streamingContent && (!settings.showThinking || hasInternalLeak || !thinkingContent) && (
                              <div className={`prose max-w-none break-words text-base leading-relaxed [&_p:last-child]:inline ${isDark ? 'prose-invert text-zinc-300' : 'text-zinc-800'}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {streamingContent.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim()}
                                </ReactMarkdown>
                                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400 align-middle ml-1" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })()}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {showScrollToBottom && (
                <button
                  type="button"
                  onClick={() => {
                    scrollToBottom();
                    setShowScrollToBottom(false);
                  }}
                  style={{ bottom: composerHeight + 10 }}
                  className={`absolute left-1/2 z-20 -translate-x-1/2 rounded-full border p-3 shadow-lg backdrop-blur transition ${isDark ? 'border-zinc-700 bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-white/95 text-zinc-700 hover:bg-zinc-100'}`}
                  title="Scroll to bottom"
                >
                  <ArrowDown className="h-5 w-5" />
                </button>
              )}

              {agentStatus &&
                agentStatus.status !== 'done' &&
                agentStatus.chatJid === state.selectedChat.jid && (
                  <div
                    className={`flex items-center gap-2 px-4 py-2 text-xs ${
                      agentStatus.status === 'error'
                        ? isDark
                          ? 'bg-red-950/40 text-red-400'
                          : 'bg-red-50 text-red-600'
                        : agentStatus.status === 'queued'
                          ? isDark
                            ? 'bg-amber-950/40 text-amber-400'
                            : 'bg-amber-50 text-amber-700'
                          : isDark
                            ? 'bg-zinc-800/80 text-emerald-400'
                            : 'bg-zinc-100 text-emerald-600'
                    }`}
                  >
                    {agentStatus.status === 'queued' ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${isDark ? 'bg-amber-500/20' : 'bg-amber-200/60'}`}
                      >
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
                    <ElapsedTimer
                      startTime={agentStatus.timestamp}
                      isDark={isDark}
                    />
                  </div>
                )}

              <ComposerBar
                isDark={isDark}
                connected={state.connected}
                selectedChatJid={state.selectedChat.jid}
                selectedModelId={selectedModelId}
                onSelectModel={(modelId) => {
                  setSelectedModelId(modelId);
                  setSelectedModel(modelId);
                }}
                availableModels={availableModels}
                onSendMessage={sendMessage}
                onOptimisticMessage={handleOptimisticMessage}
                onRemoveOptimisticMessage={handleRemoveOptimisticMessage}
                onComposerResize={setComposerHeight}
                inputRef={inputRef}
              />
            </>
          ) : (
            <div
              className={`flex flex-1 flex-col items-center justify-center ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}
            >
              <MessageCircle
                className={`mb-2 h-10 w-10 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
              />
              <h2
                className={`text-xl font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}
              >
                Select a chat to start
              </h2>
              <p className="mt-1 text-sm">
                Choose a conversation from the sidebar
              </p>
            </div>
          )}
        </main>

        {settings.debugPanel && state.selectedChat && (
          <PulsePanel
            messages={state.messages}
            onClose={() => updateSetting('debugPanel', false)}
            isDark={isDark}
            chatFolder={state.selectedChat?.workspaceInfo?.folder}
          />
        )}

        {state.selectedChat && (
          <div className="flex h-full" style={{ display: showActivityPanel ? undefined : 'none' }}>
            <EventActivityPanel
              jid={state.selectedChat.jid}
              isDark={isDark}
              onClose={() => setShowActivityPanel(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
