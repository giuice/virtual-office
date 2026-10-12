import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/auth/authorize';
import { enforceRateLimit, rateLimitUnavailableResponse } from '@/lib/auth/rate-limit';
import { requireAuthUser } from '@/lib/auth/session';
import {
  MESSAGING_METRICS_MAX_BYTES,
  MESSAGING_METRICS_MAX_EVENTS,
  type MessagingMetricsResponse,
} from '@/lib/messaging/metrics-contract';
import {
  readBoundedBody,
  serverAppVersion,
  toMessagingMetricLogLine,
  writeMessagingMetricLines,
  type MessagingMetricLogLine,
} from '@/lib/messaging/metrics-log';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

/**
 * POST /api/messages/metrics — Phase 5 T6 (FR-027, BR-013, AC-028): sink of
 * the client's messaging health metrics, written as redacted structured log
 * lines (one JSON line per accepted event).
 *
 * Body (application/json): { events: MessagingMetricEventInput[] } — see
 * src/lib/messaging/metrics-contract.ts for the closed enums and bounds.
 *
 * Order: authenticate (401, nothing charged, no metric line; the normal
 * api_error / auth diagnostics of requireAuthUser are still written) → charge the per-user
 * 'messaging:metrics' budget, fail-closed (429) → 415 unless JSON → raw body
 * at most 16 KB counted on the received bytes (413
 * METRICS_PAYLOAD_TOO_LARGE) → valid JSON object with an `events` array
 * (400) → at most 50 events (413 METRICS_BATCH_TOO_LARGE) → each event
 * validated; invalid ones dropped, unknown fields ignored → 202
 * { accepted, dropped }. A rejected request writes no metric line; it may
 * write the normal api_error diagnostic of its error response (no metric
 * fields, no request data).
 *
 * Lines carry only the event type, reason, conversation type, duration,
 * count, the client event time (bounded), the server receive time, and the
 * server-derived app version — never user, conversation, or message data.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthUser();
    if ('errorResponse' in auth) {
      await request.body?.cancel().catch(() => undefined);
      return auth.errorResponse;
    }

    // The budget fails closed: a limiter client that cannot even be built
    // (e.g. missing service-role key) is a budget that cannot be checked.
    // Diagnostics, no metric line: the fixed limiter-unavailable event below
    // (never the error or the key) plus the api_error line written by
    // rateLimitUnavailableResponse().
    let serviceClient: SupabaseClient;
    try {
      serviceClient = await createSupabaseServerClient('service_role');
    } catch {
      console.error(JSON.stringify({ event: 'messaging_metrics_limiter_unavailable' }));
      await request.body?.cancel().catch(() => undefined);
      return rateLimitUnavailableResponse();
    }
    const overBudget = await enforceRateLimit(serviceClient, auth.dbUser.id, 'messaging:metrics');
    if (overBudget) {
      await request.body?.cancel().catch(() => undefined);
      return overBudget;
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
      await request.body?.cancel().catch(() => undefined);
      return jsonError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Metrics must be sent as application/json');
    }

    const body = await readBoundedBody(request, MESSAGING_METRICS_MAX_BYTES);
    if (!body.ok) {
      return body.reason === 'too_large'
        ? jsonError(413, 'METRICS_PAYLOAD_TOO_LARGE', 'Metrics payload exceeds 16 KB')
        : jsonError(400, 'BAD_REQUEST', 'Metrics payload could not be read');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.bytes));
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }
    const events = (payload as { events?: unknown }).events;
    if (!Array.isArray(events)) {
      return jsonError(400, 'BAD_REQUEST', 'events must be an array');
    }
    if (events.length > MESSAGING_METRICS_MAX_EVENTS) {
      return jsonError(413, 'METRICS_BATCH_TOO_LARGE', 'At most 50 metric events per request');
    }

    const context = { now: Date.now(), appVersion: serverAppVersion() };
    const lines: MessagingMetricLogLine[] = [];
    for (const event of events) {
      const line = toMessagingMetricLogLine(event, context);
      if (line) lines.push(line);
    }
    writeMessagingMetricLines(lines);

    const result: MessagingMetricsResponse = { accepted: lines.length, dropped: events.length - lines.length };
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    // Never log the error object: it could carry request data.
    console.error(JSON.stringify({ event: 'messaging_metrics_failed', errorName: error instanceof Error ? error.name : 'unknown' }));
    return NextResponse.json({ error: 'Failed to record metrics', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
