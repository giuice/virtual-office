// src/components/messaging/message-composer.tsx
'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { FileAttachment, Message } from '@/types/messaging';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Mic, Paperclip, Send, Smile, Image, X } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { VOICE_NOTE_ALONE_FILES_TEXT, useComposerAttachments } from '@/hooks/ui/use-composer-attachments';
import { useVoiceRecorder } from '@/hooks/ui/use-voice-recorder';
import { ATTACHMENT_INPUT_ACCEPT, IMAGE_ATTACHMENT_INPUT_ACCEPT } from '@/lib/messaging/attachment-policy';
import { describeVoiceRecordingProblem } from '@/lib/messaging/voice-recording';
import { cn } from '@/lib/utils';
import { ComposerFileRejections, ComposerPendingFiles } from './ComposerPendingFiles';
import { PendingVoiceNotePreview, VoiceRecordingNotice, VoiceRecordingPanel } from './ComposerVoiceNote';

interface MessageComposerSendOptions {
  /**
   * Composition key (Phase 4 FR-024): the same value for every retry of one
   * composition, a new value for a new composition. The server stores it and
   * answers a repeated key with the message it already saved.
   */
  clientMessageId: string;
  /** Uploaded pending files of the message (FR-008); empty for text only. */
  attachments: FileAttachment[];
}

interface MessageComposerProps {
  onSendMessage: (content: string, options: MessageComposerSendOptions) => Promise<void>;
  /** Conversation the files are uploaded for; files are dropped when it changes. */
  conversationId: string | null;
  replyToMessage?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  onValueChange?: (value: string) => void;
}

function MessageComposerReplyPreview({
  replyToMessage,
  currentUserProfile,
  companyUsers,
  onCancelReply,
}: {
  replyToMessage: Message | null | undefined;
  currentUserProfile: { id: string; displayName?: string } | null | undefined;
  companyUsers: Array<{ id: string; displayName?: string }>;
  onCancelReply?: () => void;
}) {
  if (!replyToMessage) return null;

  const replySender = replyToMessage.senderId
    ? (replyToMessage.senderId === currentUserProfile?.id
        ? currentUserProfile
        : companyUsers.find(user => user.id === replyToMessage.senderId) || null)
    : null;

  return (
    <div className="flex items-start p-2 rounded-md bg-secondary mb-2" data-testid="reply-composer-preview">
      <div className="flex-1 text-sm">
        <div className="font-semibold">
          Replying to {replySender?.displayName || (replyToMessage.senderId ? `User ${replyToMessage.senderId.slice(0, 4)}` : 'System')}
        </div>
        <div className="truncate text-muted-foreground">{replyToMessage.content}</div>
      </div>
      <Button variant="ghost" size="sm" className="size-6 p-0" onClick={onCancelReply} data-testid="reply-preview-dismiss">
        <X className="size-4" />
      </Button>
    </div>
  );
}

// Copy follows the SPEC journey J6 (Portuguese); the rest of this composer
// predates it and is still in English.
const SEND_FAILED_TEXT = 'Mensagem não enviada.';
const RETRY_SEND_TEXT = 'Tentar de novo';
const DROP_FILES_TEXT = 'Solte os arquivos para anexar';
const RECORD_VOICE_TEXT = 'Gravar nota de voz';
const RECORDING_FILES_TEXT = 'Termine a gravação antes de anexar arquivos: uma nota de voz é enviada sozinha.';

function hasDraggedFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** Order-independent identity of an attachment set, for the composition key. */
function attachmentSetKey(attachments: readonly FileAttachment[]): string {
  return attachments.map((attachment) => attachment.id).sort().join(',');
}

function MessageComposerSendError({
  canRetry,
  onRetry,
}: {
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 mb-2 text-sm text-destructive"
      data-testid="composer-send-error"
    >
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{SEND_FAILED_TEXT}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onRetry}
        disabled={!canRetry}
        data-testid="composer-send-retry"
      >
        {RETRY_SEND_TEXT}
      </Button>
    </div>
  );
}

