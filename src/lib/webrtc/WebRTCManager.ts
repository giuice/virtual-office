/**
 * Room-scoped P2P media manager.
 *
 * One RTCPeerConnection is retained per application user. Microphone and display
 * media are separate owned roles on that same connection; the manager never uses
 * display activity to initialize or alter microphone state.
 */

import { getIceServers, ROOM_LIMITS } from './ice-config';
import { VoiceActivityDetector } from '@/lib/audio/VoiceActivityDetector';
import type { RealtimeChannel } from '@supabase/supabase-js';

const MAX_PENDING_ICE_PER_PEER = 32;
const MAX_PENDING_ICE_PEERS = 64;

export type SignalingEvent =
  | { type: 'handshake'; userId: string }
  | {
    type: 'description';
    targetUserId: string;
    targetPresenceSessionId: string;
    targetConnectionId: string;
    senderId: string;
    description: RTCSessionDescriptionInit;
  }
  | {
    type: 'ice';
    targetUserId: string;
    targetPresenceSessionId: string;
    targetConnectionId: string;
    senderId: string;
    candidate: RTCIceCandidateInit;
  };

export type WebRTCSignalSender = (event: SignalingEvent) => Promise<void>;

export interface RemoteDisplayEvent {
  peerId: string;
  shareId: string | null;
  stream: MediaStream;
}

export interface PeerConnection {
  pc: RTCPeerConnection;
  userId: string;
  presenceSessionId: string | null;
  connectionId: string | null;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  microphoneSender?: RTCRtpSender;
  displaySender?: RTCRtpSender;
  audioElement?: HTMLAudioElement;
  remoteAudioStream?: MediaStream;
  remoteDisplayStream?: MediaStream;
  remoteShareId: string | null;
}

export interface WebRTCManagerEvents {
  onPeerConnected: (userId: string) => void;
  onPeerDisconnected: (userId: string) => void;
  onPeerSpeaking: (userId: string, isSpeaking: boolean) => void;
  onRemoteDisplay: (event: RemoteDisplayEvent) => void;
  onLocalDisplayStopped: (shareId: string, reason: string) => void;
  onError: (error: Error) => void;
  onRoomLimitWarning: (currentCount: number) => void;
}

export class WebRTCManager {
  private readonly spaceId: string;
  private readonly currentUserId: string;
  private microphoneStream: MediaStream | null = null;
  private microphoneAcquirePromise: Promise<MediaStream> | null = null;
  private displayStream: MediaStream | null = null;
  private displayShareId: string | null = null;
  private displayEndedListener: (() => void) | null = null;
  private readonly peerConnections = new Map<string, PeerConnection>();
  private readonly pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  private readonly audioElements = new Map<string, HTMLAudioElement>();
  private readonly vadMap = new Map<string, VoiceActivityDetector>();
  private signalingChannel: RealtimeChannel | null = null;
  private signalSender: WebRTCSignalSender | null = null;
  private presenceSessionId: string | null = null;
  private connectionId: string | null = null;
  private readonly events: Partial<WebRTCManagerEvents>;
  private isMuted = true;
  private pendingAudioRetryInterval: ReturnType<typeof setInterval> | null = null;
  private lifecycleGeneration = 0;
  private cleanedUp = false;

  constructor(spaceId: string, currentUserId: string, events?: Partial<WebRTCManagerEvents>) {
    this.spaceId = spaceId;
    this.currentUserId = currentUserId;
    this.events = events ?? {};
    this.startAudioRetryInterval();
  }

  setSignalingIdentity(presenceSessionId: string, connectionId: string): void {
    this.presenceSessionId = presenceSessionId;
    this.connectionId = connectionId;
  }

