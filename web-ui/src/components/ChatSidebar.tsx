import { Folder, LayoutDashboard, Power } from 'lucide-react';
import type { ChatInfo, StatusEvent } from '../api';

interface ChatSidebarProps {
  isDark: boolean;
  chats: ChatInfo[];
  selectedChat: ChatInfo | null;
  connected: boolean;
  error: string | null;
  serverOnline: boolean;
  unreadChats: Set<string>;
  chatStatuses: Map<string, StatusEvent>;
  availableModels: Array<{ id: string; name: string; provider: string }>;
  onSelectChat: (chat: ChatInfo) => void;
  onOpenSettings: () => void;
  onDisconnect: () => void;
}

function AgentStatusBadge({ status, isDark }: { status: StatusEvent; isDark: boolean }) {
  const isQueued = status.status === 'queued';
  const isError = status.status === 'error';

  if (isError) {
    return (
      <span className="shrink-0 rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400" title={status.detail || 'Error'}>
        ERR
      </span>
    );
  }

  if (isQueued) {
    return (
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`} title={status.detail || 'Message queued'}>
        QUEUE
      </span>
    );
  }

  // Working states: processing, connecting, waiting, responding
  return (
    <span className="flex shrink-0 items-center gap-1" title={status.detail || status.status}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    </span>
  );
}

export default function ChatSidebar({
  isDark, chats, selectedChat, connected, error, serverOnline, unreadChats,
  chatStatuses, onSelectChat, onOpenSettings, onDisconnect,
}: ChatSidebarProps) {

  return (
    <aside className={`flex w-72 shrink-0 flex-col border-r ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-300 bg-zinc-200'}`}>
      <div className={`flex h-16 items-center justify-between border-b px-5 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <h1 className="text-xl font-semibold">EureClaw Chat</h1>
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${connected
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
            : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>

      {error && (
        <div className="border-b border-rose-800 bg-rose-500/15 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!serverOnline && (
        <div className="flex items-center gap-2 border-b border-amber-700/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span>EureClaw server is not running</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        <div className={`mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-zinc-500'}`}>
          Workspaces
        </div>
        {chats.map((chat) => {
          const active = selectedChat?.jid === chat.jid;
          const hasUnread = unreadChats.has(chat.jid);
          const chatStatus = chatStatuses.get(chat.jid);
          return (
            <button
              key={chat.jid}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                active
                  ? isDark ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'bg-white ring-1 ring-zinc-300 shadow-sm'
                  : isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'
              }`}
              onClick={() => onSelectChat(chat)}
            >
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 font-semibold text-white">
                {(chat.name || chat.jid).charAt(0).toUpperCase()}
                {chatStatus && !['done', 'error'].includes(chatStatus.status) && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{chat.name || chat.jid}</span>
                  {chatStatus && (chatStatus.status === 'error' || chatStatus.status === 'queued') && (
                    <AgentStatusBadge status={chatStatus} isDark={isDark} />
                  )}
                </div>
                <div className={`mt-0.5 flex items-center gap-1 truncate text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span>{chat.workspaceInfo ? chat.workspaceInfo.folder : chat.jid}</span>
                </div>
              </div>
              {hasUnread && !chatStatus && (
                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" title="New messages" />
              )}
            </button>
          );
        })}
      </div>

      <div className={`border-t p-3 space-y-2 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <button
          className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 shadow-sm'}`}
          onClick={onOpenSettings}
        >
          <LayoutDashboard className="h-4 w-4" />
          Control Panel
        </button>
        <button
          className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 shadow-sm'}`}
          onClick={onDisconnect}
        >
          <Power className="h-4 w-4" />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
