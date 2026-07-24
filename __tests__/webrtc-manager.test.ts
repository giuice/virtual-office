import { beforeEach, describe, expect, it, vi } from 'vitest';

const vadStops = vi.hoisted(() => [] as Array<ReturnType<typeof vi.fn>>);

vi.mock('@/lib/audio/VoiceActivityDetector', () => ({
  VoiceActivityDetector: class {
    readonly stop = vi.fn();

    constructor() {
      vadStops.push(this.stop);
    }
  },
}));

class FakeTrack {
  enabled = true;
  stopped = false;

  constructor(readonly kind: 'audio' | 'video') {}

  stop(): void {
    this.stopped = true;
  }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[]) {}

  getTracks(): FakeTrack[] {
    return this.tracks;
  }

  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  connectionState: RTCPeerConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  readonly addIceCandidate = vi.fn().mockResolvedValue(undefined);
  readonly removeTrack = vi.fn();
  readonly close = vi.fn(() => {
    this.connectionState = 'closed';
  });
  readonly senders: Array<{ track: FakeTrack | null; replaceTrack: ReturnType<typeof vi.fn> }> = [];

  constructor(_configuration: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: FakeTrack): { track: FakeTrack; replaceTrack: ReturnType<typeof vi.fn> } {
    const sender = { track, replaceTrack: vi.fn().mockResolvedValue(undefined) };
    this.senders.push(sender);
    queueMicrotask(() => this.onnegotiationneeded?.());
    return sender;
  }

  getSenders(): Array<{ track: FakeTrack | null; replaceTrack: ReturnType<typeof vi.fn> }> {
    return this.senders;
  }

  getTransceivers(): Array<{ stop: ReturnType<typeof vi.fn> }> {
    return this.senders.map(() => ({ stop: vi.fn() }));
  }

  async setLocalDescription(description?: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description ?? { type: 'offer', sdp: 'implicit-offer' };
    this.signalingState = this.localDescription.type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('WebRTCManager display and negotiation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vadStops.length = 0;
    FakePeerConnection.instances.length = 0;
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('RTCSessionDescription', class {
      constructor(init: RTCSessionDescriptionInit) {
        return init;
      }
    });
    vi.stubGlobal('RTCIceCandidate', class {
      constructor(init: RTCIceCandidateInit) {
        return init;
      }
    });
    vi.stubGlobal('document', {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => ({
        autoplay: false,
        paused: false,
        srcObject: null,
        style: {},
        setAttribute: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn(),
      })),
    });
  });

  it('renegotiates one existing peer and a later peer with a distinct display sender without touching microphone ownership', async () => {
    const send = vi.fn().mockResolvedValue('ok');
    const microphone = new FakeTrack('audio');
    const display = new FakeTrack('video');
    const manager = new (await import('@/lib/webrtc/WebRTCManager')).WebRTCManager('space-1', 'user-b');
    manager.setSignalingChannel({ send } as never);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream([microphone])) } });

    await manager.initializeLocalStream();
    await manager.handleHandshake('user-a');
    await flushMicrotasks();
    await manager.startScreenShare(new FakeStream([display]) as never, 'share-1');
    await flushMicrotasks();

    expect(microphone.enabled).toBe(false);
    expect(display.stopped).toBe(false);
    expect(FakePeerConnection.instances[0].senders.map((sender) => sender.track?.kind)).toEqual(['audio', 'video']);

    await manager.handleHandshake('user-c');
    await flushMicrotasks();
    expect(FakePeerConnection.instances[1].senders.map((sender) => sender.track?.kind)).toEqual(['audio', 'video']);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'description' }));

    await manager.stopScreenShare('stopped');
    expect(display.stopped).toBe(true);
    expect(microphone.stopped).toBe(false);
    expect(manager.getLocalStream()).toBeInstanceOf(FakeStream);
  });

  it('settles polite collisions, suppresses ignored-offer ICE, and routes remote audio and display separately', async () => {
    const onRemoteDisplay = vi.fn();
    const send = vi.fn().mockResolvedValue('ok');
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const politeManager = new WebRTCManager('space-1', 'user-b', { onRemoteDisplay });
    politeManager.setSignalingChannel({ send } as never);
    await politeManager.handleHandshake('user-a');
    await flushMicrotasks();

    await politeManager.handleDescription('user-a', 'user-b', { type: 'offer', sdp: 'collision' });
    await flushMicrotasks();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      event: 'description',
      payload: expect.objectContaining({ description: expect.objectContaining({ type: 'answer' }) }),
    }));

    const audio = new FakeTrack('audio');
    const video = new FakeTrack('video');
    const remoteStream = new FakeStream([audio, video]);
    const peer = FakePeerConnection.instances[0];
    peer.ontrack?.({ track: audio, streams: [remoteStream] } as never);
    peer.ontrack?.({ track: video, streams: [remoteStream] } as never);
    expect(document.createElement).toHaveBeenCalledTimes(1);
    expect(onRemoteDisplay).toHaveBeenCalledWith({ peerId: 'user-a', shareId: null, stream: remoteStream });

    const impoliteManager = new WebRTCManager('space-1', 'user-a');
    impoliteManager.setSignalingChannel({ send } as never);
    await impoliteManager.handleHandshake('user-b');
    await flushMicrotasks();
    const impolitePeer = FakePeerConnection.instances.at(-1);
    await impoliteManager.handleDescription('user-b', 'user-a', { type: 'offer', sdp: 'collision' });
    await impoliteManager.handleIceCandidate('user-b', 'user-a', { candidate: 'ignored' });
    expect(impolitePeer?.addIceCandidate).not.toHaveBeenCalled();
  });

  it('fully releases connections, sender resources, owned streams, audio elements, VADs, timers, and callbacks', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const microphone = new FakeTrack('audio');
    const display = new FakeTrack('video');
    const manager = new WebRTCManager('space-1', 'user-b');
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream([microphone])) } });
    await manager.initializeLocalStream();
    await manager.handleHandshake('user-a');
    await manager.startScreenShare(new FakeStream([display]) as never, 'share-1');
    await flushMicrotasks();
    const remoteAudio = new FakeTrack('audio');
    FakePeerConnection.instances[0].ontrack?.({ track: remoteAudio, streams: [new FakeStream([remoteAudio])] } as never);

    manager.cleanup();

    expect(microphone.stopped).toBe(true);
    expect(display.stopped).toBe(true);
    expect(FakePeerConnection.instances[0].close).toHaveBeenCalledTimes(1);
    expect(FakePeerConnection.instances[0].removeTrack).toHaveBeenCalled();
    expect(vadStops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
    expect(manager.getConnectedPeers()).toEqual([]);
  });
});
