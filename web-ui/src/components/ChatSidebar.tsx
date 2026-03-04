import { Folder, LayoutDashboard, Power } from 'lucide-react';
import type { ChatInfo } from '../api';

interface ChatSidebarProps {
  isDark: boolean;
  chats: ChatInfo[];
  selectedChat: ChatInfo | null;
  connected: boolean;
  error: string | null;
  serverOnline: boolean;
  onSelectChat: (chat: ChatInfo) => void;
  onOpenSettings: () => void;
  onDisconnect: () => void;
}

export default function ChatSidebar({
  isDark, chats, selectedChat, connected, error, serverOnline,
  onSelectChat, onOpenSettings, onDisconnect,
}: ChatSidebarProps) {
  return (
    <aside className={`flex w-64 shrink-0 flex-col border-r ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-50'}`}>
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
        <div className={`mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          Workspaces / Groups
        </div>
        {chats.map((chat) => {
          const active = selectedChat?.jid === chat.jid;
          return (
            <button
              key={chat.jid}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                active
                  ? isDark ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'bg-zinc-100 ring-1 ring-zinc-300'
                  : isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'
              }`}
              onClick={() => onSelectChat(chat)}
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

      <div className={`border-t p-3 space-y-2 ${isDark ? 'border-zinc-800' : 'border-zinc-300'}`}>
        <button
          className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
          onClick={onOpenSettings}
        >
          <LayoutDashboard className="h-4 w-4" />
          Control Panel
        </button>
        <button
          className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
          onClick={onDisconnect}
        >
          <Power className="h-4 w-4" />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
