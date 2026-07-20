"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  presenceSnapshotErrorResponseSchema,
  presenceSnapshotSchema,
  type PresenceSnapshot,
  type PresenceSnapshotErrorCode,
} from "@/lib/presence/contracts";
import { emitPresenceEvent } from "@/lib/presence/observability";
import { presenceQueryKeys } from "@/lib/presence/query-keys";

export type PresenceSnapshotClientErrorCode =
  | PresenceSnapshotErrorCode
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "SNAPSHOT_IDENTITY_MISMATCH";

export class PresenceSnapshotRequestError extends Error {
  readonly status: number;
  readonly code: PresenceSnapshotClientErrorCode;
  readonly retryable: boolean;

  constructor(options: {
    status: number;
    code: PresenceSnapshotClientErrorCode;
    message: string;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = "PresenceSnapshotRequestError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchPresenceSnapshot(
  companyId: string,
  userId: string,
  options: { signal?: AbortSignal } = {},
): Promise<PresenceSnapshot> {
  const startedAt = Date.now();
  const fail = (error: PresenceSnapshotRequestError): never => {
    emitPresenceEvent({
      category: "snapshot",
      action: "query-error",
      resultCode: error.code,
      appUserId: userId,
      companyId,
      durationMs: Date.now() - startedAt,
      retryable: error.retryable,
    });
    throw error;
  };

  let response: Response;
  try {
    response = await fetch("/api/presence/snapshot", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }

    return fail(new PresenceSnapshotRequestError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Presence snapshot request could not reach the server",
      retryable: true,
    }));
  }
  const body = await readJson(response);

  if (!response.ok) {
    const parsedError = presenceSnapshotErrorResponseSchema.safeParse(body);
    if (parsedError.success) {
      return fail(new PresenceSnapshotRequestError({
        status: response.status,
        code: parsedError.data.code,
        message: parsedError.data.message,
        retryable: parsedError.data.retryable,
      }));
    }

    return fail(new PresenceSnapshotRequestError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message:
        "Presence snapshot request failed with an invalid error response",
      retryable: response.status >= 500,
    }));
  }

  const parsedSnapshot = presenceSnapshotSchema.safeParse(body);
  if (!parsedSnapshot.success) {
    return fail(new PresenceSnapshotRequestError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "Presence snapshot response did not match the expected contract",
      retryable: false,
    }));
  }

  if (
    parsedSnapshot.data.companyId !== companyId ||
    parsedSnapshot.data.viewerUserId !== userId
  ) {
    return fail(new PresenceSnapshotRequestError({
      status: response.status,
      code: "SNAPSHOT_IDENTITY_MISMATCH",
      message: "Presence snapshot identity did not match the requested scope",
      retryable: false,
    }));
  }

  return parsedSnapshot.data;
}

export function usePresenceSnapshot(
  companyId: string,
  userId: string,
  enabled = true,
): UseQueryResult<PresenceSnapshot, PresenceSnapshotRequestError> {
  return useQuery<PresenceSnapshot, PresenceSnapshotRequestError>({
    queryKey: presenceQueryKeys.snapshot(companyId, userId),
    queryFn: ({ signal }) =>
      fetchPresenceSnapshot(companyId, userId, { signal }),
    enabled,
    retry: (failureCount, error) => error.retryable && failureCount < 3,
    refetchInterval: () =>
      typeof document === "undefined" || document.visibilityState === "visible"
        ? 30_000
        : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
