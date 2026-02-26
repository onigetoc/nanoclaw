import { useState, useEffect, useRef, type FormEvent } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';
import { apiService, type ChatInfo, type Message, type ApiToken } from './api';

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
  const [, forceUpdate] = useState(0); // used to re-render after clearing token
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  const loadChats = async () => {
    try {
      const chats = await apiService.getChats();
      setState((s) => ({ ...s, chats, connected: true, error: null }));
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
    inputRef.current?.focus();
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
        <div className="login-container">
          <div className="login-box">
            <h1>EureClaw</h1>
            <p>Disconnected</p>
            <button
              className="primary"
              onClick={() => setToken(savedToken)}
              autoFocus
            >
              Connect
            </button>
            <button
              className="secondary"
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
      <div className="login-container">
        <div className="login-box">
          <h1>EureClaw</h1>
          <p>Connect to your assistant</p>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter your API token"
              autoFocus
            />
            <button type="submit" disabled={!tokenInput.trim()}>
              Connect
            </button>
          </form>
          <button className="secondary" onClick={() => setShowTokenSetup(true)}>
            Create New Token
          </button>
        </div>
      </div>
    );
  }

  if (showTokenSetup && !newToken) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>Create Token</h1>
          <p>Generate a new API token to connect</p>
          <button onClick={handleCreateToken}>Generate Token</button>
          <button
            className="secondary"
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
      <div className="login-container">
        <div className="login-box">
          <h1>Token Created!</h1>
          <p>Copy this token - you won't see it again:</p>
          <code className="token-display">{newToken.token}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newToken.token);
            }}
          >
            Copy to Clipboard
          </button>
          <button
            className="primary"
            onClick={() => {
              setToken(newToken.token);
              setNewToken(null);
            }}
          >
            I've saved my token
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>EureClaw</h1>
          <span
            className={`status ${state.connected ? 'connected' : 'disconnected'}`}
          >
            {state.connected ? '●' : '○'}
          </span>
        </div>
        {state.error && <div className="error-banner">{state.error}</div>}
        <div className="chat-list">
          {state.chats.map((chat) => (
            <div
              key={chat.jid}
              className={`chat-item ${state.selectedChat?.jid === chat.jid ? 'active' : ''}`}
              onClick={() => selectChat(chat)}
            >
              <div className="chat-avatar">
                {(chat.name || chat.jid).charAt(0).toUpperCase()}
              </div>
              <div className="chat-info">
                <div className="chat-name">{chat.name || chat.jid}</div>
                <div className="chat-preview">
                  {chat.groupInfo ? `📁 ${chat.groupInfo.folder}` : chat.jid}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button
            className="secondary"
            onClick={() => {
              setToken(null);
              // Keep token in localStorage so user can reconnect easily
            }}
          >
            Disconnect
          </button>
        </div>
      </aside>

      <main className="chat-main">
        {state.selectedChat ? (
          <>
            <header className="chat-header">
              <div className="chat-header-info">
                <h2>{state.selectedChat.name || state.selectedChat.jid}</h2>
                <span className="chat-jid">{state.selectedChat.jid}</span>
              </div>
            </header>

            <div className="messages">
              {groupedMessages.map((group) => (
                <div key={group.date} className="message-group">
                  <div className="date-divider">{group.date}</div>
                  {group.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`message ${msg.is_bot_message ? 'received' : 'sent'}`}
                    >
                      <div className="message-content">
                        {msg.is_bot_message && (
                          <div className="message-sender">
                            {msg.sender_name}
                          </div>
                        )}
                        <div className="message-text">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        <div className="message-time">
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="input-area" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                disabled={!state.connected}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || !state.connected}
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="no-chat">
            <h2>Select a chat to start</h2>
            <p>Choose a conversation from the sidebar</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
