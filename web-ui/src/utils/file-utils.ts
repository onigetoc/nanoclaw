import { Image as ImageIcon, AudioLines, FileVideo, FileText, File } from 'lucide-react';

export const ALLOWED_FILE_TYPES: Record<string, boolean> = {
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
  'image/gif': true,
  'image/webp': true,
  'audio/mpeg': true,
  'audio/mp3': true,
  'audio/ogg': true,
  'audio/wav': true,
  'audio/webm': true,
  'audio/mp4': true,
  'audio/x-m4a': true,
  'video/mp4': true,
  'video/webm': true,
  'video/ogg': true,
  'video/quicktime': true,
  'application/pdf': true,
  'text/plain': true,
  'text/markdown': true,
  'application/json': true,
  'application/zip': true,
  'application/x-zip-compressed': true,
};

export function getFileIcon(mimeType: string): { icon: typeof FileText; color: string; label: string } {
  if (mimeType.startsWith('image/')) {
    return { icon: ImageIcon, color: 'text-blue-400', label: mimeType.split('/')[1].toUpperCase() };
  }
  if (mimeType.startsWith('audio/')) {
    return { icon: AudioLines, color: 'text-purple-400', label: mimeType.split('/')[1].toUpperCase() };
  }
  if (mimeType.startsWith('video/')) {
    return { icon: FileVideo, color: 'text-rose-400', label: mimeType.split('/')[1].toUpperCase() };
  }
  if (mimeType === 'application/pdf') {
    return { icon: FileText, color: 'text-red-400', label: 'PDF' };
  }
  if (mimeType.startsWith('text/')) {
    return { icon: FileText, color: 'text-emerald-400', label: 'TXT' };
  }
  if (mimeType.includes('zip')) {
    return { icon: File, color: 'text-amber-400', label: 'ZIP' };
  }
  return { icon: File, color: 'text-zinc-400', label: 'FILE' };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
