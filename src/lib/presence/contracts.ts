import { z } from "zod";

export const presenceAvailabilityStatuses = ["online", "away", "busy"] as const;
export const presenceDisplayStatuses = [
  "online",
  "away",
  "busy",
  "offline",
] as const;

export const presenceSnapshotUserSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    currentSpaceId: z.string().uuid().nullable(),
    locationVersion: z.number().int().nonnegative(),
    availabilityStatus: z.enum(presenceAvailabilityStatuses),
    isConnected: z.boolean(),
    isOccupyingCurrentSpace: z.boolean(),
    displayStatus: z.enum(presenceDisplayStatuses),
    statusMessage: z.string().nullable(),
  })
  .strict()
  .superRefine((user, context) => {
    if (user.isConnected !== (user.displayStatus !== "offline")) {
      context.addIssue({
        code: "custom",
        path: ["displayStatus"],
        message: "Display status must reflect authoritative connectivity",
      });
    }

    if (user.isConnected && user.displayStatus !== user.availabilityStatus) {
      context.addIssue({
        code: "custom",
        path: ["displayStatus"],
        message: "Connected display status must match availability",
      });
    }

    if (
      user.isOccupyingCurrentSpace &&
      (!user.isConnected || user.currentSpaceId === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["isOccupyingCurrentSpace"],
        message: "An occupant must be connected and have a current space",
      });
    }
  });

export const presenceSnapshotSchema = z
  .object({
    serverTime: z.string().datetime({ offset: true }),
    companyId: z.string().uuid(),
    viewerUserId: z.string().uuid(),
    currentUser: z
      .object({
        initialPlacementCompletedAt: z
          .string()
          .datetime({ offset: true })
          .nullable(),
      })
      .strict(),
    users: z.array(presenceSnapshotUserSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const userIds = new Set<string>();
    let viewerCount = 0;

    snapshot.users.forEach((user, index) => {
      if (userIds.has(user.id)) {
        context.addIssue({
          code: "custom",
          path: ["users", index, "id"],
          message: "Snapshot users must be unique",
        });
      }
      userIds.add(user.id);

      if (user.id === snapshot.viewerUserId) {
        viewerCount += 1;
      }
    });

    if (viewerCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["viewerUserId"],
        message: "Snapshot must contain the viewer exactly once",
      });
    }
  });

export const presenceSnapshotErrorCodes = [
  "UNAUTHORIZED",
  "AUTH_SESSION_REVOKED",
  "PRESENCE_SNAPSHOT_TOO_LARGE",
  "PRESENCE_VIEWER_NO_COMPANY",
  "INTERNAL_ERROR",
] as const;

export const presenceSnapshotErrorResponseSchema = z
  .object({
    success: z.literal(false),
    code: z.enum(presenceSnapshotErrorCodes),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();

export type PresenceAvailabilityStatus =
  (typeof presenceAvailabilityStatuses)[number];
export type PresenceDisplayStatus = (typeof presenceDisplayStatuses)[number];
export type PresenceSnapshotUser = z.infer<typeof presenceSnapshotUserSchema>;
export type PresenceSnapshot = z.infer<typeof presenceSnapshotSchema>;
export type PresenceSnapshotErrorCode =
  (typeof presenceSnapshotErrorCodes)[number];
export type PresenceSnapshotErrorResponse = z.infer<
  typeof presenceSnapshotErrorResponseSchema
>;