export function MessageComposer({
  onSendMessage,
  conversationId,
  replyToMessage,
  onCancelReply,
  disabled = false,
  placeholder = "Type a message...",
  initialValue = "",
  onValueChange
}: MessageComposerProps) {
  const [content, setContent] = useState(initialValue);
  // A failed send keeps the draft (text and, via the parent, the reply
  // target) in the composer; this flag drives the error + retry row.
  const [sendFailed, setSendFailed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // Synchronous guard: a double click/Enter lands before React re-renders
  // the disabled send button, and must not create a second message.
  const sendInFlightRef = useRef(false);
  // The last composition submitted without a confirmed send. A retry of the
  // same text and reply target reuses its key, so a create that committed on
  // the server but lost its response is not stored twice; any other draft is
  // a new composition with a new key.
  const unconfirmedSendRef = useRef<{
    key: string;
    content: string;
    replyToId: string | null;
    attachments: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const { companyUsers, currentUserProfile } = useCompany();
  const {
    items: pendingFiles,
    rejections: fileRejections,
    allUploaded,
    addFiles,
    addVoiceNote,
    remove: removePendingFile,
    retry: retryPendingFile,
    setSendingUploadIds,
    clearSent,
    dismissRejections,
    reject: rejectFiles,
  } = useComposerAttachments(conversationId);
  // Voice note (T16): a finished recording becomes the message's only
  // attachment and uploads at once, like a file; text may go with it.
  const recorder = useVoiceRecorder({ conversationId, onRecorded: addVoiceNote });
  const isRecording = recorder.status !== 'idle';
  const voiceNote = pendingFiles.find((item) => item.voice) ?? null;
  const regularFiles = voiceNote ? pendingFiles.filter((item) => !item.voice) : pendingFiles;
  const recordingUnavailable =
    recorder.support === 'unsupported'
      ? 'unsupported'
      : regularFiles.length > 0
        ? 'files-pending'
        : voiceNote
          ? 'voice-pending'
          : null;
  const hasDraft = !!content.trim() || pendingFiles.length > 0;
  // A message is sent only once every file has finished uploading (BR-007)
  // and never in the middle of a recording.
  const canSubmit = hasDraft && allUploaded && !disabled && !isRecording;
  
  // Set focus on textarea when reply mode is activated
  useEffect(() => {
    if (replyToMessage && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyToMessage]);
  
  // Handle content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    // Nothing left to retry once the draft is erased.
    if (!newContent.trim() && pendingFiles.length === 0) {
      setSendFailed(false);
      unconfirmedSendRef.current = null;
    }
    
    // Call onValueChange callback if provided
    if (onValueChange) {
      onValueChange(newContent);
    }
  };
  
  const submitDraft = async () => {
    if (!canSubmit || sendInFlightRef.current) return;

    const submittedContent = content;
    const attachments = pendingFiles.flatMap((file) => (file.uploaded ? [file.uploaded] : []));
    const attachmentIds = attachments.map((attachment) => attachment.id);
    const composition = {
      content: submittedContent.trim(),
      replyToId: replyToMessage?.id ?? null,
      attachments: attachmentSetKey(attachments),
    };
    const unconfirmed = unconfirmedSendRef.current;
    const clientMessageId =
      unconfirmed &&
      unconfirmed.content === composition.content &&
      unconfirmed.replyToId === composition.replyToId &&
      unconfirmed.attachments === composition.attachments
        ? unconfirmed.key
        : uuidv4();
    unconfirmedSendRef.current = { key: clientMessageId, ...composition };
    sendInFlightRef.current = true;
    setSendingUploadIds(attachmentIds);
    setIsSending(true);
    setSendFailed(false);
    try {
      await onSendMessage(submittedContent, { clientMessageId, attachments });
      unconfirmedSendRef.current = null;
      // Clear only what was sent: text typed or files added while the send
      // was in flight belong to the next message and must survive.
      setContent((current) => (current === submittedContent ? '' : current));
      clearSent(attachmentIds);
    } catch (error) {
      console.error('Failed to send message:', error);
      // The draft (text, reply target, files) stays in the composer; the
      // user can retry it.
      setSendFailed(true);
    } finally {
      sendInFlightRef.current = false;
      setSendingUploadIds([]);
      setIsSending(false);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitDraft();
  };

  const handleRetry = () => {
    void submitDraft();
    textareaRef.current?.focus();
  };

  // Handle key press (Enter to send, Shift+Enter for new line)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Files and a voice note never share a message (the server refuses it).
  const filesBlockedReason = voiceNote ? VOICE_NOTE_ALONE_FILES_TEXT : isRecording ? RECORDING_FILES_TEXT : null;

  const addFilesToDraft = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (filesBlockedReason) {
        rejectFiles([filesBlockedReason]);
        return;
      }
      addFiles(files);
    },
    [addFiles, filesBlockedReason, rejectFiles]
  );

  // Handle file selection: the paperclip offers every allowed type, the image
  // button only images; both feed the same pending-files rules (FR-007/FR-008).
  const openFilePicker = (input: HTMLInputElement | null) => {
    if (filesBlockedReason) {
      rejectFiles([filesBlockedReason]);
      return;
    }
    input?.click();
  };
  const handleFileUpload = () => openFilePicker(fileInputRef.current);
  const handleImageUpload = () => openFilePicker(imageInputRef.current);

  const handleRecordClick = () => {
    if (disabled || isRecording) return;
    if (recordingUnavailable) {
      recorder.reportProblem(recordingUnavailable);
      return;
    }
    dismissRejections();
    void recorder.start();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFilesToDraft(Array.from(e.target.files ?? []));
    // Let the same file be picked again after it was removed.
    e.target.value = '';
  };

  // Ctrl+V of an image adds it as a file (FR-012). A clipboard that also
  // holds text (e.g. cells copied from a spreadsheet, which come with a
  // picture of them) pastes as text, as before.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || e.clipboardData.getData('text/plain')) return;
    const images = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    e.preventDefault();
    addFilesToDraft(images);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingFiles) setIsDraggingFiles(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingFiles(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDraggingFiles(false);
    if (disabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    addFilesToDraft(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      className={cn(
        'relative flex flex-col w-full rounded-md',
        isDraggingFiles && 'ring-2 ring-primary ring-offset-2'
      )}
      data-testid="composer"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/90 text-sm font-medium"
          data-testid="composer-drop-overlay"
        >
          {DROP_FILES_TEXT}
        </div>
      )}
      <MessageComposerReplyPreview
        replyToMessage={replyToMessage}
        currentUserProfile={currentUserProfile}
        companyUsers={companyUsers}
        onCancelReply={onCancelReply}
      />

      {sendFailed && (
        <MessageComposerSendError
          canRetry={canSubmit && !isSending}
          onRetry={handleRetry}
        />
      )}

      <ComposerFileRejections rejections={fileRejections} onDismiss={dismissRejections} />
      {recorder.problem && <VoiceRecordingNotice problem={recorder.problem} onDismiss={recorder.clearProblem} />}
      {isRecording && (
        <VoiceRecordingPanel
          status={recorder.status}
          elapsedMs={recorder.elapsedMs}
          levels={recorder.levels}
          roomMicMuted={recorder.roomMicMuted}
          onStop={() => recorder.stop()}
          onCancel={recorder.cancel}
        />
      )}
      {voiceNote && (
        <PendingVoiceNotePreview
          item={voiceNote}
          locked={isSending}
          onDiscard={removePendingFile}
          onRetry={retryPendingFile}
        />
      )}
      <ComposerPendingFiles
        items={regularFiles}
        locked={isSending}
        onRemove={removePendingFile}
        onRetry={retryPendingFile}
      />

      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="min-h-[96px] resize-none pb-11"
            disabled={disabled}
          />
          
          <div className="absolute bottom-2 right-2 flex items-center gap-x-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleFileUpload}
              disabled={disabled}
              aria-disabled={filesBlockedReason ? true : undefined}
              aria-label="Anexar arquivos"
              title={filesBlockedReason ?? 'Anexar arquivos (até 5, 10 MB cada)'}
              data-testid="composer-attach-button"
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleImageUpload}
              disabled={disabled}
              aria-disabled={filesBlockedReason ? true : undefined}
              aria-label="Anexar imagens"
              title={filesBlockedReason ?? 'Anexar imagens (até 5, 10 MB cada)'}
              data-testid="composer-image-button"
            >
              <Image className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={disabled}
              aria-label="Insert emoji"
              data-testid="composer-emoji-button"
            >
              <Smile className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-8', recordingUnavailable && 'opacity-50')}
              onClick={handleRecordClick}
              disabled={disabled || isRecording}
              aria-disabled={recordingUnavailable ? true : undefined}
              aria-label={RECORD_VOICE_TEXT}
              title={
                recordingUnavailable
                  ? describeVoiceRecordingProblem(recordingUnavailable).reason
                  : `${RECORD_VOICE_TEXT} (até 2 minutos)`
              }
              data-testid="voice-record-button"
            >
              <Mic className="size-4" aria-hidden="true" />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              disabled={disabled}
              multiple
              accept={ATTACHMENT_INPUT_ACCEPT}
              onChange={handleFileInputChange}
              tabIndex={-1}
              aria-hidden="true"
              data-testid="composer-file-input"
            />
            <input
              type="file"
              ref={imageInputRef}
              className="hidden"
              disabled={disabled}
              multiple
              accept={IMAGE_ATTACHMENT_INPUT_ACCEPT}
              onChange={handleFileInputChange}
              tabIndex={-1}
              aria-hidden="true"
              data-testid="composer-image-input"
            />
            <Button
              type="submit"
              disabled={!canSubmit || isSending}
              aria-busy={isSending}
              aria-label="Send message"
              className="size-8 p-0"
              data-testid="message-send-button"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
