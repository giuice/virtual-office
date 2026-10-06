import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import {
  AttachmentUploadAbortedError,
  cancelPendingAttachment,
  uploadPendingAttachment,
} from '@/lib/messaging/attachment-upload-client';
import { describeUploadFailure, selectPendingFiles } from '@/lib/messaging/pending-attachment-validation';
import { voiceNoteFileName } from '@/lib/messaging/voice-recording';
import type { VoiceRecording } from '@/hooks/ui/use-voice-recorder';
import type { FileAttachment } from '@/types/messaging';

export type PendingAttachmentStatus = 'uploading' | 'uploaded' | 'failed';

/** A recorded voice note (T16): uploaded with kind=voice and sent alone. */
export interface PendingVoiceNote {
  durationSeconds: number;
  waveform: number[];
  /** Object URL of the local recording, for the preview player; revoked with the row. */
  previewUrl: string;
  reachedLimit: boolean;
}

/** Shown when files are added to a message that carries a voice note. */
export const VOICE_NOTE_ALONE_FILES_TEXT =
  'Uma nota de voz é enviada sozinha: envie ou descarte a nota antes de anexar arquivos.';

export interface PendingAttachment {
  localId: string;
  file: File;
  status: PendingAttachmentStatus;
  /** Whole percent of the file sent, 0–100. */
  progress: number;
  error: string | null;
  /** The server's pending upload once it succeeded; its id is sent in attachmentIds. */
  uploaded: FileAttachment | null;
  /** Set for a voice note; null for a regular file. */
  voice: PendingVoiceNote | null;
}

function revokePreview(item: PendingAttachment): void {
  if (item.voice) URL.revokeObjectURL(item.voice.previewUrl);
}

/**
 * Files of the message being composed (Phase 4 FR-007/FR-008/FR-009).
 *
 * Each accepted file uploads at once as a pending upload of the conversation,
 * with progress; a failed upload keeps its row with an error until it is
 * retried or removed. Removing a file aborts its upload or cancels the pending
 * upload on the server. Files belong to one conversation and one composer:
 * switching conversations or unmounting discards them (aborting uploads and
 * cancelling pending ones), except uploads named in an in-flight send, which
 * the server may be linking to the new message at that moment.
 *
 * A recorded voice note (T16) is one more pending upload, sent with its
 * duration and waveform; the server requires it to be the message's only
 * attachment, so files are refused while it is pending.
 */
