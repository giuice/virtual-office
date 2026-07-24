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

export type SignalingEvent =
  | { type: 'handshake'; userId: string }
  | { type: 'description'; targetUserId: string; senderId: string; description: RTCSessionDescriptionInit }
  | { type: 'ice'; targetUserId: string; senderId: string; candidate: RTCIceCandidateInit };

export type WebRTCSignalSender = (event: SignalingEvent) => Promise<void>;

export interface RemoteDisplayEvent {
  peerId: string;
  shareId: string | null;
  stream: MediaStream;
}

export interface PeerConnection {
  pc: RTCPeerConnection;
  userId: string;
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
  private displayStream: MediaStream | null = null;
  private displayShareId: string | null = null;
  private displayEndedListener: (() => void) | null = null;
  private readonly peerConnections = new Map<string, PeerConnection>();
  private readonly audioElements = new Map<string, HTMLAudioElement>();
  private readonly vadMap = new Map<string, VoiceActivityDetector>();
  private signalingChannel: RealtimeChannel | null = null;
  private signalSender: WebRTCSignalSender | null = null;
  private readonly events: Partial<WebRTCManagerEvents>;
  private isMuted = true;
  private pendingAudioRetryInterval: ReturnType<typeof setInterval> | null = null;

  constructor(spaceId: string, currentUserId: string, events?: Partial<WebRTCManagerEvents>) {
    this.spaceId = spaceId;
    this.currentUserId = currentUserId;
    this.events = events ?? {};
    this.startAudioRetryInterval();
  }

