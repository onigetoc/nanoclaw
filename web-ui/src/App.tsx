import { useState, useEffect, useRef, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowDown,
  Folder,
  MessageCircle,
  Moon,
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
  const [, forceUpdate] = useState(0); // used to re-render after clearing token
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      loadChats();
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
  }, [token]);

  useEffect(() => {
    if (state.selectedChat) {
      loadMessages(state.selectedChat.jid);
    }
  }, [state.selectedChat]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const updateScrollState = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    setIsNearBottom(nearBottom);
    setShowScrollToBottom(!nearBottom);
  };

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom();
    } else {
      setShowScrollToBottom(true);
    }
  }, [state.messages, isNearBottom]);

  const openExternalLink = (href?: string) => {
    if (!href) return;
    const url = href.trim();
    const isAllowed = /^(https?:\/\/|mailto:|tel:)/i.test(url);
    if (!isAllowed) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sanitizeMessageContent = (content: string) => {
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    // Fix legacy artefact where some user messages are stored as:
    // "0\n<real text>"
    if (lines.length > 0 && lines[0].trim() === '0') {
      return lines.slice(1).join('\n').trimStart();
    }

    // Backstop for: "0 <real text>"
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
      // If token is invalid/expired, clear it and show login
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !state.selectedChat) return;

    const userInput = inputValue.trim();
    setInputValue('');

    // Optimistic UI: show the message immediately
    const optimisticMsg: Message = {
      id: `local_${Date.now()}`,
      chat_jid: state.selectedChat.jid,
      sender: 'me',
      sender_name: 'You',
      content: userInput,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
    };
    setState((s) => ({ ...s, messages: [...s.messages, optimisticMsg] }));

    try {
      await apiService.sendMessage(state.selectedChat.jid, userInput);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
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

  const groupedMessages: { date: string; messages: Message[] }[] = [];
  const isDark = theme === 'dark';
  let currentDate = '';
  state.messages.forEach((msg) => {
    const msgDate = formatDate(msg.timestamp);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  if (!token && !showTokenSetup) {
    const savedToken = apiService.getToken();

    // If a token is already saved in localStorage, show a simple Connect button
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

    // No saved token: show login form
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
              navigator.clipboard.writeText(newToken.token);
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
      <aside className={`flex w-80 flex-col border-r ${isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
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
              // Keep token in localStorage so user can reconnect easily
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
            <header className={`flex h-16 items-center justify-between border-b px-6 backdrop-blur ${isDark ? 'border-zinc-800 bg-zinc-900/70' : 'border-zinc-300 bg-white/90'}`}>
              <h2 className="truncate text-lg font-semibold">
                {state.selectedChat.name || state.selectedChat.jid}
              </h2>
              <p className={`ml-4 truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{state.selectedChat.jid}</p>
            </header>

            <div
              ref={messagesContainerRef}
              onScroll={updateScrollState}
              className="flex-1 overflow-y-auto px-4 py-5 md:px-6"
            >
              {groupedMessages.map((group) => (
                <div key={group.date} className="mb-5">
                  <div className="my-4 text-center text-xs text-zinc-500">{group.date}</div>

                  <div className="space-y-2">
                    {group.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${Boolean(msg.is_bot_message) ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            Boolean(msg.is_bot_message)
                              ? isDark
                                ? 'rounded-bl-md bg-zinc-800 text-zinc-100'
                                : 'rounded-bl-md border border-zinc-300 bg-white text-zinc-900'
                              : 'rounded-br-md bg-emerald-600 text-white'
                          }`}
                        >
                          {Boolean(msg.is_bot_message) && (
                            <div className="mb-1 text-xs font-medium text-emerald-400">
                              {msg.sender_name}
                            </div>
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
                              {sanitizeMessageContent(msg.content)}
                            </ReactMarkdown>
                          </div>

                          <div className={`mt-1 text-right text-[11px] ${Boolean(msg.is_bot_message) ? (isDark ? 'text-zinc-400' : 'text-zinc-500') : 'text-white/80'}`}>
                            {formatTime(msg.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {showScrollToBottom && (
              <button
                type="button"
                onClick={() => {
                  scrollToBottom();
                  setShowScrollToBottom(false);
                }}
                className={`absolute bottom-24 right-6 z-20 rounded-full border p-3 shadow-lg backdrop-blur transition ${isDark ? 'border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800' : 'border-zinc-300 bg-white/95 text-zinc-700 hover:bg-zinc-100'}`}
                title="Scroll to bottom"
              >
                <ArrowDown className="h-5 w-5" />
              </button>
            )}

            <form
              className={`border-t px-4 py-3 backdrop-blur md:px-6 ${isDark ? 'border-zinc-800 bg-zinc-900/70' : 'border-zinc-300 bg-white/90'}`}
              onSubmit={handleSubmit}
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type a message..."
                  disabled={!state.connected}
                  className={`h-11 flex-1 rounded-full border px-4 text-sm outline-none ring-emerald-500 placeholder:text-zinc-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-100' : 'border-zinc-300 bg-white text-zinc-900'}`}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || !state.connected}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SendHorizontal className="h-4 w-4" />
                  Send
                </button>
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
