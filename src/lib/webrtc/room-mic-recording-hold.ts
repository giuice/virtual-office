/**
 * Room microphone ↔ voice-note recording coordination (Phase 4 T17, FR-016).
 *
 * The spatial-audio room microphone lives in `AudioProvider`, which is mounted
 * only inside the floor plan; the messaging drawer (and its voice recorder) is
 * mounted in the root layout, outside it. This module is the small browser-side
 * bridge between the two: the provider registers how to read and set its mute
 * state, and the recorder asks to silence the room mic while it records.
 *
 * Rules:
 * - A recording mutes the room mic only if it is open (joined and unmuted)
 *   when the recording starts; a muted or absent room mic is left alone.
 * - Releasing the hold (recording stopped, discarded, failed, or its composer
 *   gone) reopens the room mic only if this recording muted it and nothing has
 *   changed it since.
 * - If the user changes the room mic during the recording (toggle, keyboard
 *   shortcut, re-enabling audio), the user's choice wins: the hold is dropped
 *   and nothing is reopened later.
 * - If the room audio that was muted goes away (left the room, page left,
 *   media identity changed), the hold is dropped; a new room audio session is
 *   never reopened by an old recording.
 *
 * State is per browser tab (module scope), never shared across users or tabs,
 * and holds no identity: the provider instance itself scopes it.
 */

export interface RoomMicControl {
  /** True while the room audio is joined (the microphone is live, muted or not). */
  isJoined: () => boolean;
  /** True while the room microphone is joined and unmuted. */
  isOpen: () => boolean;
  /** Mutes or reopens the room microphone through the provider's own mute path. */
  setMuted: (muted: boolean) => void;
}

interface RecordingHold {
  control: RoomMicControl;
}

let registeredControl: RoomMicControl | null = null;
/** Non-null only while a recording keeps the room mic muted on its behalf. */
let activeHold: RecordingHold | null = null;
const listeners = new Set<() => void>();

function setActiveHold(next: RecordingHold | null): void {
  if (activeHold === next) return;
  activeHold = next;
  listeners.forEach((listener) => listener());
}

/** Registers the current room audio's mute control; returns its unregister. */
export function registerRoomMicControl(control: RoomMicControl): () => void {
  registeredControl = control;
  return () => {
    if (registeredControl === control) registeredControl = null;
    if (activeHold?.control === control) setActiveHold(null);
  };
}

/** The user changed the room mic: their choice wins over a recording's restore. */
export function noteRoomMicUserChoice(): void {
  setActiveHold(null);
}

/**
 * Silences the room mic for a recording that is starting, if it is open.
 * Returns the release (idempotent), which reopens the room mic only under the
 * rules above.
 */
export function muteRoomMicForRecording(): () => void {
  const control = registeredControl;
  if (!control || !control.isOpen()) return () => {};
  const hold: RecordingHold = { control };
  control.setMuted(true);
  setActiveHold(hold);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (activeHold !== hold) return;
    setActiveHold(null);
    // Reopen only the same room audio, still joined and still muted.
    if (registeredControl === control && control.isJoined() && !control.isOpen()) control.setMuted(false);
  };
}

export function subscribeRoomMicRecordingHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while a recording keeps the room mic muted (drives the composer notice). */
export function isRoomMicMutedForRecording(): boolean {
  return activeHold !== null;
}
