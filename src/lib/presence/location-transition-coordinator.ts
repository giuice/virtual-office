import type {
  LocationTransitionReason,
  PresenceTransitionCode,
  TransitionErrorResponse,
  TransitionSuccessResponse,
} from '@/lib/presence/transition-contract';

const AUTO_REASONS = new Set<LocationTransitionReason>([
  'auto-first-placement',
  'auto-rejoin',
  'auto-fallback',
]);
const DIRECT_MANUAL_REASONS = new Set<LocationTransitionReason>([
  'manual-enter',
  'manual-leave',
  'teleport-accept',
]);
const RETRY_DELAYS_MS = [250, 750] as const;
const SAME_ID_RETRY_CODES = new Set<PresenceTransitionCode>([
  'PRESENCE_MAINTENANCE',
  'LEGACY_AUDIT_UNAVAILABLE',
  'KNOCK_NOT_READY',
  'INTERNAL_ERROR',
]);

export interface PresenceLocationSnapshot {
  currentSpaceId: string | null;
  locationVersion: number;
}

export interface LocationTransitionInput {
  spaceId: string | null;
  reason: Exclude<LocationTransitionReason, 'logout'>;
  knockRequestId?: string | null;
  expectedLocationVersion?: number | null;
  intentGeneration?: number;
}

export type LocationTransitionOutcome =
  | {
      ok: true;
      response: TransitionSuccessResponse;
      snapshot: PresenceLocationSnapshot;
    }
  | {
      ok: false;
      code: PresenceTransitionCode | 'CLIENT_COMMAND_SUPERSEDED' | 'CLIENT_RECONCILE_FAILED';
      message: string;
      retryable: boolean;
      skipped: boolean;
      snapshot?: PresenceLocationSnapshot | null;
    };

interface QueuedCommand {
  input: LocationTransitionInput;
  generation: number;
  transitionId: string;
  resolve: (outcome: LocationTransitionOutcome) => void;
}

export interface LocationTransitionCoordinatorOptions {
  getSessionId: () => string | null;
  rotateSession: () => Promise<string | null>;
  reconcile: (isCurrent: () => boolean) => Promise<PresenceLocationSnapshot | null>;
  onClientUpgradeRequired?: (response: Pick<Response, 'status'>, payload: unknown) => void;
  fetcher?: typeof fetch;
  randomUUID?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  onPendingTargetChange?: (spaceId: string | null) => void;
  onPendingChange?: (isPending: boolean) => void;
  onSessionRecoveryChange?: (isRecovering: boolean) => void;
  onSessionConfirmed?: (sessionId: string) => void;
}

function supersededOutcome(): LocationTransitionOutcome {
  return {
    ok: false,
    code: 'CLIENT_COMMAND_SUPERSEDED',
    message: 'A newer location intent superseded this command',
    retryable: false,
    skipped: true,
  };
}

