import {
  useState, useRef, useCallback, useEffect,
  type ChangeEvent, type FormEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
} from 'react';
import { AudioLines, Globe, Image as ImageIcon, Paperclip, CornerDownLeft, X, Zap } from 'lucide-react';
import { apiService, type Message } from '../api';
import { ALLOWED_FILE_TYPES, getFileIcon, formatFileSize } from '../utils/file-utils';
import { SUGGESTIONS } from '../utils/models';
import type { UiModel } from '../utils/models';
import ModelSelector from './ModelSelector';
import { parseCommands } from '../utils/command-parser';

interface ComposerBarProps {
  isDark: boolean;
  connected: boolean;
  selectedChatJid: string | null;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  availableModels: UiModel[];
  onSendMessage: (content: string, attachments?: File[], mode?: 'analyze' | 'transfer', agent?: string, model?: string) => Promise<void>;
  onOptimisticMessage: (msg: Message) => void;
  onRemoveOptimisticMessage: (id: string) => void;
  onComposerResize: (height: number) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function ComposerBar({
  isDark, connected, selectedChatJid, selectedModelId, onSelectModel, availableModels,
  onSendMessage, onOptimisticMessage, onRemoveOptimisticMessage, onComposerResize, inputRef,
}: ComposerBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [isComposerDragActive, setIsComposerDragActive] = useState(false);
  const [textareaRows, setTextareaRows] = useState(2);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useMicrophone, setUseMicrophone] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [attachMode, setAttachMode] = useState<'analyze' | 'transfer'>('analyze');
  const [availableAgents, setAvailableAgents] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [selectedMode, setSelectedMode] = useState('build'); // Always default to build

  const composerRef = useRef<HTMLFormElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuContainerRef = useRef<HTMLDivElement>(null);
  const modeMenuContainerRef = useRef<HTMLDivElement>(null);
  const composerDragCounterRef = useRef(0);

