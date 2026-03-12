import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Bot } from 'lucide-react';
import type { Message } from '../api';
import { getFileIcon, formatFileSize } from '../utils/file-utils';
import { linkifyMentionsAndCommands, extractReasoning, extractSources } from '../utils/message-utils';
import { sanitizeMessageContent, formatTime, openExternalLink } from '../types';

interface MessageBubbleProps {
  msg: Message;
  isDark: boolean;
  onSendCommand?: (cmd: string) => void;
}

function MessageBubble({ msg, isDark, onSendCommand }: MessageBubbleProps) {
  const sanitizedContent = sanitizeMessageContent(msg.content);
  const { visibleContent, reasoning } = extractReasoning(sanitizedContent);
  const isAssistant = Boolean(msg.is_bot_message);
  const sources = isAssistant ? extractSources(visibleContent) : [];

  return (
    <div className={`flex w-full ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`${isAssistant
          ? 'w-full px-4 py-3'
          : `max-w-[88%] md:max-w-[78%] rounded-2xl rounded-br-md px-5 py-4 ${
              isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-200 text-zinc-900'
            }`}`}
      >
        {isAssistant && (
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Bot className="h-3.5 w-3.5" />
                <span className="font-medium uppercase tracking-wider">{msg.sender_name || 'Assistant'}</span>
              </div>
              {msg.metadata && (msg.metadata.agent || msg.metadata.modelID || msg.metadata.tokens) && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  {msg.metadata.agent && (
                    <span className={`rounded px-1.5 py-0.5 font-medium ${isDark ? 'bg-zinc-700/50 text-zinc-400' : 'bg-zinc-200 text-zinc-700'}`}>{msg.metadata.agent}</span>
                  )}
                  {msg.metadata.modelID && (
                    <span className={`truncate ${isDark ? 'text-zinc-500' : 'text-zinc-600'}`}>{msg.metadata.modelID}</span>
                  )}
                  {msg.metadata.tokens && (
                    <span className={isDark ? 'text-zinc-600' : 'text-zinc-500'}>
                      {(msg.metadata.tokens.total || (msg.metadata.tokens.input + msg.metadata.tokens.output)).toLocaleString()} tokens
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {reasoning && (
          <details className={`mb-2 rounded-lg border p-2 text-xs ${isDark ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300' : 'border-zinc-200 bg-zinc-100 text-zinc-700'}`}>
            <summary className="cursor-pointer select-none font-medium">Reasoning</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{reasoning}</pre>
          </details>
        )}

        {sources.length > 0 && (
          <details className={`mb-2 rounded-lg border p-2 text-xs ${isDark ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300' : 'border-zinc-200 bg-zinc-100 text-zinc-700'}`}>
            <summary className="cursor-pointer select-none font-medium">Sources ({sources.length})</summary>
            <div className="mt-2 space-y-1">
              {sources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  onClick={(e) => { e.preventDefault(); openExternalLink(source.href); }}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="block cursor-pointer truncate text-left text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                  title={source.href}
                >
                  {source.title}
                </a>
              ))}
            </div>
          </details>
        )}

        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {msg.attachments.map((attachment, idx) => {
              const { icon: Icon, color, label } = getFileIcon(attachment.type);
              return (
                <span
                  key={`${attachment.name}-${idx}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${isDark ? 'border-zinc-700 bg-zinc-900/50' : 'border-zinc-300 bg-zinc-50'}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className={`text-[10px] font-medium ${color}`}>{label}</span>
                  <span className={`max-w-32 truncate text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{attachment.name}</span>
                  <span className={`text-[9px] ${isDark ? 'text-zinc-600' : 'text-zinc-500'}`}>{formatFileSize(attachment.size)}</span>
                </span>
              );
            })}
          </div>
        )}

        <div className={`break-words text-base leading-relaxed [&_a]:cursor-pointer [&_a]:text-emerald-300 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-emerald-200 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_ol]:my-2 [&_ol]:list-inside [&_ol]:list-decimal [&_ol]:pl-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-inside [&_ul]:list-disc [&_ul]:pl-1 [&_li]:my-0.5 ${isDark ? 'text-zinc-300 [&_code]:bg-zinc-800 [&_code]:text-emerald-300 [&_pre]:bg-zinc-900 [&_pre]:text-zinc-200' : 'text-zinc-800 [&_code]:bg-zinc-200 [&_code]:text-zinc-700 [&_pre]:bg-zinc-100 [&_pre]:text-zinc-800'}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            urlTransform={(url) => url}
            components={{
              a: ({ node: _node, href, children, ...props }) => {
                const isMention = href?.startsWith('mention:');
                const isCommand = href?.startsWith('command:');

                if (isMention || isCommand) {
                  return (
                    <span
                      {...props}
                      role="button"
                      tabIndex={0}
                      className={`cursor-pointer rounded-sm px-0.5 font-semibold no-underline ${
                        isMention
                          ? 'text-blue-400 hover:bg-blue-500/20 hover:text-blue-300'
                          : 'text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isCommand) {
                          const cmd = href?.split(':')[1] ?? '';
                          onSendCommand?.(cmd);
                        }
                      }}
                    >
                      {children}
                    </span>
                  );
                }

                return (
                  <a
                    {...props}
                    href={href}
                    onClick={(e) => { e.preventDefault(); openExternalLink(href); }}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="cursor-pointer"
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {linkifyMentionsAndCommands(visibleContent)}
          </ReactMarkdown>
        </div>

        <div className={`mt-2 text-right text-[11px] ${isAssistant ? (isDark ? 'text-zinc-500' : 'text-zinc-500') : (isDark ? 'text-zinc-500' : 'text-zinc-400')}`}>
          {formatTime(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

export default memo(MessageBubble, (prev, next) => {
  return (
    prev.msg.id === next.msg.id &&
    prev.msg.content === next.msg.content &&
    prev.isDark === next.isDark
  );
});
