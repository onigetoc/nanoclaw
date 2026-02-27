import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ChangeEvent,
  type FormEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowDown,
  Bot,
  Check,
  ChevronDown,
  Folder,
  Globe,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Moon,
  Paperclip,
  Power,
  SendHorizontal,
  Sun,
} from 'lucide-react';
import { apiService, type ChatInfo, type Message, type ApiToken } from './api';

const SELECTED_CHAT_STORAGE_KEY = 'eureclaw_selected_chat_jid';
const THEME_STORAGE_KEY = 'eureclaw_theme';

interface ChatState {
  chats: ChatInfo[];
  selectedChat: ChatInfo | null;
  messages: Message[];
  connected: boolean;
  loading: boolean;
  error: string | null;
}

interface UiModel {
  id: string;
  name: string;
  provider: 'Anthropic' | 'OpenAI' | 'Google';
  providerSlug: 'anthropic' | 'openai' | 'google';
}

const UI_MODELS: UiModel[] = [
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', providerSlug: 'anthropic' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic', providerSlug: 'anthropic' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', providerSlug: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI', providerSlug: 'openai' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', providerSlug: 'google' },
];

function getProviderLogoUrl(provider: UiModel['providerSlug']): string {
  return `https://models.dev/logos/${provider}.svg`;
}

const SUGGESTIONS = [
  'Résume les derniers messages et donne 3 actions concrètes',
  'Propose une réponse courte et polie à envoyer',
  'Peux-tu reformuler en style plus professionnel ?',
  'Donne une checklist exécutable pour cette tâche',
];

