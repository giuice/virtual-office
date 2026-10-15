# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ai-not-configured.spec.ts >> meeting notes — AI not configured (AC-018) >> AI controls are disabled with the message; manual editing works; only the admin gets the settings link
- Location: __tests__\api\playwright\meeting-notes\ai-not-configured.spec.ts:20:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#ai-settings')
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for locator('#ai-settings')

```

```yaml
- link "Virtual Office":
  - /url: /dashboard
- textbox "Search users..."
- 'button "Current theme: Paper White. Click to change theme."': Paper White Open theme menu
- button
- button "LP"
- heading "Company Management" [level=1]
- paragraph: Manage Playwright Messaging Company settings, members and permissions
- tablist:
  - tab "Team Members" [selected]
  - tab "Company Settings"
- tabpanel "Team Members":
  - text: Team Members 6 members in Playwright Messaging Company
  - button "Convidar Usuário"
  - img "MN E2E Switch member 68d76f19"
  - text: MN E2E Switch member 68d76f19 mn-e2e-acct-a-switch-member-68d76f19@local.test Member
  - button:
    - img
  - img "Local Primary"
  - text: Local Primary messaging-primary@local.test Admin You
  - img "Local Secondary"
  - text: Local Secondary messaging-secondary@local.test Member
  - button:
    - img
  - img "Local Quinary"
  - text: Local Quinary messaging-fifth@local.test Member
  - button:
    - img
  - img "Local Quaternary"
  - text: Local Quaternary messaging-fourth@local.test Member
  - button:
    - img
  - img "Local Tertiary"
  - text: Local Tertiary messaging-tertiary@local.test Member
  - button:
    - img
  - text: Gerenciar Convites Crie, copie e revogue convites para sua equipe
  - link "Abrir Gerenciador":
    - /url: /admin/invitations
- button "Open messages": "1"
- region "Notifications alt+T"
- alert: Company Management
```

# Test source

```ts
  1  | import { expect, test } from '../fixtures/meeting-notes';
  2  | import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
  3  | import { aiSection } from '../helpers/meeting-notes-ai-e2e';
  4  | import {
  5  |   actionItemRow,
  6  |   fillActionItemForm,
  7  |   openNote,
  8  |   saveActionItemForm,
  9  |   saveNoteForm,
  10 | } from '../helpers/meeting-notes-ui';
  11 | 
  12 | /**
  13 |  * AC-018 (FR-025): with no AI provider configured for the company, a member
  14 |  * who may edit a note (with a stored transcript) sees the AI controls
  15 |  * disabled with "An admin needs to configure AI" and no settings link, while
  16 |  * manual editing (fields and action items) works; an admin additionally gets
  17 |  * a link that opens the company page's AI settings section.
  18 |  */
  19 | test.describe('meeting notes — AI not configured (AC-018)', () => {
  20 |   test('AI controls are disabled with the message; manual editing works; only the admin gets the settings link', async ({
  21 |     primaryPage,
  22 |     secondaryPage,
  23 |     notesWorld,
  24 |   }) => {
  25 |     await notesWorld.resetAiSettingsUnsafe();
  26 |     const tag = notesWorld.runTag;
  27 |     const space = await notesWorld.createSpace('No AI room');
  28 |     const member = secondaryPage;
  29 |     const noteId = await notesWorld.createNote(member, {
  30 |       spaceId: space.id,
  31 |       title: `${MEETING_NOTES_E2E_PREFIX} No AI ${tag}`,
  32 |       meetingDate: new Date(),
  33 |       content: '<p>Written by hand</p>',
  34 |     });
  35 |     await notesWorld.setSummaryAndTranscriptUnsafe(noteId, { summary: null, transcript: `Ana: Hello ${tag}.` });
  36 | 
  37 |     // The member (author, so an editor): disabled controls, the message, no link.
  38 |     await openNote(member, noteId);
  39 |     const memberAi = aiSection(member);
  40 |     await expect(memberAi.getByTestId('meeting-note-ai-not-configured')).toBeVisible({ timeout: 30_000 });
  41 |     await expect(memberAi.getByTestId('meeting-note-ai-start')).toBeDisabled();
  42 |     await expect(memberAi).toContainText('An admin needs to configure AI.');
  43 |     await expect(memberAi.getByTestId('meeting-note-ai-settings-link')).toHaveCount(0);
  44 | 
  45 |     // Manual editing works: the fields and an action item.
  46 |     const newTitle = `${MEETING_NOTES_E2E_PREFIX} No AI edited ${tag}`;
  47 |     await member.getByTestId('meeting-note-edit-button').click();
  48 |     await member.getByLabel('Title', { exact: true }).fill(newTitle);
  49 |     await saveNoteForm(member);
  50 |     await expect(member.getByTestId('meeting-note-title')).toHaveText(newTitle);
  51 |     const description = `Send the minutes ${tag}`;
  52 |     await member.getByTestId('meeting-note-item-add').click();
  53 |     await fillActionItemForm(member, { description });
  54 |     await saveActionItemForm(member);
  55 |     await expect(actionItemRow(member, description)).toBeVisible();
  56 |     const stored = await notesWorld.readNote(member, noteId);
  57 |     expect(stored.note?.title).toBe(newTitle);
  58 |     expect(stored.note?.actionItems.map((item) => item.description)).toEqual([description]);
  59 | 
  60 |     // The admin: the same disabled controls plus the link to the AI settings.
  61 |     const admin = primaryPage;
  62 |     await openNote(admin, noteId);
  63 |     const adminAi = aiSection(admin);
  64 |     await expect(adminAi.getByTestId('meeting-note-ai-not-configured')).toBeVisible({ timeout: 30_000 });
  65 |     await expect(adminAi.getByTestId('meeting-note-ai-start')).toBeDisabled();
  66 |     await expect(adminAi).toContainText('An admin needs to configure AI.');
  67 |     const link = adminAi.getByTestId('meeting-note-ai-settings-link');
  68 |     await expect(link).toHaveAttribute('href', '/company?tab=settings#ai-settings');
  69 |     await link.click();
  70 |     await expect(admin).toHaveURL(/\/company\?tab=settings#ai-settings$/, { timeout: 30_000 });
> 71 |     await expect(admin.locator('#ai-settings')).toBeVisible({ timeout: 30_000 });
     |                                                 ^ Error: expect(locator).toBeVisible() failed
  72 |     await expect(admin.getByTestId('ai-settings-status')).toHaveText('AI is not configured yet.');
  73 |   });
  74 | });
  75 | 
```