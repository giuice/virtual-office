import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const legacyPresenceRouteGroups = [
  'users-location',
  'users-offline-status',
] as const;

export type LegacyPresenceRouteGroup =
  (typeof legacyPresenceRouteGroups)[number];

export class LegacyPresenceRouteAuditError extends Error {
  readonly code = 'LEGACY_AUDIT_UNAVAILABLE';

  constructor() {
    super('Legacy presence route audit is unavailable');
    this.name = 'LegacyPresenceRouteAuditError';
  }
}

export async function recordLegacyPresenceRouteCall(
  routeGroup: LegacyPresenceRouteGroup,
): Promise<void> {
  const admin = await createSupabaseServerClient('service_role');
  const { error } = await admin.rpc('record_legacy_presence_route_call', {
    p_route_group: routeGroup,
  });

  if (error) {
    throw new LegacyPresenceRouteAuditError();
  }
}

export function isLegacyPresenceRouteAuditError(
  error: unknown,
): error is LegacyPresenceRouteAuditError {
  return error instanceof LegacyPresenceRouteAuditError;
}

