import type { PropsWithChildren, ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  presenceSnapshotSchema,
  type PresenceSnapshot,
} from "@/lib/presence/contracts";
import { presenceQueryKeys } from "@/lib/presence/query-keys";
import {
  clearAllPresenceStorage,
  presenceStorageKeys,
  removeLegacyPresenceStorage,
  removeScopedPresenceStorage,
} from "@/lib/presence/storage-keys";
import {
  fetchPresenceSnapshot,
  PresenceSnapshotRequestError,
  usePresenceSnapshot,
} from "@/hooks/queries/usePresenceSnapshot";

const COMPANY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_COMPANY_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SPACE_ID = "55555555-5555-4555-8555-555555555555";

function snapshot(overrides: Partial<PresenceSnapshot> = {}): PresenceSnapshot {
  return {
    serverTime: "2026-07-18T12:00:00.000Z",
    companyId: COMPANY_ID,
    viewerUserId: USER_ID,
    currentUser: { initialPlacementCompletedAt: null },
    users: [
      {
        id: USER_ID,
        displayName: "Current User",
        avatarUrl: null,
        currentSpaceId: SPACE_ID,
        locationVersion: 7,
        availabilityStatus: "away",
        isConnected: true,
        isOccupyingCurrentSpace: true,
        displayStatus: "away",
        statusMessage: null,
      },
      {
        id: OTHER_USER_ID,
        displayName: "Disconnected Peer",
        avatarUrl: "https://example.com/avatar.png",
        currentSpaceId: SPACE_ID,
        locationVersion: 3,
        availabilityStatus: "online",
        isConnected: false,
        isOccupyingCurrentSpace: false,
        displayStatus: "offline",
        statusMessage: "Back later",
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createWrapper(
  queryClient: QueryClient,
): (props: PropsWithChildren) => ReactElement {
  return function Wrapper({ children }: PropsWithChildren): ReactElement {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("presence client contracts", () => {
  it("validates the complete authoritative snapshot without treating stale placement as occupancy", () => {
    const parsed = presenceSnapshotSchema.parse(snapshot());

    expect(parsed.users[1]).toMatchObject({
      currentSpaceId: SPACE_ID,
      isConnected: false,
      isOccupyingCurrentSpace: false,
      displayStatus: "offline",
    });
  });

  it.each(["online", "away", "busy"] as const)(
    "accepts a connected %s user when display and availability agree",
    (status) => {
      const candidate = snapshot();
      candidate.users[0] = {
        ...candidate.users[0],
        availabilityStatus: status,
        displayStatus: status,
      };

      expect(presenceSnapshotSchema.safeParse(candidate).success).toBe(true);
    },
  );

  it("accepts connected placement that is not revision-valid occupancy", () => {
    const candidate = snapshot();
    candidate.users[0] = {
      ...candidate.users[0],
      isConnected: true,
      isOccupyingCurrentSpace: false,
    };

    expect(presenceSnapshotSchema.safeParse(candidate).success).toBe(true);
  });

  it("rejects an incomplete or drifted snapshot", () => {
    const validSnapshot = snapshot();
    const partialUser: Partial<PresenceSnapshot["users"][number]> = {
      ...validSnapshot.users[0],
    };
    delete partialUser.locationVersion;
    const missingField = { ...validSnapshot, users: [partialUser] };
    const unknownStatus = {
      ...validSnapshot,
      users: [
        {
          ...validSnapshot.users[0],
          displayStatus: "invisible",
        },
      ],
    };
    const extraField = {
      ...validSnapshot,
      users: [
        {
          ...validSnapshot.users[0],
          lastActive: "2026-07-18T12:00:00.000Z",
        },
      ],
    };

    expect(presenceSnapshotSchema.safeParse(missingField).success).toBe(false);
    expect(presenceSnapshotSchema.safeParse(unknownStatus).success).toBe(false);
    expect(presenceSnapshotSchema.safeParse(extraField).success).toBe(false);
  });

  it("rejects every impossible connectivity, occupancy, and identity combination", () => {
    const disconnectedOnline = snapshot();
    disconnectedOnline.users[1] = {
      ...disconnectedOnline.users[1],
      displayStatus: "online",
    };

    const disconnectedOccupant = snapshot();
    disconnectedOccupant.users[1] = {
      ...disconnectedOccupant.users[1],
      isOccupyingCurrentSpace: true,
    };

    const occupantWithoutSpace = snapshot();
    occupantWithoutSpace.users[0] = {
      ...occupantWithoutSpace.users[0],
      currentSpaceId: null,
    };

    const mismatchedAvailability = snapshot();
    mismatchedAvailability.users[0] = {
      ...mismatchedAvailability.users[0],
      displayStatus: "busy",
    };

    const duplicateUsers = snapshot();
    duplicateUsers.users = [duplicateUsers.users[0], duplicateUsers.users[0]];

    const missingViewer = snapshot();
    missingViewer.users = [missingViewer.users[1]];

    for (const candidate of [
      disconnectedOnline,
      disconnectedOccupant,
      occupantWithoutSpace,
      mismatchedAvailability,
      duplicateUsers,
      missingViewer,
    ]) {
      expect(presenceSnapshotSchema.safeParse(candidate).success).toBe(false);
    }
  });
});

describe("presence scoped key factories", () => {
  it("isolates snapshot cache entries by company and app user", () => {
    expect(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID)).toEqual([
      "presence",
      COMPANY_ID,
      USER_ID,
      "snapshot",
    ]);
    expect(presenceQueryKeys.snapshot(OTHER_COMPANY_ID, USER_ID)).not.toEqual(
      presenceQueryKeys.snapshot(COMPANY_ID, USER_ID),
    );
    expect(presenceQueryKeys.snapshot(COMPANY_ID, OTHER_USER_ID)).not.toEqual(
      presenceQueryKeys.snapshot(COMPANY_ID, USER_ID),
    );
  });

  it("removes legacy keys and clears only the requested identity scope", () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => {
        values.delete(key);
      },
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    const ownKey = presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID);
    const otherKey = presenceStorageKeys.lastSpace(OTHER_COMPANY_ID, OTHER_USER_ID);
    storage.setItem(ownKey, SPACE_ID);
    storage.setItem(otherKey, SPACE_ID);
    storage.setItem("lastSpaceId", SPACE_ID);
    storage.setItem("vo-disconnect-timestamp", "1");
    storage.setItem("vo-first-login-done", "true");
    storage.setItem("vo-knock-cooldown-old", "1");
    storage.setItem("unrelated", "keep");

    removeLegacyPresenceStorage(storage);
    expect(storage.getItem("lastSpaceId")).toBeNull();
    expect(storage.getItem("vo-knock-cooldown-old")).toBeNull();
    expect(storage.getItem(ownKey)).toBe(SPACE_ID);

    removeScopedPresenceStorage(storage, COMPANY_ID, USER_ID);
    expect(storage.getItem(ownKey)).toBeNull();
    expect(storage.getItem(otherKey)).toBe(SPACE_ID);

    clearAllPresenceStorage(storage);
    expect(storage.getItem(otherKey)).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
    storage.clear();
  });

  it("isolates every recovery and cooldown key by company and app user", () => {
    const keys = [
      presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID),
      presenceStorageKeys.disconnectTimestamp(COMPANY_ID, USER_ID),
      presenceStorageKeys.knockCooldown(COMPANY_ID, USER_ID, SPACE_ID),
    ];

    for (const key of keys) {
      expect(key).toContain(COMPANY_ID);
      expect(key).toContain(USER_ID);
    }
    expect(presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID)).not.toBe(
      presenceStorageKeys.lastSpace(OTHER_COMPANY_ID, USER_ID),
    );
    expect(presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID)).not.toBe(
      presenceStorageKeys.lastSpace(COMPANY_ID, OTHER_USER_ID),
    );
  });
});

