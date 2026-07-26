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
  readyState: MediaStreamTrackState = 'live';
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(readonly kind: 'audio' | 'video') {}

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  stop(): void {
    this.stopped = true;
    this.readyState = 'ended';
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
  readonly transceivers: Array<{ stop: ReturnType<typeof vi.fn> }> = [];

  constructor(_configuration: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: FakeTrack): { track: FakeTrack; replaceTrack: ReturnType<typeof vi.fn> } {
    const sender: { track: FakeTrack | null; replaceTrack: ReturnType<typeof vi.fn> } = {
      track: track,
      replaceTrack: vi.fn(async (replacement: FakeTrack | null) => {
        sender.track = replacement;
      }),
    };
    this.senders.push(sender);
    this.transceivers.push({ stop: vi.fn() });
    queueMicrotask(() => this.onnegotiationneeded?.());
    return sender as { track: FakeTrack; replaceTrack: ReturnType<typeof vi.fn> };
  }

  getSenders(): Array<{ track: FakeTrack | null; replaceTrack: ReturnType<typeof vi.fn> }> {
    return this.senders;
  }

  getTransceivers(): Array<{ stop: ReturnType<typeof vi.fn> }> {
    return this.transceivers;
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

  it('broadcasts presenter invalidation once before any peer is registered', async () => {
    const signalSender = vi.fn().mockResolvedValue(undefined);
    const manager = new (await import('@/lib/webrtc/WebRTCManager')).WebRTCManager(
      'space-1',
      'user-a',
    );
    manager.setSignalingChannel({} as never, signalSender);

    await manager.broadcastPresenterInvalidated('share-1');

    expect(FakePeerConnection.instances).toHaveLength(0);
    expect(signalSender).toHaveBeenCalledTimes(1);
    expect(signalSender).toHaveBeenCalledWith({
      type: 'presenter-invalidated',
      shareId: 'share-1',
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
    await impoliteManager.handleIceCandidate(
      'user-b',
      'user-a',
      { candidate: 'ignored', usernameFragment: 'ignored-offer' },
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
      '88888888-8888-4888-8888-888888888888',
    );
    expect(impolitePeer?.addIceCandidate).not.toHaveBeenCalled();

    await impoliteManager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
      null,
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
      '88888888-8888-4888-8888-888888888888',
    );
    expect(impolitePeer?.addIceCandidate).not.toHaveBeenCalled();
  });

  it('retains answer ICE received during glare without admitting ICE from the ignored offer', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    const localSessionId = '77777777-7777-4777-8777-777777777777';
    const localConnectionId = '88888888-8888-4888-8888-888888888888';
    const remoteSessionId = '55555555-5555-4555-8555-555555555555';
    const remoteConnectionId = '66666666-6666-4666-8666-666666666666';
    manager.setSignalingIdentity(localSessionId, localConnectionId);
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);

    await manager.handleHandshake('user-b', remoteSessionId, remoteConnectionId);
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
      null,
      remoteSessionId,
      remoteConnectionId,
      localSessionId,
      localConnectionId,
    );

    const ignoredCandidate = {
      candidate: 'candidate:ignored-offer',
      usernameFragment: 'ignored-offer',
    };
    const answerCandidate = {
      candidate: 'candidate:winning-answer',
      usernameFragment: 'winning-answer',
    };
    await manager.handleIceCandidate(
      'user-b',
      'user-a',
      ignoredCandidate,
      remoteSessionId,
      remoteConnectionId,
      localSessionId,
      localConnectionId,
    );
    await manager.handleIceCandidate(
      'user-b',
      'user-a',
      answerCandidate,
      remoteSessionId,
      remoteConnectionId,
      localSessionId,
      localConnectionId,
    );
    expect(peer.addIceCandidate).not.toHaveBeenCalled();

    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
      null,
      remoteSessionId,
      remoteConnectionId,
      localSessionId,
      localConnectionId,
    );

    expect(peer.addIceCandidate).toHaveBeenCalledTimes(1);
    expect(peer.addIceCandidate).toHaveBeenCalledWith(answerCandidate);
    expect(peer.addIceCandidate).not.toHaveBeenCalledWith(ignoredCandidate);
  });

  it('quarantines answer ICE with omitted or null username fragments until the answer is accepted', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    const localSessionId = '77777777-7777-4777-8777-777777777777';
    const localConnectionId = '88888888-8888-4888-8888-888888888888';
    const remoteSessionId = '55555555-5555-4555-8555-555555555555';
    const remoteConnectionId = '66666666-6666-4666-8666-666666666666';
    manager.setSignalingIdentity(localSessionId, localConnectionId);
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    await manager.handleHandshake('user-b', remoteSessionId, remoteConnectionId);
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
      null,
      remoteSessionId,
      remoteConnectionId,
      localSessionId,
      localConnectionId,
    );

    const omittedUfrag = { candidate: 'candidate:answer-with-omitted-ufrag' };
    const nullUfrag = {
      candidate: 'candidate:answer-with-null-ufrag',
      usernameFragment: null,
    };
    for (const candidate of [omittedUfrag, nullUfrag]) {
      await manager.handleIceCandidate(
        'user-b',
        'user-a',
        candidate,
        remoteSessionId,
        remoteConnectionId,
        localSessionId,
        localConnectionId,
      );
    }
    expect(peer.addIceCandidate).not.toHaveBeenCalled();

    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
      null,
      remoteSessionId,
      remoteConnectionId,
      localSessionId,
      localConnectionId,
    );

    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(1, omittedUfrag);
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(2, nullUfrag);
  });

  it('surfaces an unclassified ignored-offer mismatch after continuing to valid answer ICE', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    await manager.handleHandshake('user-b');
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
    );
    const ignoredCandidate = { candidate: 'candidate:unclassified-ignored-offer' };
    const winningCandidate = { candidate: 'candidate:unclassified-winning-answer' };
    const mismatch = new DOMException('Unknown ICE ufrag from ignored offer', 'OperationError');
    peer.addIceCandidate.mockImplementation(async (candidate: RTCIceCandidateInit) => {
      if (candidate === ignoredCandidate) {
        throw mismatch;
      }
    });

    await manager.handleIceCandidate('user-b', 'user-a', ignoredCandidate);
    await manager.handleIceCandidate('user-b', 'user-a', winningCandidate);
    await expect(manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
    )).rejects.toBe(mismatch);

    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(peer.signalingState).toBe('stable');
  });

  it('uses raw candidate ufrag fallback and rejects malformed generation metadata without contamination', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    await manager.handleHandshake('user-b');
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
    );

    const ignoredRawUfrag = {
      candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host ufrag ignored-offer',
    };
    const winningRawUfrag = {
      candidate: 'candidate:2 1 udp 1 192.0.2.2 5001 typ host ufrag winning-answer',
    };
    const malformedExplicitUfrag = {
      candidate: 'candidate:3 1 udp 1 192.0.2.3 5002 typ host',
      usernameFragment: 'bad generation value',
    };
    const malformedRawUfrag = {
      candidate: 'candidate:4 1 udp 1 192.0.2.4 5003 typ host ufrag bad*generation',
    };
    await manager.handleIceCandidate('user-b', 'user-a', ignoredRawUfrag);
    await manager.handleIceCandidate('user-b', 'user-a', winningRawUfrag);
    await manager.handleIceCandidate('user-b', 'user-a', malformedExplicitUfrag);
    await manager.handleIceCandidate('user-b', 'user-a', malformedRawUfrag);
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
    );

    expect(peer.addIceCandidate).toHaveBeenCalledTimes(1);
    expect(peer.addIceCandidate).toHaveBeenCalledWith(winningRawUfrag);
    expect(peer.addIceCandidate).not.toHaveBeenCalledWith(ignoredRawUfrag);
    expect(peer.addIceCandidate).not.toHaveBeenCalledWith(malformedExplicitUfrag);
    expect(peer.addIceCandidate).not.toHaveBeenCalledWith(malformedRawUfrag);
  });

  it('does not swallow unrelated addIceCandidate failures from quarantined ICE', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    await manager.handleHandshake('user-b');
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
    );
    peer.addIceCandidate.mockRejectedValue(
      new DOMException('sdpMid does not match the remote description', 'OperationError'),
    );

    await manager.handleIceCandidate(
      'user-b',
      'user-a',
      { candidate: 'candidate:unclassified-mid-error' },
    );
    await expect(manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
    )).rejects.toThrow('sdpMid does not match');
  });

  it('drains valid answer ICE after an earlier failure, surfaces the error, and never replays the retired queue', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    await manager.handleHandshake('user-b');
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
    );
    const invalidCandidate = { candidate: 'candidate:unclassified-invalid' };
    const validCandidate = { candidate: 'candidate:unclassified-valid-answer' };
    const failure = new DOMException('candidate syntax is invalid', 'OperationError');
    peer.addIceCandidate.mockImplementation(async (candidate: RTCIceCandidateInit) => {
      if (candidate === invalidCandidate) throw failure;
    });

    await manager.handleIceCandidate('user-b', 'user-a', invalidCandidate);
    await manager.handleIceCandidate('user-b', 'user-a', validCandidate);
    await expect(manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
    )).rejects.toBe(failure);

    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(1, invalidCandidate);
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(2, validCandidate);
    expect(peer.signalingState).toBe('stable');

    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
    );
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
  });

  it('drains past multiple failures and reports them in deterministic queue order', async () => {
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-a');
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);
    await manager.handleHandshake('user-b');
    await flushMicrotasks();
    const peer = FakePeerConnection.instances[0];
    await manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:ignored-offer\r\n' },
    );
    const firstInvalid = { candidate: 'candidate:first-invalid' };
    const secondInvalid = { candidate: 'candidate:second-invalid' };
    const validCandidate = { candidate: 'candidate:valid-after-errors' };
    const firstFailure = new TypeError('first candidate failed');
    const secondFailure = new DOMException('second candidate failed', 'OperationError');
    peer.addIceCandidate.mockImplementation(async (candidate: RTCIceCandidateInit) => {
      if (candidate === firstInvalid) throw firstFailure;
      if (candidate === secondInvalid) throw secondFailure;
    });

    await manager.handleIceCandidate('user-b', 'user-a', firstInvalid);
    await manager.handleIceCandidate('user-b', 'user-a', secondInvalid);
    await manager.handleIceCandidate('user-b', 'user-a', validCandidate);
    const answer = manager.handleDescription(
      'user-b',
      'user-a',
      { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:winning-answer\r\n' },
    );

    await expect(answer).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [firstFailure, secondFailure],
    });
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(3);
    expect(peer.addIceCandidate).toHaveBeenNthCalledWith(3, validCandidate);
    expect(peer.signalingState).toBe('stable');
  });

  it('emits each canonical remote display track once and retires its listener on peer cleanup', async () => {
    const onRemoteDisplay = vi.fn();
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'user-b', { onRemoteDisplay });
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);

    await manager.handleDescription(
      'user-a',
      'user-b',
      { type: 'offer', sdp: 'canonical-display' },
      'share-1',
    );
    const display = new FakeTrack('video');
    const stream = new FakeStream([display]);
    const peer = FakePeerConnection.instances[0];
    const event = { track: display, streams: [stream] } as never;

    peer.ontrack?.(event);
    peer.ontrack?.(event);

    expect(onRemoteDisplay).toHaveBeenCalledTimes(1);
    manager.cleanupPeer('user-a');
    display.emit('ended');
    expect(onRemoteDisplay).toHaveBeenCalledTimes(1);
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
    expect(FakePeerConnection.instances[0].transceivers.every(
      (transceiver) => transceiver.stop.mock.calls.length === 1,
    )).toBe(true);
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

  it('deduplicates peer entry through the existing P2P registry up to the warning threshold', async () => {
    const onRoomLimitWarning = vi.fn();
    const { WebRTCManager } = await import('@/lib/webrtc/WebRTCManager');
    const manager = new WebRTCManager('space-1', 'local-user', { onRoomLimitWarning });
    manager.setSignalingChannel({ send: vi.fn().mockResolvedValue('ok') } as never);

    for (let index = 0; index < 8; index += 1) {
      await manager.handleHandshake(`peer-${index}`, `session-${index}`, `connection-${index}`);
    }

    await manager.handleHandshake('peer-0', 'session-0', 'connection-0');

    expect(manager.getPeerCount()).toBe(8);
    expect(FakePeerConnection.instances).toHaveLength(8);
    expect(onRoomLimitWarning).not.toHaveBeenCalled();
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
