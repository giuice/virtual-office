import { test as phase5Test, expect, type Phase5Device } from './messaging-phase5';
import {
  attachRealtimeFaultHarness,
  type RealtimeFaultController,
} from '../helpers/realtime-stream-faults';

/**
 * Phase 5 T25 — the T24 fixtures plus per-stream Realtime faults
 * (helpers/realtime-stream-faults.ts documents the mechanism and API).
 *
 *   realtimeFaults.attach(device)  routes the device's Realtime sockets through
 *                                  the harness (all its tabs) and records the
 *                                  first tab's subscribe-callback statuses;
 *                                  reloads that tab unless { reload: false }
 *                                  (then navigate before relying on it).
 *
 * After the test every fault is lifted; the test fails if a route refused a
 * non-loopback Realtime URL or the harness failed to handle a frame (it then
 * forwarded it unchanged). Contexts are closed by openDevice.
 */

export interface RealtimeFaultsFixture {
  attach(device: Phase5Device, options?: { reload?: boolean }): Promise<RealtimeFaultController>;
}

export const test = phase5Test.extend<{ realtimeFaults: RealtimeFaultsFixture }>({
  realtimeFaults: async ({}, use) => {
    const attached: Array<{ label: string; harness: RealtimeFaultController }> = [];
    await use({
      attach: async (device, options) => {
        const harness = await attachRealtimeFaultHarness(device.context, device.page, device.label, options);
        attached.push({ label: device.label, harness });
        return harness;
      },
    });
    for (const { label, harness } of attached) {
      harness.restore();
      harness.restoreConnection();
      expect(harness.violations(), `${label}: refused Realtime hosts or unhandled frames`).toEqual([]);
    }
  },
});

export { expect };
export type { Phase5Device };