describe("presence snapshot query", () => {
  it("fetches and fully parses the snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snapshot()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPresenceSnapshot(COMPANY_ID, USER_ID)).resolves.toEqual(
      snapshot(),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/presence/snapshot", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: undefined,
    });
  });

  it("throws a typed API error for a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            code: "AUTH_SESSION_REVOKED",
            message: "Authentication session revoked",
            retryable: false,
          },
          401,
        ),
      ),
    );

    const error = await fetchPresenceSnapshot(COMPANY_ID, USER_ID).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(PresenceSnapshotRequestError);
    expect(error).toMatchObject({
      status: 401,
      code: "AUTH_SESSION_REVOKED",
      retryable: false,
    });
  });

  it("normalizes a network failure into a retryable typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(
      fetchPresenceSnapshot(COMPANY_ID, USER_ID),
    ).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("rejects a successful response with a partial schema", async () => {
    const invalidSnapshot = snapshot();
    const partialUser: Partial<PresenceSnapshot["users"][number]> = {
      ...invalidSnapshot.users[0],
    };
    delete partialUser.locationVersion;
    invalidSnapshot.users = [partialUser as PresenceSnapshot["users"][number]];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(invalidSnapshot)),
    );

    await expect(
      fetchPresenceSnapshot(COMPANY_ID, USER_ID),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
      retryable: false,
    });
  });

  it("rejects semantically impossible connectivity and occupancy state", async () => {
    const impossibleSnapshot = snapshot();
    impossibleSnapshot.users[1] = {
      ...impossibleSnapshot.users[1],
      isConnected: false,
      isOccupyingCurrentSpace: true,
      displayStatus: "online",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(impossibleSnapshot)),
    );

    await expect(
      fetchPresenceSnapshot(COMPANY_ID, USER_ID),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("passes the query cancellation signal to fetch", async () => {
    let observedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          (_url: string, init?: RequestInit): Promise<Response> => {
            observedSignal = init?.signal ?? undefined;
            return new Promise<Response>(() => undefined);
          },
        ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { unmount } = renderHook(
      () => usePresenceSnapshot(COMPANY_ID, USER_ID),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(observedSignal).toBeInstanceOf(AbortSignal));
    expect(observedSignal?.aborted).toBe(false);
    unmount();
    expect(observedSignal?.aborted).toBe(true);
  });

  it("uses the scoped key and refuses to cache a mismatched identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(snapshot({ companyId: OTHER_COMPANY_ID })),
        ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => usePresenceSnapshot(COMPANY_ID, USER_ID),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({
      code: "SNAPSHOT_IDENTITY_MISMATCH",
      retryable: false,
    });
    expect(
      queryClient.getQueryData(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID)),
    ).toBeUndefined();
  });

  it("does not fetch while disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => usePresenceSnapshot(COMPANY_ID, USER_ID, false),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