function isTransitionPayload(value: unknown): value is TransitionSuccessResponse | TransitionErrorResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { success?: unknown; code?: unknown };
  return typeof candidate.success === 'boolean' && typeof candidate.code === 'string';
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class LocationTransitionCoordinator {
  private readonly options: Required<Pick<LocationTransitionCoordinatorOptions, 'fetcher' | 'randomUUID' | 'sleep'>> &
    Omit<LocationTransitionCoordinatorOptions, 'fetcher' | 'randomUUID' | 'sleep'>;
  private generation = 0;
  private queue: QueuedCommand[] = [];
  private activeCommand: QueuedCommand | null = null;
  private processing = false;
  private disposed = false;
  private manualReservationGeneration: number | null = null;
  private recoveredSessionId: string | null = null;
  private sessionRecoveryPromise: Promise<string | null> | null = null;
  private sessionRecoveryActive = false;

  constructor(options: LocationTransitionCoordinatorOptions) {
    this.options = {
      ...options,
      fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
      randomUUID: options.randomUUID ?? (() => crypto.randomUUID()),
      sleep: options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    };
  }

  beginManualIntent(): number {
    if (this.disposed) return this.generation;
    this.generation += 1;
    this.manualReservationGeneration = this.generation;
    this.cancelQueuedCommands((command) => AUTO_REASONS.has(command.input.reason));
    this.publishPendingTarget();
    return this.generation;
  }

  releaseManualIntent(generation: number): void {
    if (this.manualReservationGeneration !== generation) return;
    this.manualReservationGeneration = null;
    this.publishPendingTarget();
  }

  transition(input: LocationTransitionInput): Promise<LocationTransitionOutcome> {
    if (this.disposed) return Promise.resolve(supersededOutcome());
    let generation = input.intentGeneration ?? this.generation;
    if (DIRECT_MANUAL_REASONS.has(input.reason)) {
      generation = this.beginManualIntent();
      this.releaseManualIntent(generation);
    } else if (input.reason === 'knock-enter' && input.intentGeneration !== undefined) {
      this.releaseManualIntent(input.intentGeneration);
    }

    return new Promise((resolve) => {
      if (DIRECT_MANUAL_REASONS.has(input.reason)) {
        this.cancelQueuedCommands((command) => DIRECT_MANUAL_REASONS.has(command.input.reason));
      }

      this.queue.push({
        input,
        generation,
        transitionId: this.options.randomUUID(),
        resolve,
      });
      this.publishPendingTarget();
      void this.drain();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.manualReservationGeneration = null;
    this.cancelQueuedCommands(() => true);
    this.setSessionRecoveryActive(false);
  }

  private setSessionRecoveryActive(isRecovering: boolean): void {
    if (this.sessionRecoveryActive === isRecovering) return;
    this.sessionRecoveryActive = isRecovering;
    this.options.onSessionRecoveryChange?.(isRecovering);
  }

  private readSessionId(): string | null {
    const configuredSessionId = this.options.getSessionId();
    if (!this.recoveredSessionId) return configuredSessionId;
    if (configuredSessionId === this.recoveredSessionId) {
      this.recoveredSessionId = null;
      return configuredSessionId;
    }
    return this.recoveredSessionId;
  }

  private async recoverSession(forceRotation = false): Promise<string | null> {
    if (forceRotation) this.recoveredSessionId = null;
    if (!forceRotation && this.recoveredSessionId) return this.recoveredSessionId;

    this.setSessionRecoveryActive(true);
    if (!this.sessionRecoveryPromise) {
      this.sessionRecoveryPromise = this.options.rotateSession()
        .then((sessionId) => {
          if (this.disposed) return null;
          this.recoveredSessionId = sessionId;
          return sessionId;
        })
        .finally(() => {
          this.sessionRecoveryPromise = null;
        });
    }
    return this.sessionRecoveryPromise;
  }

  private cancelQueuedCommands(predicate: (command: QueuedCommand) => boolean): void {
    const retained: QueuedCommand[] = [];
    for (const command of this.queue) {
      if (predicate(command)) command.resolve(supersededOutcome());
      else retained.push(command);
    }
    this.queue = retained;
    this.publishPendingTarget();
  }

  private publishPendingTarget(): void {
    const latestManual = [...this.queue]
      .reverse()
      .find((command) => DIRECT_MANUAL_REASONS.has(command.input.reason));
    const pendingCommand = latestManual ?? this.queue.at(-1) ?? this.activeCommand;
    this.options.onPendingTargetChange?.(pendingCommand?.input.spaceId ?? null);
    this.options.onPendingChange?.(
      (pendingCommand !== undefined && pendingCommand !== null) ||
      this.manualReservationGeneration !== null
    );
  }

  private isSuperseded(command: QueuedCommand): boolean {
    return this.disposed || command.generation !== this.generation;
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const command = this.queue.shift();
        if (!command) continue;
        this.activeCommand = command;
        this.publishPendingTarget();
        const outcome = this.isSuperseded(command)
          ? supersededOutcome()
          : await this.execute(command);
        command.resolve(outcome);
        this.activeCommand = null;
        this.publishPendingTarget();
      }
    } finally {
      this.processing = false;
      this.activeCommand = null;
      this.publishPendingTarget();
      this.setSessionRecoveryActive(false);
    }
  }

  private async execute(command: QueuedCommand): Promise<LocationTransitionOutcome> {
    let sessionId = this.readSessionId();
    let rotated = false;
    let isRecoveringSession = this.sessionRecoveryActive;
    try {
      if (!sessionId) {
        rotated = true;
        isRecoveringSession = true;
        sessionId = await this.recoverSession();
        if (this.isSuperseded(command)) return supersededOutcome();
        if (!sessionId) {
          return {
            ok: false,
            code: 'SESSION_INVALID',
            message: 'Presence session is not registered',
            retryable: true,
            skipped: false,
          };
        }
      }

      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        if (this.isSuperseded(command)) return supersededOutcome();

        let response: Response;
        try {
          response = await this.options.fetcher('/api/presence/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              transitionId: command.transitionId,
              spaceId: command.input.spaceId,
              reason: command.input.reason,
              knockRequestId: command.input.knockRequestId ?? null,
              expectedLocationVersion: command.input.expectedLocationVersion ?? null,
            }),
          });
        } catch {
          if (attempt < RETRY_DELAYS_MS.length && !this.isSuperseded(command)) {
            await this.options.sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          const snapshot = await this.options.reconcile(() => !this.isSuperseded(command)).catch(() => null);
          if (this.isSuperseded(command)) return supersededOutcome();
          return {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: 'Location transition could not be confirmed',
            retryable: true,
            skipped: false,
            snapshot,
          };
        }

        const payload = await safeJson(response);
        if (this.isSuperseded(command)) return supersededOutcome();
        if (!isTransitionPayload(payload)) {
          if ((response.ok || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
            await this.options.sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          const snapshot = await this.options.reconcile(() => !this.isSuperseded(command)).catch(() => null);
          if (this.isSuperseded(command)) return supersededOutcome();
          return {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: 'Location transition returned an invalid response',
            retryable: response.ok || response.status >= 500,
            skipped: false,
            snapshot,
          };
        }

        if (!payload.success && payload.code === 'CLIENT_UPGRADE_REQUIRED') {
          this.options.onClientUpgradeRequired?.(response, payload);
        }

        if (!payload.success && payload.code === 'SESSION_INVALID' && !rotated) {
          rotated = true;
          isRecoveringSession = true;
          const rotatedSessionId = await this.recoverSession(true);
          if (this.isSuperseded(command)) return supersededOutcome();
          if (rotatedSessionId) {
            sessionId = rotatedSessionId;
            attempt -= 1;
            continue;
          }
        }

        if (
          !payload.success &&
          SAME_ID_RETRY_CODES.has(payload.code) &&
          attempt < RETRY_DELAYS_MS.length
        ) {
          await this.options.sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }

        const snapshot = await this.options.reconcile(() => !this.isSuperseded(command)).catch(() => null);
        if (this.isSuperseded(command)) return supersededOutcome();
        if (!payload.success) {
          return {
            ok: false,
            code: payload.code,
            message: payload.message,
            retryable: payload.retryable,
            skipped: payload.code === 'LOCATION_SUPERSEDED',
            snapshot,
          };
        }

        if (
          !snapshot ||
          snapshot.currentSpaceId !== payload.currentSpaceId ||
          snapshot.locationVersion !== payload.locationVersion
        ) {
          return {
            ok: false,
            code: snapshot ? 'LOCATION_SUPERSEDED' : 'CLIENT_RECONCILE_FAILED',
            message: snapshot
              ? 'A newer location transition superseded this result'
              : 'Location transition succeeded but its snapshot could not be confirmed',
            retryable: !snapshot,
            skipped: Boolean(snapshot),
            snapshot,
          };
        }

        this.options.onSessionConfirmed?.(sessionId);
        return { ok: true, response: payload, snapshot };
      }

      return {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Location transition failed',
        retryable: true,
        skipped: false,
      };
    } finally {
      if (isRecoveringSession && this.queue.length === 0) {
        this.setSessionRecoveryActive(false);
      }
    }
  }
}
