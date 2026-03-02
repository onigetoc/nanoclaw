import type { ChatInfo, Message } from './api';

export interface ChatState {
  chats: ChatInfo[];
  selectedChat: ChatInfo | null;
  messages: Message[];
  connected: boolean;
  loading: boolean;
  error: string | null;
}

export function sanitizeMessageContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length > 0 && lines[0].trim() === '0') {
    return lines.slice(1).join('\n').trimStart();
  }

  return normalized.replace(/^\s*0\s+/, '').trimStart();
}

export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(timestamp: string): string {
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
}

export function openExternalLink(href?: string): void {
  if (!href) return;
  const url = href.trim();
  const isAllowed = /^(https?:\/\/|mailto:|tel:)/i.test(url);
  if (!isAllowed) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