function getProviderBadgeColor(provider: UiModel['provider'], isDark: boolean): string {
  if (provider === 'Anthropic') {
    return isDark
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
      : 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (provider === 'OpenAI') {
    return isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  return isDark
    ? 'bg-sky-500/15 text-sky-300 border-sky-500/25'
    : 'bg-sky-100 text-sky-700 border-sky-200';
}

function extractReasoning(content: string): { visibleContent: string; reasoning: string | null } {
  const thinkTagMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkTagMatch) {
    return {
      visibleContent: content.replace(thinkTagMatch[0], '').trim(),
      reasoning: thinkTagMatch[1].trim(),
    };
  }

  const reasoningBlockMatch = content.match(/```(?:reasoning|thinking)\n([\s\S]*?)```/i);
  if (reasoningBlockMatch) {
    return {
      visibleContent: content.replace(reasoningBlockMatch[0], '').trim(),
      reasoning: reasoningBlockMatch[1].trim(),
    };
  }

  return { visibleContent: content, reasoning: null };
}

function extractSources(content: string): Array<{ href: string; title: string }> {
  const matches = content.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const unique = Array.from(new Set(matches)).slice(0, 5);

  return unique.map((href) => {
    let title = href;
    try {
      const url = new URL(href);
      title = url.hostname.replace(/^www\./, '');
    } catch {
      // ignore invalid URL parsing
    }
    return { href, title };
  });
}

function App() {
  const [state, setState] = useState<ChatState>({
    chats: [],
    selectedChat: null,
    messages: [],
    connected: false,
    loading: false,
    error: null,
  });
  const [inputValue, setInputValue] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenSetup, setShowTokenSetup] = useState(false);
  const [newToken, setNewToken] = useState<ApiToken | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });
  const [, forceUpdate] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useMicrophone, setUseMicrophone] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(UI_MODELS[0].id);
  const [composerHeight, setComposerHeight] = useState(176);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isComposerDragActive, setIsComposerDragActive] = useState(false);
  const [modelQuery, setModelQuery] = useState('');

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuContainerRef = useRef<HTMLDivElement>(null);
  const modelMenuContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const composerDragCounterRef = useRef(0);

  const addAttachments = useCallback((files: File[]) => {
    if (!files.length) return;

    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        const exists = next.some(
          (current) =>
            current.name === file.name &&
            current.size === file.size &&
            current.lastModified === file.lastModified,
        );
        if (!exists) {
          next.push(file);
        }
      }
      return next;
    });
  }, []);

  const transferHasFiles = (transfer: DataTransfer | null): boolean => {
    if (!transfer) return false;
    if (transfer.files.length > 0) return true;
    return Array.from(transfer.types).includes('Files');
  };

  const handleAttachmentInputFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;
      addAttachments(files);
      event.currentTarget.value = '';
      setAttachMenuOpen(false);
    },
    [addAttachments],
  );

  const handleComposerDragEnter = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!state.connected) return;
    if (!transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    composerDragCounterRef.current += 1;
    setIsComposerDragActive(true);
  }, [state.connected]);

  const handleComposerDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!state.connected) return;
    if (!transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsComposerDragActive(true);
  }, [state.connected]);

  const handleComposerDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    composerDragCounterRef.current = Math.max(0, composerDragCounterRef.current - 1);
    if (composerDragCounterRef.current === 0) {
      setIsComposerDragActive(false);
    }
  }, []);

  const handleComposerDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!state.connected) return;
      if (!transferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      composerDragCounterRef.current = 0;
      setIsComposerDragActive(false);
      const droppedFiles = Array.from(event.dataTransfer.files ?? []);
      addAttachments(droppedFiles);
    },
    [addAttachments, state.connected],
  );

  const handleInputPaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (!state.connected) return;

      const files: File[] = [];
      const clipboard = event.clipboardData;

      for (const item of Array.from(clipboard.items)) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }

      if (!files.length && clipboard.files.length > 0) {
        files.push(...Array.from(clipboard.files));
      }

      if (!files.length) return;

      event.preventDefault();
      addAttachments(files);
    },
    [addAttachments, state.connected],
  );

  const selectedModel = UI_MODELS.find((m) => m.id === selectedModelId) ?? UI_MODELS[0];
  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return UI_MODELS;
    return UI_MODELS.filter((m) => {
      return (
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [modelQuery]);

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
    if (token) {
      apiService.setToken(token);
      void loadChats();
      apiService.connectToEvents();

      const unsubscribe = apiService.onMessage((message) => {
        setState((s) => {
          if (s.selectedChat?.jid === message.chat_jid) {
            return { ...s, messages: [...s.messages, message] };
          }
          return s;
        });
      });

      return () => {
        unsubscribe();
        apiService.disconnectFromEvents();
      };
    }

    return undefined;
  }, [token]);

  useEffect(() => {
    if (state.selectedChat) {
      void loadMessages(state.selectedChat.jid);
    }
  }, [state.selectedChat]);

  useEffect(() => {
    const node = composerRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setComposerHeight(Math.round(entry.contentRect.height));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
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
    });
  }, []);

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom();
    } else {
      setShowScrollToBottom(true);
    }
  }, [state.messages, isNearBottom]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (modelMenuOpen && !modelMenuContainerRef.current?.contains(target)) {
        setModelMenuOpen(false);
      }

      if (attachMenuOpen && !attachmentMenuContainerRef.current?.contains(target)) {
        setAttachMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [modelMenuOpen, attachMenuOpen]);

  const openExternalLink = useCallback((href?: string) => {
    if (!href) return;
    const url = href.trim();
    const isAllowed = /^(https?:\/\/|mailto:|tel:)/i.test(url);
    if (!isAllowed) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const sanitizeMessageContent = (content: string) => {
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    if (lines.length > 0 && lines[0].trim() === '0') {
      return lines.slice(1).join('\n').trimStart();
    }

    return normalized.replace(/^\s*0\s+/, '').trimStart();
  };

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
      const messages = await apiService.getMessages(chatJid);
      setState((s) => {
        if (s.selectedChat?.jid === chatJid) {
          return { ...s, messages };
        }
        return s;
      });
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      setToken(tokenInput.trim());
    }
  };

  const handleCreateToken = async () => {
    try {
      const createdToken = await apiService.createToken('Web UI');
      setNewToken(createdToken);
      setToken(createdToken.token);
    } catch (err) {
      console.error('Failed to create token:', err);
    }
  };

  const selectChat = (chat: ChatInfo) => {
    setState((s) => ({ ...s, selectedChat: chat, messages: [] }));
    localStorage.setItem(SELECTED_CHAT_STORAGE_KEY, chat.jid);
    setShowScrollToBottom(false);
    inputRef.current?.focus();
    setTimeout(() => scrollToBottom('auto'), 0);
  };

  const sendMessage = async (content: string) => {
    if (!state.selectedChat) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    setInputValue('');

    const optimisticMsg: Message = {
      id: `local_${Date.now()}`,
      chat_jid: state.selectedChat.jid,
      sender: 'me',
      sender_name: 'You',
      content: trimmed,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
    };

    setState((s) => ({ ...s, messages: [...s.messages, optimisticMsg] }));

    try {
      await apiService.sendMessage(state.selectedChat.jid, trimmed);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!state.connected) return;
    const hasText = Boolean(inputValue.trim());
    const hasAttachments = attachments.length > 0;
    if (!hasText && !hasAttachments) return;

    const outgoingText = hasText
      ? inputValue
      : `Sent with attachments (${attachments.length} file${attachments.length > 1 ? 's' : ''})`;

    await sendMessage(outgoingText);
    setInputValue('');
    setAttachments([]);
  };

  const handleInputKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!state.connected) return;
      const hasText = Boolean(inputValue.trim());
      const hasAttachments = attachments.length > 0;
      if (!hasText && !hasAttachments) return;
      const outgoingText = hasText
        ? inputValue
        : `Sent with attachments (${attachments.length} file${attachments.length > 1 ? 's' : ''})`;
      await sendMessage(outgoingText);
      setInputValue('');
      setAttachments([]);
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    if (!state.connected) return;
    setAttachments([]);
    await sendMessage(suggestion);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString();
  };

  const groupedMessages = useMemo<{ date: string; messages: Message[] }[]>(() => {
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

  const isDark = theme === 'dark';

  const renderedMessageGroups = useMemo(
    () =>
      groupedMessages.map((group) => (
        <div key={group.date} className="mb-6">
          <div className="my-5 text-center text-xs text-zinc-500">{group.date}</div>

          <div className="space-y-3">
            {group.messages.map((msg) => {
              const sanitizedContent = sanitizeMessageContent(msg.content);
              const { visibleContent, reasoning } = extractReasoning(sanitizedContent);
              const sources = Boolean(msg.is_bot_message) ? extractSources(visibleContent) : [];
              const isAssistant = Boolean(msg.is_bot_message);

              return (
                <div
                  key={msg.id}
                  className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[88%] md:max-w-[78%] ${isAssistant
                      ? isDark
                        ? 'rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900'
                        : 'rounded-2xl rounded-bl-md border border-zinc-300 bg-white'
                      : 'rounded-2xl rounded-br-md bg-emerald-600 text-white'} px-4 py-3 shadow-sm`}
                  >
                    {isAssistant && (
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-emerald-400">
                        <Bot className="h-3.5 w-3.5" />
                        <span className="font-medium">{msg.sender_name || 'Assistant'}</span>
                      </div>
                    )}

                    {reasoning && (
                      <details className={`mb-2 rounded-lg border p-2 text-xs ${isDark ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300' : 'border-zinc-200 bg-zinc-100 text-zinc-700'}`}>
                        <summary className="cursor-pointer select-none font-medium">
                          Reasoning
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">
                          {reasoning}
                        </pre>
                      </details>
                    )}

                    {sources.length > 0 && (
                      <details className={`mb-2 rounded-lg border p-2 text-xs ${isDark ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300' : 'border-zinc-200 bg-zinc-100 text-zinc-700'}`}>
                        <summary className="cursor-pointer select-none font-medium">
                          Sources ({sources.length})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {sources.map((source) => (
                            <button
                              key={source.href}
                              type="button"
                              onClick={() => openExternalLink(source.href)}
                              className="block truncate text-left text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                              title={source.href}
                            >
                              {source.title}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}

                    <div className="break-words text-[15px] leading-relaxed [&_a]:text-emerald-300 [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_ol]:my-2 [&_ol]:list-inside [&_ol]:list-decimal [&_ol]:pl-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-inside [&_ul]:list-disc [&_ul]:pl-1 [&_li]:my-0.5">
                      <ReactMarkdown
                        components={{
                          a: ({ node: _node, href, ...props }) => (
                            <a
                              {...props}
                              href={href}
                              onClick={(e) => {
                                e.preventDefault();
                                openExternalLink(href);
                              }}
                              rel="noopener noreferrer"
                              target="_blank"
                            />
                          ),
                        }}
                      >
                        {visibleContent}
                      </ReactMarkdown>
                    </div>

                    <div className={`mt-2 text-right text-[11px] ${isAssistant ? (isDark ? 'text-zinc-400' : 'text-zinc-500') : 'text-white/80'}`}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )),
    [groupedMessages, isDark, openExternalLink],
  );

  if (!token && !showTokenSetup) {
    const savedToken = apiService.getToken();

    if (savedToken) {
      return (
        <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
          <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
            <h1 className="mb-2 text-3xl font-semibold">EureClaw</h1>
            <p className="mb-6 text-zinc-400">Disconnected</p>
            <button
              className="mb-3 w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
              onClick={() => setToken(savedToken)}
              autoFocus
            >
              Connect
            </button>
            <button
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
              onClick={() => {
                apiService.clearToken();
                forceUpdate((n) => n + 1);
              }}
            >
              Forget Token
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
          <h1 className="mb-2 text-3xl font-semibold">EureClaw</h1>
          <p className="mb-6 text-zinc-400">Connect to your assistant</p>
          <form className="space-y-3" onSubmit={handleLogin}>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter your API token"
              autoFocus
              className={`w-full rounded-lg px-4 py-3 outline-none ring-emerald-500 focus:ring-2 ${isDark ? 'border border-zinc-700 bg-zinc-800 text-zinc-100' : 'border border-zinc-300 bg-white text-zinc-900'}`}
            />
            <button
              type="submit"
              disabled={!tokenInput.trim()}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect
            </button>
          </form>
          <button
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
            onClick={() => setShowTokenSetup(true)}
          >
            Create New Token
          </button>
        </div>
      </div>
    );
  }

  if (showTokenSetup && !newToken) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
          <h1 className="mb-2 text-3xl font-semibold">Create Token</h1>
          <p className="mb-6 text-zinc-400">Generate a new API token to connect</p>
          <button
            onClick={handleCreateToken}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
          >
            Generate Token
          </button>
          <button
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
            onClick={() => setShowTokenSetup(false)}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (newToken && !token) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <div className={`w-full max-w-md rounded-2xl p-8 text-center shadow-xl ${isDark ? 'border border-zinc-800 bg-zinc-900' : 'border border-zinc-300 bg-white'}`}>
          <h1 className="mb-2 text-3xl font-semibold">Token Created!</h1>
          <p className="mb-4 text-zinc-400">Copy this token - you won&apos;t see it again:</p>
          <code className={`mb-4 block break-all rounded-lg p-4 text-left text-sm ${isDark ? 'border border-zinc-700 bg-zinc-800 text-zinc-100' : 'border border-zinc-300 bg-zinc-50 text-zinc-900'}`}>
            {newToken.token}
          </code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(newToken.token);
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            Copy to Clipboard
          </button>
          <button
            className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
            onClick={() => {
              setToken(newToken.token);
              setNewToken(null);
            }}
          >
            I&apos;ve saved my token
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      <aside className={`flex w-80 shrink-0 flex-col border-r ${isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
        <div className={`flex h-16 items-center justify-between border-b px-5 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
          <h1 className="text-xl font-semibold">EureClaw</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <span
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-bold ${state.connected
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                : 'border-rose-400/40 bg-rose-500/20 text-rose-300'}`}
              title={state.connected ? 'Connected' : 'Disconnected'}
            >
              ●
            </span>
          </div>
        </div>

        {state.error && (
          <div className="border-b border-rose-800 bg-rose-500/15 px-4 py-2 text-sm text-rose-300">
            {state.error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {state.chats.map((chat) => {
            const active = state.selectedChat?.jid === chat.jid;
            return (
              <button
                key={chat.jid}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  active
                    ? isDark
                      ? 'bg-zinc-800 ring-1 ring-zinc-700'
                      : 'bg-zinc-100 ring-1 ring-zinc-300'
                    : isDark
                      ? 'hover:bg-zinc-800/60'
                      : 'hover:bg-zinc-100'
                }`}
                onClick={() => selectChat(chat)}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 font-semibold text-white">
                  {(chat.name || chat.jid).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{chat.name || chat.jid}</div>
                  <div className={`mt-0.5 flex items-center gap-1 truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span>{chat.groupInfo ? chat.groupInfo.folder : chat.jid}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`border-t p-3 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
          <button
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
            onClick={() => {
              setToken(null);
            }}
          >
            <Power className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      </aside>

      <main className={`relative flex min-w-0 flex-1 flex-col ${isDark ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
        {state.selectedChat ? (
          <>
            <header className={`flex h-16 items-center justify-between border-b px-4 md:px-6 ${isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-300 bg-white/90'}`}>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold md:text-lg">
                  {state.selectedChat.name || state.selectedChat.jid}
                </h2>
                <p className={`truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {state.selectedChat.jid}
                </p>
              </div>
            </header>

            <div
              ref={messagesContainerRef}
              onScroll={updateScrollState}
              className="flex-1 overflow-y-auto px-3 py-4 md:px-6"
            >
              <div className="mx-auto w-full max-w-4xl">
                {renderedMessageGroups}
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
                className={`absolute left-1/2 z-20 -translate-x-1/2 rounded-full border p-3 shadow-lg backdrop-blur transition ${isDark ? 'border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800' : 'border-zinc-300 bg-white/95 text-zinc-700 hover:bg-zinc-100'}`}
                title="Scroll to bottom"
              >
                <ArrowDown className="h-5 w-5" />
              </button>
            )}

            <form
              ref={composerRef}
              className="px-3 py-3 md:px-6"
              onSubmit={handleSubmit}
            >
              <div className="mx-auto w-full max-w-4xl space-y-3">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        void handleSuggestionClick(suggestion);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                <div
                  className={`rounded-2xl border p-2.5 transition ${isComposerDragActive
                    ? isDark
                      ? 'border-emerald-500 bg-zinc-900'
                      : 'border-emerald-500 bg-emerald-50'
                    : isDark
                      ? 'border-zinc-700 bg-zinc-900'
                      : 'border-zinc-300 bg-white'}`}
                  onDragEnter={handleComposerDragEnter}
                  onDragOver={handleComposerDragOver}
                  onDragLeave={handleComposerDragLeave}
                  onDrop={handleComposerDrop}
                >
                  {isComposerDragActive && (
                    <div className={`mb-2 rounded-lg border border-dashed px-2 py-1.5 text-xs ${isDark ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-emerald-500/70 bg-emerald-100 text-emerald-700'}`}>
                      Dépose les images/fichiers ici
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2 px-2">
                      {attachments.map((file) => (
                        <span
                          key={`${file.name}-${file.lastModified}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isDark ? 'border-zinc-600 bg-zinc-800 text-zinc-300' : 'border-zinc-300 bg-zinc-100 text-zinc-700'}`}
                        >
                          <span className="max-w-44 truncate">{file.name}</span>
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-rose-400"
                            onClick={() => {
                              setAttachments((prev) =>
                                prev.filter(
                                  (f) =>
                                    !(f.name === file.name && f.lastModified === file.lastModified),
                                ),
                              );
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onPaste={handleInputPaste}
                    onKeyDown={(e) => {
                      void handleInputKeyDown(e);
                    }}
                    placeholder="Écris un message… (tu peux coller une image/fichier avec Ctrl+V)"
                    disabled={!state.connected}
                    rows={2}
                    className={`w-full resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}
                  />

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="relative" ref={attachmentMenuContainerRef}>
                        <input
                          ref={attachmentInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleAttachmentInputFiles}
                        />

                        <button
                          type="button"
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                          title="Attachments"
                          onClick={() => setAttachMenuOpen((v) => !v)}
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>

                        {attachMenuOpen && (
                          <div className={`absolute bottom-11 left-0 z-30 min-w-48 rounded-xl border p-1.5 shadow-xl ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
                            <button
                              type="button"
                              onClick={() => attachmentInputRef.current?.click()}
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${isDark ? 'text-zinc-200 hover:bg-zinc-800' : 'text-zinc-700 hover:bg-zinc-100'}`}
                            >
                              <ImageIcon className="h-4 w-4" />
                              Add photos or files
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setUseMicrophone((v) => !v)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${useMicrophone
                          ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                          : isDark
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                        title="Microphone (UI)"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseWebSearch((v) => !v)}
                        className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs transition ${useWebSearch
                          ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                          : isDark
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                        title="Web search (UI)"
                      >
                        <Globe className="h-4 w-4" />
                        Search
                      </button>

                      <div className="relative" ref={modelMenuContainerRef}>
                        <button
                          type="button"
                          className={`inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-xs transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                          onClick={() => setModelMenuOpen((open) => !open)}
                        >
                          <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
                            <img
                              src={getProviderLogoUrl(selectedModel.providerSlug)}
                              alt={selectedModel.provider}
                              className="h-3.5 w-3.5"
                              loading="lazy"
                            />
                          </span>
                          <span className="max-w-28 truncate">{selectedModel.name}</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>

                        {modelMenuOpen && (
                          <div className={`absolute bottom-11 left-0 z-30 w-80 overflow-hidden rounded-xl border shadow-2xl ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
                            <div className={`border-b p-2 ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`}>
                              <input
                                value={modelQuery}
                                onChange={(e) => setModelQuery(e.target.value)}
                                placeholder="Search models..."
                                className={`h-9 w-full rounded-md border px-2 text-xs outline-none ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500' : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500'}`}
                              />
                            </div>

                            <div className="max-h-72 overflow-y-auto p-1.5">
                              {['OpenAI', 'Anthropic', 'Google'].map((providerGroup) => {
                                const groupItems = filteredModels.filter(
                                  (m) => m.provider === providerGroup,
                                );
                                if (groupItems.length === 0) return null;

                                return (
                                  <div key={providerGroup} className="mb-1.5">
                                    <div className={`px-2 py-1 text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      {providerGroup}
                                    </div>
                                    {groupItems.map((model) => (
                                      <button
                                        key={model.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedModelId(model.id);
                                          setModelMenuOpen(false);
                                        }}
                                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${selectedModelId === model.id
                                          ? isDark
                                            ? 'bg-zinc-800 text-white'
                                            : 'bg-zinc-100 text-zinc-900'
                                          : isDark
                                            ? 'text-zinc-200 hover:bg-zinc-800/70'
                                            : 'text-zinc-700 hover:bg-zinc-100'}`}
                                      >
                                        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
                                          <img
                                            src={getProviderLogoUrl(model.providerSlug)}
                                            alt={model.provider}
                                            className="h-4 w-4"
                                            loading="lazy"
                                          />
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-sm">{model.name}</span>
                                        <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${getProviderBadgeColor(model.provider, isDark)}`}>
                                          {model.provider}
                                        </span>
                                        {selectedModelId === model.id ? (
                                          <Check className="ml-1 h-4 w-4" />
                                        ) : null}
                                      </button>
                                    ))}
                                  </div>
                                );
                              })}

                              {filteredModels.length === 0 && (
                                <div className={`px-2 py-4 text-center text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                  No models found.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={(!inputValue.trim() && attachments.length === 0) || !state.connected}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SendHorizontal className="h-4 w-4" />
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </>
        ) : (
          <div className={`flex flex-1 flex-col items-center justify-center ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <MessageCircle className={`mb-2 h-10 w-10 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
            <h2 className={`text-xl font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>Select a chat to start</h2>
            <p className="mt-1 text-sm">Choose a conversation from the sidebar</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