  // Load available agents from backend
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const result = await apiService.getAvailableAgents();
        console.log('🎯 Loaded agents from backend:', result.agents);
        setAvailableAgents(result.agents);
      } catch (err) {
        console.error('Failed to load agents:', err);
        // Fallback to defaults
        setAvailableAgents([
          { id: 'build', name: 'Build', description: 'Main development agent with full tool access' },
          { id: 'orchestrator', name: 'Orchestrator', description: 'Intelligent task orchestrator' },
        ]);
      }
    };
    void loadAgents();
  }, []);

  useEffect(() => {
    const lines = inputValue.split('\n').length;
    setTextareaRows(Math.min(Math.max(2, lines), 8));
  }, [inputValue]);

  useEffect(() => {
    const node = composerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      onComposerResize(Math.round(entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onComposerResize]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuOpen && !attachmentMenuContainerRef.current?.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
      if (modeMenuOpen && !modeMenuContainerRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen, modeMenuOpen]);

  const addAttachments = useCallback((files: File[], skipValidation = false) => {
    if (!files.length) return;
    const rejected: string[] = [];
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (!skipValidation && !ALLOWED_FILE_TYPES[file.type]) {
          rejected.push(file.name);
          continue;
        }
        const exists = next.some(
          (c) => c.name === file.name && c.size === file.size && c.lastModified === file.lastModified,
        );
        if (!exists) next.push(file);
      }
      return next;
    });
    if (rejected.length > 0) {
      setRejectedFiles(rejected);
      setTimeout(() => setRejectedFiles([]), 5000);
    }
  }, []);

  const transferHasFiles = (transfer: DataTransfer | null): boolean => {
    if (!transfer) return false;
    if (transfer.files.length > 0) return true;
    return Array.from(transfer.types).includes('Files');
  };

  // Track which mode was selected from the popup — set BEFORE file picker opens
  const pendingModeRef = useRef<'analyze' | 'transfer'>('analyze');

  const handleAttachmentInputFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;
      const mode = pendingModeRef.current;
      setAttachMode(mode);
      addAttachments(files, mode === 'transfer');
      event.currentTarget.value = '';
      setAttachMenuOpen(false);
    },
    [addAttachments],
  );

  const handleComposerDragEnter = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!connected || !transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    composerDragCounterRef.current += 1;
    setIsComposerDragActive(true);
  }, [connected]);

  const handleComposerDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!connected || !transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsComposerDragActive(true);
  }, [connected]);

  const handleComposerDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    composerDragCounterRef.current = Math.max(0, composerDragCounterRef.current - 1);
    if (composerDragCounterRef.current === 0) setIsComposerDragActive(false);
  }, []);

  const handleComposerDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!connected || !transferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      composerDragCounterRef.current = 0;
      setIsComposerDragActive(false);
      addAttachments(Array.from(event.dataTransfer.files ?? []));
    },
    [addAttachments, connected],
  );

  const handleInputPaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (!connected) return;
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
    [addAttachments, connected],
  );

  const handleAudioTranscription = async (audioFile: File) => {
    if (!selectedChatJid) return;
    const userText = inputValue.trim();
    setInputValue('');
    setTextareaRows(2);
    setAttachments([]);

    const optimisticContent = userText || '[Transcribing audio...]';
    const optimisticMsg: Message = {
      id: `local_${Date.now()}`,
      chat_jid: selectedChatJid,
      sender: 'me',
      sender_name: 'You',
      content: optimisticContent,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
    };
    onOptimisticMessage(optimisticMsg);

    try {
      const result = await apiService.sendAudio(selectedChatJid, audioFile);
      onRemoveOptimisticMessage(optimisticMsg.id);
      if (userText) {
        const combinedMessage = `${userText}\n\n[Audio transcrit: "${result.transcribedText}"]`;
        await onSendMessage(combinedMessage);
      }
    } catch (err) {
      console.error('Failed to transcribe audio:', err);
      onRemoveOptimisticMessage(optimisticMsg.id);
      await onSendMessage(`[Audio transcription failed: ${err instanceof Error ? err.message : 'Unknown error'}]`);
    }
  };

  const doSubmit = async () => {
    if (!connected) return;
    const hasText = Boolean(inputValue.trim());
    const hasAttachments = attachments.length > 0;
    if (!hasText && !hasAttachments) return;

    const audioFile = attachments.find(f => f.type.startsWith('audio/'));
    if (audioFile) {
      await handleAudioTranscription(audioFile);
      return;
    }

    // Parse slash commands from input
    const parsed = parseCommands(inputValue);
    
    // Determine final agent and model
    // Priority: slash command > dropdown selection > default
    const finalAgent = parsed.agent || (selectedMode !== 'build' ? selectedMode : undefined);
    
    // Always send the selected model so the backend uses it instead of opencode.json default.
    // Model IDs are already stored as "provider/modelId" (e.g. "opencode/big-pickle", "google/gemini-2.0-flash-exp")
    // which is exactly the format parseModelOverride expects in agent-runner.
    const finalModel = parsed.model || selectedModelId || undefined;

    // Safety: model IDs must be in "provider/modelId" format for the backend.
    // If somehow an old-format ID slipped through, don't send it.
    const validModel = finalModel && finalModel.includes('/') ? finalModel : undefined;

    console.log('🎯 Model selection:', { selectedModelId, parsedModel: parsed.model, finalModel, validModel, finalAgent });

    const outgoingText = parsed.message || (hasAttachments
      ? `Sent with attachments (${attachments.length} file${attachments.length > 1 ? 's' : ''})`
      : inputValue);
    
    const currentAttachments = [...attachments];
    const currentMode = attachMode;
    setInputValue('');
    setTextareaRows(2);
    setAttachments([]);
    setAttachMode('analyze');
    
    await onSendMessage(outgoingText, currentAttachments, currentMode, finalAgent, validModel);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await doSubmit();
  };

  const handleInputKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await doSubmit();
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    if (!connected) return;
    setAttachments([]);
    await onSendMessage(suggestion);
  };

  return (
    <>
      {rejectedFiles.length > 0 && (
        <div className={`absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg border px-4 py-2.5 shadow-xl ${isDark ? 'border-rose-700 bg-rose-900/90 text-rose-200' : 'border-rose-300 bg-rose-100 text-rose-800'}`}>
          <div className="flex items-center gap-2">
            <X className="h-4 w-4" />
            <span className="text-sm font-medium">Fichier(s) non autorisé(s): {rejectedFiles.join(', ')}</span>
          </div>
        </div>
      )}

      <form ref={composerRef} className="px-3 py-3 md:px-6" onSubmit={handleSubmit}>
        <div className="mx-auto w-full max-w-4xl space-y-3">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => { void handleSuggestionClick(suggestion); }}
                className={`rounded-full px-3 py-1.5 text-xs transition ${isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'border border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div
            className={`rounded-2xl p-2.5 transition ${isComposerDragActive
              ? isDark ? 'border border-emerald-500 bg-zinc-800' : 'border border-emerald-500 bg-emerald-50'
              : isDark ? 'bg-zinc-800' : 'border border-zinc-300 bg-zinc-50'}`}
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
              <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2">
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${attachMode === 'analyze' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {attachMode === 'analyze' ? 'Read Media' : 'File Transfer'}
                </span>
                {attachments.map((file) => {
                  const { icon: Icon, color, label } = getFileIcon(file.type);
                  return (
                    <span
                      key={`${file.name}-${file.lastModified}`}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${isDark ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-300 bg-zinc-100'}`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                      <span className={`text-[11px] font-medium ${color}`}>{label}</span>
                      <span className={`max-w-32 truncate text-xs mb-1 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>{file.name}</span>
                      <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        className="shrink-0 cursor-pointer text-zinc-400 transition hover:text-rose-400"
                        onClick={() => setAttachments((prev) => prev.filter((f) => !(f.name === file.name && f.lastModified === file.lastModified)))}
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPaste={handleInputPaste}
              onKeyDown={(e) => { void handleInputKeyDown(e); }}
              placeholder="Write a message… (Shift+Enter to start a new line)"
              disabled={!connected}
              rows={textareaRows}
              className={`w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="relative" ref={attachmentMenuContainerRef}>
                  <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={handleAttachmentInputFiles} />
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition hover:text-emerald-500"
                    title="Attachments"
                    onClick={() => setAttachMenuOpen((v) => !v)}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  {attachMenuOpen && (
                    <div className={`absolute bottom-11 left-0 z-30 min-w-52 rounded-xl border p-1.5 shadow-xl ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
                      <button
                        type="button"
                        onClick={() => {
                          pendingModeRef.current = 'analyze';
                          attachmentInputRef.current?.click();
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${isDark ? 'text-zinc-200 hover:bg-zinc-800' : 'text-zinc-700 hover:bg-zinc-100'}`}
                      >
                        <ImageIcon className="h-4 w-4 text-emerald-500" />
                        <div>
                          <div className="font-medium">Read Media</div>
                          <div className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Analyze images, transcribe audio</div>
                        </div>
                      </button>
                      <div className={`mx-2 my-0.5 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} />
                      <button
                        type="button"
                        onClick={() => {
                          pendingModeRef.current = 'transfer';
                          attachmentInputRef.current?.click();
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${isDark ? 'text-zinc-200 hover:bg-zinc-800' : 'text-zinc-700 hover:bg-zinc-100'}`}
                      >
                        <Paperclip className="h-4 w-4 text-blue-500" />
                        <div>
                          <div className="font-medium">File Transfer</div>
                          <div className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Save files to workspace uploads</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setUseMicrophone((v) => !v)}
                  className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition ${useMicrophone ? 'text-emerald-500' : 'text-zinc-400 hover:text-emerald-500'}`}
                  title="Microphone (UI)"
                >
                  <AudioLines className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setUseWebSearch((v) => !v)}
                  className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-sm transition ${useWebSearch ? 'text-emerald-500' : 'text-zinc-400 hover:text-emerald-500'}`}
                  title="Web search (UI)"
                >
                  <Globe className="h-4 w-4" />
                  Search
                </button>

                <div className="relative" ref={modeMenuContainerRef}>
                  <button
                    type="button"
                    onClick={() => setModeMenuOpen((v) => !v)}
                    className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm transition ${isDark ? 'text-zinc-300 hover:text-emerald-400' : 'text-zinc-600 hover:text-emerald-600'}`}
                    title="Agent mode"
                  >
                    <Zap className="h-4 w-4" />
                    <span className="text-xs font-medium">{availableAgents.find(a => a.id === selectedMode)?.name || 'Build'}</span>
                  </button>
                  {modeMenuOpen && (
                    <div className={`absolute bottom-11 left-0 z-30 min-w-64 rounded-xl border p-1.5 shadow-xl ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
                      {availableAgents.map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            console.log('⚡ Mode changed to:', agent.id, agent.name);
                            setSelectedMode(agent.id);
                            setModeMenuOpen(false);
                          }}
                          className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                            selectedMode === agent.id
                              ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                              : isDark ? 'text-zinc-200 hover:bg-zinc-800' : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <Zap className={`h-4 w-4 shrink-0 ${selectedMode === agent.id ? 'text-emerald-500' : 'text-zinc-400'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{agent.name}</div>
                            <div className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{agent.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <ModelSelector isDark={isDark} selectedModelId={selectedModelId} onSelectModel={onSelectModel} availableModels={availableModels} />
              </div>

              <button
                type="submit"
                disabled={(!inputValue.trim() && attachments.length === 0) || !connected}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-emerald-600 border border-emerald-500 text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                title="Envoyer"
              >
                <CornerDownLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