  /** Request microphone access only after an explicit microphone gesture. */
  async initializeLocalStream(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.microphoneStream = stream;
      this.setMuted(true);
      await Promise.all([...this.peerConnections.values()].map((peer) => this.attachMicrophone(peer)));
      return stream;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to get user media');
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * Attach an already-authorized display stream. This never requests, mutates, or
   * stops microphone media.
   */
  async startScreenShare(stream: MediaStream, shareId: string): Promise<void> {
    if (this.displayStream) await this.stopScreenShare('replaced');

    const displayTrack = stream.getVideoTracks()[0];
    if (!displayTrack) throw new Error('DISPLAY_TRACK_MISSING');

    this.displayStream = stream;
    this.displayShareId = shareId;
    this.displayEndedListener = () => {
      void this.stopScreenShare('browser-ended');
    };
    displayTrack.addEventListener?.('ended', this.displayEndedListener, { once: true });

    await Promise.all([...this.peerConnections.values()].map((peer) => this.attachDisplay(peer)));
  }

  async stopScreenShare(reason = 'stopped'): Promise<void> {
    const stream = this.displayStream;
    const shareId = this.displayShareId;
    if (!stream) return;

    const displayTrack = stream.getVideoTracks()[0];
    if (displayTrack && this.displayEndedListener) {
      displayTrack.removeEventListener?.('ended', this.displayEndedListener);
    }
    this.displayEndedListener = null;

    await Promise.all([...this.peerConnections.values()].map((peer) => this.detachDisplay(peer)));
    stream.getTracks().forEach((track) => track.stop());
    this.displayStream = null;
    this.displayShareId = null;
    if (shareId) this.events.onLocalDisplayStopped?.(shareId, reason);
  }

  setSignalingChannel(channel: RealtimeChannel | null, signalSender?: WebRTCSignalSender): void {
    this.signalingChannel = channel;
    this.signalSender = channel ? signalSender ?? null : null;
  }

  async broadcastHandshake(): Promise<void> {
    if (!this.signalingChannel) throw new Error('Signaling channel not set');
    await this.sendSignal({ type: 'handshake', userId: this.currentUserId });
  }

  async handleHandshake(senderId: string): Promise<void> {
    if (senderId === this.currentUserId || this.peerConnections.has(senderId)) return;
    if (this.peerConnections.size >= ROOM_LIMITS.SOFT_WARNING) {
      this.events.onRoomLimitWarning?.(this.peerConnections.size + 1);
    }
    const peer = this.createPeerConnection(senderId);
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
  ): Promise<void> {
    if (targetUserId !== this.currentUserId || senderId === this.currentUserId) return;

    let peer = this.peerConnections.get(senderId);
    if (!peer) {
      if (this.peerConnections.size >= ROOM_LIMITS.SOFT_WARNING) {
        this.events.onRoomLimitWarning?.(this.peerConnections.size + 1);
      }
      peer = this.createPeerConnection(senderId);
    }
    peer.remoteShareId = shareId;

    const isOffer = description.type === 'offer';
    const readyForOffer = !peer.makingOffer &&
      (peer.pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
    const offerCollision = isOffer && !readyForOffer;
    peer.ignoreOffer = !peer.polite && offerCollision;
    if (peer.ignoreOffer) return;

    peer.isSettingRemoteAnswerPending = description.type === 'answer';
    try {
      await peer.pc.setRemoteDescription(description);
    } finally {
      peer.isSettingRemoteAnswerPending = false;
    }

    if (isOffer) {
      await peer.pc.setLocalDescription();
      await this.sendCurrentDescription(peer);
    }
  }

  async handleIceCandidate(senderId: string, targetUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (targetUserId !== this.currentUserId) return;
    const peer = this.peerConnections.get(senderId);
    if (!peer || peer.ignoreOffer) return;
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (error) {
      if (!peer.ignoreOffer) throw error;
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.microphoneStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /** Existing public audio accessor retained for local VAD consumers. */
  getLocalStream(): MediaStream | null {
    return this.microphoneStream;
  }

  getActiveShareId(): string | null {
    return this.displayShareId;
  }

  getConnectedPeers(): string[] {
    return [...this.peerConnections.keys()];
  }

  getPeerCount(): number {
    return this.peerConnections.size;
  }

  cleanupPeer(peerId: string): void {
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

  resumeRemoteAudio(): void {
    this.audioElements.forEach((element) => {
      void element.play().catch(() => undefined);
    });
  }

  cleanup(): void {
    [...this.peerConnections.keys()].forEach((peerId) => this.cleanupPeer(peerId));
    if (this.displayStream) {
      const displayTrack = this.displayStream.getVideoTracks()[0];
      if (displayTrack && this.displayEndedListener) {
        displayTrack.removeEventListener?.('ended', this.displayEndedListener);
      }
      this.displayStream.getTracks().forEach((track) => track.stop());
      this.displayStream = null;
      this.displayShareId = null;
      this.displayEndedListener = null;
    }
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream = null;
    this.audioElements.forEach((element) => {
      element.srcObject = null;
      element.remove();
    });
    this.audioElements.clear();
    this.vadMap.forEach((vad) => vad.stop());
    this.vadMap.clear();
    if (this.pendingAudioRetryInterval) {
      clearInterval(this.pendingAudioRetryInterval);
      this.pendingAudioRetryInterval = null;
    }
    this.signalingChannel = null;
    this.signalSender = null;
  }

  private createPeerConnection(peerId: string): PeerConnection {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    const peer: PeerConnection = {
      pc,
      userId: peerId,
      polite: this.currentUserId.localeCompare(peerId) > 0,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      remoteShareId: null,
    };

    pc.onnegotiationneeded = () => {
      void this.negotiate(peer).catch((error: unknown) => this.reportError(error));
    };
    pc.ontrack = (event) => this.handleRemoteTrack(peer, event);
    pc.onicecandidate = (event) => {
      if (!event.candidate || peer.ignoreOffer) return;
      void this.sendSignal({
        type: 'ice',
        targetUserId: peerId,
        senderId: this.currentUserId,
        candidate: event.candidate.toJSON(),
      }).catch((error: unknown) => this.reportError(error));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.events.onPeerConnected?.(peerId);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.cleanupPeer(peerId);
        this.events.onPeerDisconnected?.(peerId);
      }
    };

    this.peerConnections.set(peerId, peer);
    void this.attachMicrophone(peer).catch((error: unknown) => this.reportError(error));
    void this.attachDisplay(peer).catch((error: unknown) => this.reportError(error));
    return peer;
  }

  private async attachMicrophone(peer: PeerConnection): Promise<void> {
    const track = this.microphoneStream?.getAudioTracks()[0];
    if (!track || peer.microphoneSender) return;
    peer.microphoneSender = peer.pc.addTrack(track, this.microphoneStream!);
  }

  private async attachDisplay(peer: PeerConnection): Promise<void> {
    const track = this.displayStream?.getVideoTracks()[0];
    if (!track || peer.displaySender) return;
    peer.displaySender = peer.pc.addTrack(track, this.displayStream!);
  }

  private async detachDisplay(peer: PeerConnection): Promise<void> {
    if (!peer.displaySender) return;
    peer.pc.removeTrack(peer.displaySender);
    peer.displaySender = undefined;
  }

  private async negotiate(peer: PeerConnection): Promise<void> {
    if (peer.pc.signalingState !== 'stable') return;
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      await this.sendCurrentDescription(peer);
    } finally {
      peer.makingOffer = false;
    }
  }

  private async sendCurrentDescription(peer: PeerConnection): Promise<void> {
    const description = peer.pc.localDescription;
    if (!description) return;
    await this.sendSignal({
      type: 'description',
      targetUserId: peer.userId,
      senderId: this.currentUserId,
      description: { type: description.type, sdp: description.sdp ?? undefined },
    });
  }

  private async sendSignal(event: SignalingEvent): Promise<void> {
    if (this.signalSender) {
      await this.signalSender(event);
      return;
    }
    if (!this.signalingChannel) return;
    await this.signalingChannel.send({ type: 'broadcast', event: event.type, payload: event });
  }

  private handleRemoteTrack(peer: PeerConnection, event: RTCTrackEvent): void {
    const [stream] = event.streams;
    if (!stream) return;
    if (event.track.kind === 'video') {
      peer.remoteDisplayStream = stream;
      this.events.onRemoteDisplay?.({ peerId: peer.userId, shareId: peer.remoteShareId, stream });
      return;
    }
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
    this.vadMap.set(peer.userId, new VoiceActivityDetector(stream, {
      onSpeakingChange: (isSpeaking) => this.events.onPeerSpeaking?.(peer.userId, isSpeaking),
    }));
  }

  private cleanupRemoteAudio(peerId: string): void {
    const audioElement = this.audioElements.get(peerId);
    if (audioElement) {
      audioElement.srcObject = null;
      audioElement.remove();
      this.audioElements.delete(peerId);
    }
    const vad = this.vadMap.get(peerId);
    if (vad) {
      vad.stop();
      this.vadMap.delete(peerId);
    }
  }

  private startAudioRetryInterval(): void {
    this.pendingAudioRetryInterval = setInterval(() => {
      this.audioElements.forEach((element) => {
        if (element.paused && element.srcObject) void element.play().catch(() => undefined);
      });
    }, 500);
  }

  private reportError(error: unknown): void {
    this.events.onError?.(error instanceof Error ? error : new Error('WebRTC operation failed'));
  }
}
