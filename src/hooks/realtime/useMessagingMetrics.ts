// src/hooks/realtime/useMessagingMetrics.ts
"use client";

import { useEffect } from 'react';

import { activateMessagingMetrics } from '@/lib/messaging/metrics-recorder';
import type { MessagingRealtimeHealth } from '@/lib/messaging/realtime-health';
import { observeStreamHealthMetrics } from '@/lib/messaging/stream-metrics';

interface UseMessagingMetricsOptions {
  /** This tab's messaging stream health (T13), read only. */
  health: MessagingRealtimeHealth;
  /** The signed-in user's users.id (null/undefined: signed out, nothing is delivered). */
  userId: string | null | undefined;
}

/**
 * Phase 5 T19 (FR-027, FR-028): delivers this tab's messaging metrics for the
 * signed-in user (metrics-recorder.ts) and records the messaging streams'
 * drops and recoveries from the health store (stream-metrics.ts). Send and
 * polling metrics are recorded where they happen (the outbox, the polling
 * fallback). Nothing here is awaited by messaging.
 */
export function useMessagingMetrics({ health, userId }: UseMessagingMetricsOptions): void {
  useEffect(() => (userId ? activateMessagingMetrics(userId) : undefined), [userId]);
  useEffect(() => observeStreamHealthMetrics(health), [health]);
}
