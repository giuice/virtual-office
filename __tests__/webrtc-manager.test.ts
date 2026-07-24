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
  static remoteDescriptionGate: Promise<void> | null = null;

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
    this.localDescription = description ?? {
      type: this.remoteDescription?.type === 'offer' ? 'answer' : 'offer',
      sdp: 'implicit-description',
    };
    this.signalingState = this.localDescription.type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (FakePeerConnection.remoteDescriptionGate) await FakePeerConnection.remoteDescriptionGate;
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('WebRTCManager display and negotiation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vadStops.length = 0;
    FakePeerConnection.instances.length = 0;
    FakePeerConnection.remoteDescriptionGate = null;
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
    manager.setSignalingIdentity('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666');
    manager.setSignalingChannel({ send } as never);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream([microphone])) } });

    await manager.initializeLocalStream();
    await manager.handleHandshake('user-a', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888');
    await flushMicrotasks();
    await manager.startScreenShare(new FakeStream([display]) as never, 'share-1');
    await flushMicrotasks();

    expect(microphone.enabled).toBe(false);
    expect(display.stopped).toBe(false);
    expect(FakePeerConnection.instances[0].senders.map((sender) => sender.track?.kind)).toEqual(['audio', 'video']);

    await manager.handleHandshake('user-c', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
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
    politeManager.setSignalingIdentity('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666');
    politeManager.setSignalingChannel({ send } as never);
    await politeManager.handleHandshake('user-a', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888');
    await flushMicrotasks();

    await politeManager.handleDescription('user-a', 'user-b', { type: 'offer', sdp: 'collision' }, null,
      '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888',
      '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666');
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
    expect(onRemoteDisplay).not.toHaveBeenCalled();

    await politeManager.handleDescription('user-a', 'user-b', { type: 'offer', sdp: 'authorized-display' }, 'share-1',
      '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888',
      '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666');
    peer.ontrack?.({ track: video, streams: [remoteStream] } as never);
    expect(onRemoteDisplay).toHaveBeenCalledTimes(1);
    expect(onRemoteDisplay).toHaveBeenCalledWith({ peerId: 'user-a', shareId: 'share-1', stream: remoteStream });

    const impoliteManager = new WebRTCManager('space-1', 'user-a');
    impoliteManager.setSignalingIdentity('77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888');
    impoliteManager.setSignalingChannel({ send } as never);
    await impoliteManager.handleHandshake('user-b', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666');
    await flushMicrotasks();
    const impolitePeer = FakePeerConnection.instances.at(-1);
    await impoliteManager.handleDescription('user-b', 'user-a', { type: 'offer', sdp: 'collision' }, null,
      '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888');
    await impoliteManager.handleIceCandidate('user-b', 'user-a', { candidate: 'ignored' });
    expect(impolitePeer?.addIceCandidate).not.toHaveBeenCalled();
  });

  it('fully releases connections, sender resources, owned streams, audio elements, VADs, timers, and callbacks', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const microphone = new FakeTrack('audio');
    const display = new FakeTrack('video');
    const manager = new WebRTCManager('space-1', 'user-b');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream([microphone])) } });
    await manager.initializeLocalStream();
    await manager.handleHandshake('user-a', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888');
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

  it('queues pre-peer and pending-description ICE once, then clears queued work on cleanup', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-b');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    const candidate = { candidate: 'candidate:before', sdpMid: '0', sdpMLineIndex: 0 };
    await manager.handleIceCandidate('user-a', 'user-b', candidate);
    expect(manager.getPeerCount()).toBe(0);
    const firstDescription = manager.handleDescription('user-a', 'user-b', { type: 'offer', sdp: 'first' });
    await firstDescription;
    expect(FakePeerConnection.instances[0].addIceCandidate).toHaveBeenCalledTimes(1);

    const gate = deferred<void>();
    FakePeerConnection.remoteDescriptionGate = gate.promise;
    const pendingDescription = manager.handleDescription('user-c', 'user-b', { type: 'offer', sdp: 'pending' });
    await Promise.resolve();
    await manager.handleIceCandidate('user-c', 'user-b', { candidate: 'candidate:pending', sdpMid: '0', sdpMLineIndex: 0 });
    expect(FakePeerConnection.instances[1].addIceCandidate).not.toHaveBeenCalled();
    gate.resolve();
    await pendingDescription;
    expect(FakePeerConnection.instances[1].addIceCandidate).toHaveBeenCalledTimes(1);

    await manager.handleIceCandidate('user-d', 'user-b', { candidate: 'candidate:cleanup', sdpMid: '0', sdpMLineIndex: 0 });
    manager.cleanup();
    expect(manager.getConnectedPeers()).toEqual([]);
  });

  it('keys queued ICE to the exact remote session instance so stale candidates cannot drain after replacement', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-b');
    const localSessionId = '55555555-5555-4555-8555-555555555555';
    const localConnectionId = '66666666-6666-4666-8666-666666666666';
    const oldSessionId = '77777777-7777-4777-8777-777777777777';
    const oldConnectionId = '88888888-8888-4888-8888-888888888888';
    const newSessionId = '99999999-9999-4999-8999-999999999999';
    const newConnectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    manager.setSignalingIdentity(localSessionId, localConnectionId);
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);

    await manager.handleIceCandidate('user-a', 'user-b', { candidate: 'candidate:old' }, oldSessionId, oldConnectionId, localSessionId, localConnectionId);
    await manager.handleHandshake('user-a', newSessionId, newConnectionId);
    await manager.handleDescription('user-a', 'user-b', { type: 'offer', sdp: 'replacement' }, null,
      newSessionId, newConnectionId, localSessionId, localConnectionId);

    const peer = FakePeerConnection.instances[0];
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    await manager.handleIceCandidate('user-a', 'user-b', { candidate: 'candidate:current' }, newSessionId, newConnectionId, localSessionId, localConnectionId);
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(1);
  });

  it('serializes microphone acquisition and releases a late stream after cleanup', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const acquisition = deferred<FakeStream>();
    const microphone = new FakeTrack('audio');
    const getUserMedia = vi.fn().mockReturnValue(acquisition.promise);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const manager = new WebRTCManager('space-1', 'user-b');
    const first = manager.initializeLocalStream();
    const second = manager.initializeLocalStream();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    manager.cleanup();
    acquisition.resolve(new FakeStream([microphone]));
    await expect(first).rejects.toThrow('WEBRTC_MANAGER_CLEANED_UP');
    await expect(second).rejects.toThrow('WEBRTC_MANAGER_CLEANED_UP');
    expect(microphone.stopped).toBe(true);
  });
});