export function useComposerAttachments(conversationId: string | null) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  // Latest list for async callbacks and cleanup; updated together with state.
  const itemsRef = useRef<PendingAttachment[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  const sendingUploadIdsRef = useRef<ReadonlySet<string>>(new Set());

  const commit = useCallback((updater: (previous: PendingAttachment[]) => PendingAttachment[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (localId: string, changes: Partial<PendingAttachment>) => {
      commit((previous) => previous.map((item) => (item.localId === localId ? { ...item, ...changes } : item)));
    },
    [commit]
  );

  const startUpload = useCallback(
    (localId: string, file: File, targetConversationId: string, voice: PendingVoiceNote | null) => {
      const controller = new AbortController();
      controllersRef.current.set(localId, controller);
      patch(localId, { status: 'uploading', progress: 0, error: null, uploaded: null });

      uploadPendingAttachment(file, targetConversationId, {
        signal: controller.signal,
        voice: voice ? { durationSeconds: voice.durationSeconds, waveform: voice.waveform } : undefined,
        onProgress: (fraction) => {
          const progress = Math.round(fraction * 100);
          const current = itemsRef.current.find((item) => item.localId === localId);
          if (current && current.status === 'uploading' && current.progress !== progress) {
            patch(localId, { progress });
          }
        },
      })
        .then((uploaded) => {
          controllersRef.current.delete(localId);
          if (controller.signal.aborted || !itemsRef.current.some((item) => item.localId === localId)) {
            // Removed while its response was on the way: nothing will send it.
            void cancelPendingAttachment(uploaded.id);
            return;
          }
          patch(localId, { status: 'uploaded', progress: 100, uploaded });
        })
        .catch((error: unknown) => {
          if (controllersRef.current.get(localId) === controller) {
            controllersRef.current.delete(localId);
          }
          if (error instanceof AttachmentUploadAbortedError) return;
          patch(localId, { status: 'failed', error: describeUploadFailure(error, { voice: voice !== null }) });
        });
    },
    [patch]
  );

  const addFiles = useCallback(
    (files: readonly File[]) => {
      if (!conversationId || files.length === 0) return;
      if (itemsRef.current.some((item) => item.voice)) {
        setRejections([VOICE_NOTE_ALONE_FILES_TEXT]);
        return;
      }
      const { accepted, rejections: refused } = selectPendingFiles(files, itemsRef.current.length);
      setRejections(refused);
      if (accepted.length === 0) return;
      const added: PendingAttachment[] = accepted.map((file) => ({
        localId: uuidv4(),
        file,
        status: 'uploading',
        progress: 0,
        error: null,
        uploaded: null,
        voice: null,
      }));
      commit((previous) => [...previous, ...added]);
      added.forEach((item) => startUpload(item.localId, item.file, conversationId, null));
    },
    [commit, conversationId, startUpload]
  );

  /**
   * Adds a finished recording as the message's voice note and uploads it.
   * False (nothing added) when the message already carries attachments.
   */
  const addVoiceNote = useCallback(
    (recording: VoiceRecording) => {
      if (!conversationId || itemsRef.current.length > 0) return false;
      const file = new File([recording.blob], voiceNoteFileName(recording.mimeType), { type: recording.mimeType });
      const item: PendingAttachment = {
        localId: uuidv4(),
        file,
        status: 'uploading',
        progress: 0,
        error: null,
        uploaded: null,
        voice: {
          durationSeconds: recording.durationSeconds,
          waveform: recording.waveform,
          previewUrl: URL.createObjectURL(recording.blob),
          reachedLimit: recording.reachedLimit,
        },
      };
      setRejections([]);
      commit((previous) => [...previous, item]);
      startUpload(item.localId, item.file, conversationId, item.voice);
      return true;
    },
    [commit, conversationId, startUpload]
  );

  const remove = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((candidate) => candidate.localId === localId);
      if (!item) return;
      controllersRef.current.get(localId)?.abort();
      controllersRef.current.delete(localId);
      if (item.uploaded && !sendingUploadIdsRef.current.has(item.uploaded.id)) {
        void cancelPendingAttachment(item.uploaded.id);
      }
      revokePreview(item);
      commit((previous) => previous.filter((candidate) => candidate.localId !== localId));
    },
    [commit]
  );

  const retry = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((candidate) => candidate.localId === localId);
      if (!item || item.status !== 'failed' || !conversationId) return;
      startUpload(localId, item.file, conversationId, item.voice);
    },
    [conversationId, startUpload]
  );

  /** Uploads named by an in-flight send are left alone by removal and cleanup. */
  const setSendingUploadIds = useCallback((uploadIds: readonly string[]) => {
    sendingUploadIdsRef.current = new Set(uploadIds);
  }, []);

  /** Drops the rows of files the server linked to a sent message. */
  const clearSent = useCallback(
    (uploadIds: readonly string[]) => {
      const sent = new Set(uploadIds);
      commit((previous) =>
        previous.filter((item) => {
          const wasSent = !!item.uploaded && sent.has(item.uploaded.id);
          if (wasSent) revokePreview(item);
          return !wasSent;
        })
      );
    },
    [commit]
  );

  const dismissRejections = useCallback(() => setRejections([]), []);

  /** Shows refusal messages in the composer's file alert. */
  const reject = useCallback((messages: string[]) => setRejections(messages), []);

  // Files never outlive their conversation or this composer.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      for (const item of itemsRef.current) {
        if (item.uploaded && !sendingUploadIdsRef.current.has(item.uploaded.id)) {
          void cancelPendingAttachment(item.uploaded.id);
        }
        revokePreview(item);
      }
      itemsRef.current = [];
      setItems([]);
      setRejections([]);
    };
  }, [conversationId]);

  const isUploading = items.some((item) => item.status === 'uploading');
  const hasFailed = items.some((item) => item.status === 'failed');

  return {
    items,
    rejections,
    /** True when every file has finished uploading (also when there are none). */
    allUploaded: !isUploading && !hasFailed,
    isUploading,
    hasFailed,
    addFiles,
    addVoiceNote,
    remove,
    retry,
    setSendingUploadIds,
    clearSent,
    dismissRejections,
    reject,
  };
}
