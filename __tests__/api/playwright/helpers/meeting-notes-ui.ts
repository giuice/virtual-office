import { expect, type Locator, type Page } from '@playwright/test';

/**
 * UI steps shared by the Phase 6 meeting-note specs (T6): the note view at
 * /meetings/[id], its edit form, and the Tiptap editor (a contenteditable
 * with role textbox named by its "Notes" label).
 */

/** Opens a note's view and waits until the note is shown. */
export async function openNote(page: Page, noteId: string): Promise<Locator> {
  await page.goto(`/meetings/${noteId}`);
  const view = page.getByTestId('meeting-note-view');
  await expect(view).toBeVisible({ timeout: 30_000 });
  await expect(view).toHaveAttribute('data-note-id', noteId);
  return view;
}

/** The rich-text editor of the open form, once Tiptap has mounted. */
export async function noteEditor(page: Page): Promise<Locator> {
  const editor = page.getByRole('textbox', { name: 'Notes' });
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  return editor;
}

/** Replaces the whole editor content with `text` typed as one paragraph. */
export async function replaceEditorText(page: Page, text: string): Promise<void> {
  const editor = await noteEditor(page);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
  await expect(editor).toContainText(text);
}

/** A toolbar control of the editor by its accessible name. */
export function toolbarButton(page: Page, name: string): Locator {
  return page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name, exact: true });
}

/** Saves the open form and waits for the view of the saved note. */
export async function saveNoteForm(page: Page): Promise<void> {
  await page.getByTestId('meeting-note-submit').click();
  await expect(page.getByTestId('meeting-note-view')).toBeVisible({ timeout: 30_000 });
}

/** Adds a company member as participant through the picker. */
export async function addParticipant(page: Page, displayName: string): Promise<void> {
  await page.getByRole('button', { name: 'Add participants' }).click();
  await page.getByRole('textbox', { name: 'Search members' }).fill(displayName);
  await page.getByRole('button', { name: `Add ${displayName}`, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByTestId('meeting-note-participant-chip').filter({ hasText: displayName }),
  ).toBeVisible();
}

/** The action-item row whose description contains `text` (T7). */
export function actionItemRow(page: Page, text: string): Locator {
  return page.getByTestId('meeting-note-item').filter({
    has: page.getByTestId('meeting-note-item-description').filter({ hasText: text }),
  });
}

/** Fills the open action-item form: description, assignee (display name or 'Unassigned'), due date ('' clears). */
export async function fillActionItemForm(
  page: Page,
  fields: { description?: string; assignee?: string; dueDate?: string },
): Promise<void> {
  const form = page.getByTestId('meeting-note-item-form');
  await expect(form).toBeVisible();
  if (fields.description !== undefined) {
    await form.getByLabel('Description').fill(fields.description);
  }
  if (fields.assignee !== undefined) {
    await form.getByRole('combobox', { name: 'Assignee' }).click();
    await page.getByRole('option', { name: fields.assignee, exact: true }).click();
    await expect(form.getByRole('combobox', { name: 'Assignee' })).toContainText(fields.assignee);
  }
  if (fields.dueDate !== undefined) {
    await form.getByLabel('Due date').fill(fields.dueDate);
  }
}

/** Saves the open action-item form and waits until it closes. */
export async function saveActionItemForm(page: Page): Promise<void> {
  await page.getByTestId('meeting-note-item-save').click();
  await expect(page.getByTestId('meeting-note-item-form')).toHaveCount(0, { timeout: 15_000 });
}

/** Clicks "Export Markdown" (optionally with "Include transcript") and returns the downloaded file. */
export async function exportNoteMarkdown(
  page: Page,
  options: { includeTranscript?: boolean } = {},
): Promise<{ filename: string; text: string }> {
  const transcript = page.getByTestId('meeting-note-export-include-transcript');
  if (options.includeTranscript !== undefined && (await transcript.count()) > 0) {
    await transcript.setChecked(options.includeTranscript);
  } else if (options.includeTranscript) {
    throw new Error('"Include transcript" is not offered for this note');
  }
  const downloadEvent = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return { filename: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}