  /** Request microphone access only after an explicit microphone gesture. */
  async initializeLocalStream(): Promise<MediaStream> {
    if (this.cleanedUp) throw new Error('WEBRTC_MANAGER_CLEANED_UP');
    if (this.microphoneStream && this.isStreamLive(this.microphoneStream)) return this.microphoneStream;
    if (this.microphoneAcquirePromise) return this.microphoneAcquirePromise;

    const acquisitionGeneration = this.lifecycleGeneration;
    const acquisition = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then(async (stream) => {
      if (this.cleanedUp || this.lifecycleGeneration !== acquisitionGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('WEBRTC_MANAGER_CLEANED_UP');
      }
      const priorStream = this.microphoneStream;
      this.microphoneStream = stream;
      this.setMuted(this.isMuted);
      await Promise.all([...this.peerConnections.values()].map((peer) => this.attachOrReplaceMicrophone(peer, stream)));
      if (priorStream && priorStream !== stream) priorStream.getTracks().forEach((track) => track.stop());
      return stream;
    }).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error('Failed to get user media');
      this.events.onError?.(err);
      throw err;
    }).finally(() => {
      if (this.microphoneAcquirePromise === acquisition) this.microphoneAcquirePromise = null;
    });
    this.microphoneAcquirePromise = acquisition;
    return acquisition;
  }

  /** Attach an already-authorized display stream without touching microphone media. */
  async startScreenShare(stream: MediaStream, shareId: string): Promise<void> {
    if (this.displayStream) this.releaseDisplay('replaced');
    const displayTrack = stream.getVideoTracks()[0];
    if (!displayTrack) throw new Error('DISPLAY_TRACK_MISSING');

    this.displayStream = stream;
    this.displayShareId = shareId;
    this.displayEndedListener = () => this.releaseDisplay('browser-ended');
    displayTrack.addEventListener?.('ended', this.displayEndedListener, { once: true });
    await Promise.all([...this.peerConnections.values()].map((peer) => this.attachDisplay(peer)));
  }

  async stopScreenShare(reason = 'stopped'): Promise<void> {
    this.releaseDisplay(reason);
  }

  setSignalingChannel(channel: RealtimeChannel | null, signalSender?: WebRTCSignalSender): void {
    this.signalingChannel = channel;
    this.signalSender = channel ? signalSender ?? null : null;
  }

  async broadcastHandshake(): Promise<void> {
    await this.sendSignal({ type: 'handshake', userId: this.currentUserId });
  }

  async renegotiateExistingPeers(): Promise<void> {
    await Promise.all([...this.peerConnections.values()].map((peer) => this.negotiate(peer)));
  }

  async handleHandshake(senderId: string, presenceSessionId?: string, connectionId?: string): Promise<void> {
    if (senderId === this.currentUserId) return;
    const existing = this.peerConnections.get(senderId);
    if (existing) {
      if (this.isSameRemoteInstance(existing, presenceSessionId, connectionId)) {
        await this.negotiate(existing);
        return;
      }
      this.cleanupPeer(senderId);
    }
    if (this.peerConnections.size >= ROOM_LIMITS.SOFT_WARNING) this.events.onRoomLimitWarning?.(this.peerConnections.size + 1);
    const peer = this.createPeerConnection(senderId, presenceSessionId, connectionId);
    await this.negotiate(peer);
  }

  async handleOffer(senderId: string, targetUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.handleDescription(senderId, targetUserId, sdp);
  }

  async handleAnswer(senderId: string, targetUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.handleDescription(senderId, targetUserId, sdp);
  }

  /** Complete MDN perfect-negotiation description path for initial and renegotiated media. */
  async handleDescription(
    senderId: string,
    targetUserId: string,
    description: RTCSessionDescriptionInit,
    shareId: string | null = null,
    sourcePresenceSessionId?: string,
    sourceConnectionId?: string,
    targetPresenceSessionId?: string,
    targetConnectionId?: string,
  ): Promise<void> {
    if (targetUserId !== this.currentUserId || senderId === this.currentUserId || !this.matchesLocalInstance(targetPresenceSessionId, targetConnectionId)) return;
    let peer = this.peerConnections.get(senderId);
    if (peer && !this.isSameRemoteInstance(peer, sourcePresenceSessionId, sourceConnectionId)) return;
    if (!peer) {
      if (this.peerConnections.size >= ROOM_LIMITS.SOFT_WARNING) this.events.onRoomLimitWarning?.(this.peerConnections.size + 1);
      peer = this.createPeerConnection(senderId, sourcePresenceSessionId, sourceConnectionId);
    }
    peer.remoteShareId = shareId;

    const isOffer = description.type === 'offer';
    const readyForOffer = !peer.makingOffer && (peer.pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
    const offerCollision = isOffer && !readyForOffer;
    peer.ignoreOffer = !peer.polite && offerCollision;
    if (peer.ignoreOffer) {
      this.pendingIceCandidates.delete(senderId);
      return;
    }

    peer.isSettingRemoteAnswerPending = description.type === 'answer';
    try {
      await peer.pc.setRemoteDescription(description);
    } finally {
      peer.isSettingRemoteAnswerPending = false;
    }
    await this.drainIceCandidates(peer);

    if (isOffer) {
      try {
        await peer.pc.setLocalDescription();
        await this.sendCurrentDescription(peer);
      } catch (error) {
        await this.recoverAfterSignalFailure(peer);
        throw error;
      }
    }
  }

  async handleIceCandidate(senderId: string, targetUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (targetUserId !== this.currentUserId) return;
    const peer = this.peerConnections.get(senderId);
    if (!peer || peer.ignoreOffer || peer.isSettingRemoteAnswerPending || !peer.pc.remoteDescription) {
      this.queueIceCandidate(senderId, candidate);
      return;
    }
    await this.addIceCandidate(peer, candidate);
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.microphoneStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }

  getMuted(): boolean { return this.isMuted; }
  toggleMute(): boolean { this.setMuted(!this.isMuted); return this.isMuted; }
  getLocalStream(): MediaStream | null { return this.microphoneStream; }
  getActiveShareId(): string | null { return this.displayShareId; }
  getConnectedPeers(): string[] { return [...this.peerConnections.keys()]; }
  getPeerCount(): number { return this.peerConnections.size; }

  cleanupPeer(peerId: string): void {
    this.pendingIceCandidates.delete(peerId);
    const peer = this.peerConnections.get(peerId);
    if (peer) {
      if (peer.microphoneSender) peer.pc.removeTrack(peer.microphoneSender);
      if (peer.displaySender) peer.pc.removeTrack(peer.displaySender);
      peer.pc.getTransceivers().forEach((transceiver) => transceiver.stop());
      peer.pc.ontrack = null;
      peer.pc.onicecandidate = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.onnegotiationneeded = null;
      peer.pc.close();
      this.peerConnections.delete(peerId);
    }
    this.cleanupRemoteAudio(peerId);
  }

  resumeRemoteAudio(): void { this.audioElements.forEach((element) => { void element.play().catch(() => undefined); }); }

  cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.lifecycleGeneration += 1;
    this.releaseDisplay('cleanup');
    [...this.peerConnections.keys()].forEach((peerId) => this.cleanupPeer(peerId));
    this.pendingIceCandidates.clear();
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream = null;
    this.audioElements.forEach((element) => { element.srcObject = null; element.remove(); });
    this.audioElements.clear();
    this.vadMap.forEach((vad) => vad.stop());
    this.vadMap.clear();
    if (this.pendingAudioRetryInterval) { clearInterval(this.pendingAudioRetryInterval); this.pendingAudioRetryInterval = null; }
    this.signalingChannel = null;
    this.signalSender = null;
  }

  private createPeerConnection(peerId: string, presenceSessionId?: string, connectionId?: string): PeerConnection {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    const peer: PeerConnection = {
      pc, userId: peerId, presenceSessionId: presenceSessionId ?? null, connectionId: connectionId ?? null,
      polite: this.currentUserId.localeCompare(peerId) > 0, makingOffer: false, ignoreOffer: false,
      isSettingRemoteAnswerPending: false, remoteShareId: null,
    };
    pc.onnegotiationneeded = () => { void this.negotiate(peer).catch((error: unknown) => this.reportError(error)); };
    pc.ontrack = (event) => this.handleRemoteTrack(peer, event);
    pc.onicecandidate = (event) => {
      if (!event.candidate || peer.ignoreOffer || !peer.presenceSessionId || !peer.connectionId) return;
      void this.sendSignal({ type: 'ice', targetUserId: peerId, targetPresenceSessionId: peer.presenceSessionId, targetConnectionId: peer.connectionId, senderId: this.currentUserId, candidate: event.candidate.toJSON() }).catch((error: unknown) => this.reportError(error));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.events.onPeerConnected?.(peerId);
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') { this.cleanupPeer(peerId); this.events.onPeerDisconnected?.(peerId); }
    };
    this.peerConnections.set(peerId, peer);
    void this.attachOrReplaceMicrophone(peer, this.microphoneStream).catch((error: unknown) => this.reportError(error));
    void this.attachDisplay(peer).catch((error: unknown) => this.reportError(error));
    return peer;
  }

  private async attachOrReplaceMicrophone(peer: PeerConnection, stream: MediaStream | null): Promise<void> {
    const track = stream?.getAudioTracks()[0];
    if (!track || !stream) return;
    if (peer.microphoneSender) { await peer.microphoneSender.replaceTrack(track); return; }
    peer.microphoneSender = peer.pc.addTrack(track, stream);
  }

  private async attachDisplay(peer: PeerConnection): Promise<void> {
    const stream = this.displayStream;
    const track = stream?.getVideoTracks()[0];
    if (!track || !stream || peer.displaySender) return;
    peer.displaySender = peer.pc.addTrack(track, stream);
  }

  private releaseDisplay(reason: string): void {
    const stream = this.displayStream;
    const shareId = this.displayShareId;
    const listener = this.displayEndedListener;
    if (!stream || !shareId) return;
    this.displayStream = null;
    this.displayShareId = null;
    this.displayEndedListener = null;
    const displayTrack = stream.getVideoTracks()[0];
    if (displayTrack && listener) displayTrack.removeEventListener?.('ended', listener);
    this.peerConnections.forEach((peer) => {
      if (!peer.displaySender) return;
      peer.pc.removeTrack(peer.displaySender);
      peer.displaySender = undefined;
    });
    stream.getTracks().forEach((track) => track.stop());
    this.events.onLocalDisplayStopped?.(shareId, reason);
  }

  private async negotiate(peer: PeerConnection): Promise<void> {
    if (peer.pc.signalingState !== 'stable') return;
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      await this.sendCurrentDescription(peer);
    } catch (error) {
      await this.recoverAfterSignalFailure(peer);
      throw error;
    } finally {
      peer.makingOffer = false;
    }
  }

  private async recoverAfterSignalFailure(peer: PeerConnection): Promise<void> {
    if (peer.pc.signalingState === 'have-local-offer') {
      try { await peer.pc.setLocalDescription({ type: 'rollback' }); } catch { /* next valid negotiation can recover */ }
    }
  }

  private async sendCurrentDescription(peer: PeerConnection): Promise<void> {
    const description = peer.pc.localDescription;
    if (!description || !peer.presenceSessionId || !peer.connectionId) return;
    await this.sendSignal({
      type: 'description', targetUserId: peer.userId, targetPresenceSessionId: peer.presenceSessionId,
      targetConnectionId: peer.connectionId, senderId: this.currentUserId,
      description: { type: description.type, sdp: description.sdp ?? undefined },
    });
  }

  private async sendSignal(event: SignalingEvent): Promise<void> {
    if (this.signalSender) { await this.signalSender(event); return; }
    if (!this.signalingChannel) throw new Error('SIGNALING_UNAVAILABLE');
    const result = await this.signalingChannel.send({ type: 'broadcast', event: event.type, payload: event });
    if (result !== 'ok') throw new Error('SIGNALING_SEND_FAILED');
  }

  private queueIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    let queue = this.pendingIceCandidates.get(peerId);
    if (!queue) {
      if (this.pendingIceCandidates.size >= MAX_PENDING_ICE_PEERS) return;
      queue = [];
      this.pendingIceCandidates.set(peerId, queue);
    }
    if (queue.length >= MAX_PENDING_ICE_PER_PEER) queue.shift();
    queue.push(candidate);
  }

  private async drainIceCandidates(peer: PeerConnection): Promise<void> {
    const queued = this.pendingIceCandidates.get(peer.userId);
    if (!queued || peer.ignoreOffer || !peer.pc.remoteDescription) return;
    this.pendingIceCandidates.delete(peer.userId);
    for (const candidate of queued) await this.addIceCandidate(peer, candidate);
  }

  private async addIceCandidate(peer: PeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
    try { await peer.pc.addIceCandidate(candidate); } catch (error) { if (!peer.ignoreOffer) throw error; }
  }

  private matchesLocalInstance(targetPresenceSessionId?: string, targetConnectionId?: string): boolean {
    if (!this.presenceSessionId || !this.connectionId) return targetPresenceSessionId === undefined && targetConnectionId === undefined;
    return targetPresenceSessionId === this.presenceSessionId && targetConnectionId === this.connectionId;
  }

  private isSameRemoteInstance(peer: PeerConnection, presenceSessionId?: string, connectionId?: string): boolean {
    return peer.presenceSessionId === (presenceSessionId ?? null) && peer.connectionId === (connectionId ?? null);
  }

  private isStreamLive(stream: MediaStream): boolean {
    return stream.getTracks().some((track) => track.readyState !== 'ended');
  }

  private handleRemoteTrack(peer: PeerConnection, event: RTCTrackEvent): void {
    const [stream] = event.streams;
    if (!stream) return;
    if (event.track.kind === 'video') { peer.remoteDisplayStream = stream; this.events.onRemoteDisplay?.({ peerId: peer.userId, shareId: peer.remoteShareId, stream }); return; }
    if (event.track.kind !== 'audio') return;
    let audioElement = this.audioElements.get(peer.userId);
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.autoplay = true;
      audioElement.setAttribute('playsinline', '');
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);
      this.audioElements.set(peer.userId, audioElement);
    }
    audioElement.srcObject = stream;
    void audioElement.play().catch(() => undefined);
    peer.remoteAudioStream = stream;
    this.vadMap.get(peer.userId)?.stop();
    this.vadMap.set(peer.userId, new VoiceActivityDetector(stream, { onSpeakingChange: (isSpeaking) => this.events.onPeerSpeaking?.(peer.userId, isSpeaking) }));
  }

  private cleanupRemoteAudio(peerId: string): void {
    const audioElement = this.audioElements.get(peerId);
    if (audioElement) { audioElement.srcObject = null; audioElement.remove(); this.audioElements.delete(peerId); }
    const vad = this.vadMap.get(peerId);
    if (vad) { vad.stop(); this.vadMap.delete(peerId); }
  }

  private startAudioRetryInterval(): void {
    this.pendingAudioRetryInterval = setInterval(() => {
      this.audioElements.forEach((element) => { if (element.paused && element.srcObject) void element.play().catch(() => undefined); });
    }, 500);
  }

  private reportError(error: unknown): void { this.events.onError?.(error instanceof Error ? error : new Error('WebRTC operation failed')); }
}
