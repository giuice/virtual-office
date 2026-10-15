import { createMeetingNotesE2EWorld, type MeetingNotesE2EWorld } from '../helpers/meeting-notes-e2e';
import { expect, test as messagingTest } from './messaging';

/**
 * Phase 6 meeting-notes E2E fixtures: the messaging two-account world
 * (company A: primary = admin, secondary = member, both signed in through the
 * login page) plus `notesWorld`, which writes notes through the real routes
 * and removes everything it created after the test.
 */
type MeetingNotesFixtures = {
  notesWorld: MeetingNotesE2EWorld;
};

export const test = messagingTest.extend<MeetingNotesFixtures>({
  notesWorld: async ({ messagingData }, use) => {
    const world = createMeetingNotesE2EWorld(messagingData.companyId, messagingData.primary.userId);
    try {
      await use(world);
    } finally {
      await world.cleanup();
    }
  },
});

export { expect };
