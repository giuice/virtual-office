import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Phase 1 fail-closed window: knock responses are disabled while
 * `knock_requests` browser access is revoked. Phase 4 reimplements this route
 * on top of the service-role `respond_to_knock` transaction function (see
 * docs/presence-safety-remediation-handoff-2026-07-09.md, "knock_requests
 * hardening"). The legacy vulnerable handler was removed; its last version
 * lives in git history.
 */
export async function POST(_request?: Request): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Knock is temporarily unavailable', code: 'KNOCK_TEMPORARILY_UNAVAILABLE' },
    { status: 503 }
  );
}
