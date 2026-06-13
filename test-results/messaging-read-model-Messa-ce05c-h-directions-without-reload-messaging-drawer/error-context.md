# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: messaging-read-model.spec.ts >> Messaging read-model phase 2.x verification >> LIVE DELIVERY BOTH WAYS should flow both directions without reload
- Location: __tests__/api/playwright/messaging-read-model.spec.ts:69:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid^="message-"]').filter({ hasText: 'phase2.1-primary-1781176116097' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('[data-testid^="message-"]').filter({ hasText: 'phase2.1-primary-1781176116097' })

```

```yaml
- navigation:
  - img "Logo"
  - link "Home":
    - /url: /dashboard
  - link "About":
    - /url: /about
  - link "Contact":
    - /url: /contact
- main:
  - link "Virtual Office":
    - /url: /dashboard
  - textbox "Search users..."
  - 'button "Current theme: Paper White. Click to change theme."': Paper White Open theme menu
  - button
  - button "T"
  - button "Show Debug Panel"
  - region "Office pulse summary":
    - text: "Spaces 2 Online 2 Meetings 1 Office pulse: 2 spaces, 2 online, 1 in meetings, 0 beacons"
    - textbox "Search spaces":
      - /placeholder: Search spaces...
  - button "Manage Rooms"
  - button "Use Template"
  - combobox: All Types
  - text: View
  - button "Orbit View - Standard layout"
  - button "Analyst View - Dense layout with sparklines"
  - button "Cinema View - Large cards"
  - button
  - button "Chat in Room"
  - button "Space Test Space 2 fd056629-6296-442a-b07b-7dd5712639a5, 0 of 9 participants":
    - button "Actions for Test Space 2 fd056629-6296-442a-b07b-7dd5712639a5"
    - text: Active 0/9
    - heading "Test Space 2 fd056629-6296-442a-b07b-7dd5712639a5" [level=3]
    - text: Conference > Automated test space fd056629-6296-442a-b07b-7dd5712639a5-2 Empty
  - button "Space Test Space 1 fd056629-6296-442a-b07b-7dd5712639a5, 2 of 8 participants":
    - button "Actions for Test Space 1 fd056629-6296-442a-b07b-7dd5712639a5"
    - text: Active 2/8
    - heading "Test Space 1 fd056629-6296-442a-b07b-7dd5712639a5" [level=3]
    - text: Workspace > Automated test space fd056629-6296-442a-b07b-7dd5712639a5-1
    - button "test-primary@example.com's avatar - click for options":
      - img "test-primary@example.com"
    - button "test-secondary@example.com's avatar - click for options":
      - img "test-secondary@example.com"
- button
- text: test-primary@example.com
- button "View all conversations"
- button "Minimize"
- button "Close"
- text: test_dm_fd056629-6296-442a-b07b-7dd5712639a5
- button "test-primary@example.com's avatar actions":
  - img "test-primary@example.com"
- text: test-primary@example.com
- paragraph: Seeded hello from automated run fd056629-6296-442a-b07b-7dd5712639a5
- text: less than a minute ago
- button "1 reply"
- button "Reply"
- button
- button
- button
- textbox "Type a message..."
- button
- button
- button "Insert emoji"
- button "Send message" [disabled]
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  26  |   await triggerButton.waitFor({ state: 'visible', timeout: 10_000 });
  27  |   await triggerButton.click();
  28  | 
  29  |   // Wait for drawer to be visible
  30  |   await page.waitForSelector('[data-testid="messaging-drawer"]', {
  31  |     state: 'visible',
  32  |     timeout: 10_000
  33  |   });
  34  | }
  35  | 
  36  | /**
  37  |  * Closes the messaging drawer.
  38  |  */
  39  | async function closeDrawer(page: Page): Promise<void> {
  40  |   const closeButton = page.locator('[data-testid="messaging-drawer-close"]');
  41  |   await closeButton.click();
  42  | 
  43  |   // Wait for drawer to be hidden
  44  |   await page.waitForSelector('[data-testid="messaging-drawer"]', {
  45  |     state: 'hidden',
  46  |     timeout: 5_000
  47  |   });
  48  | }
  49  | 
  50  | /**
  51  |  * Checks if the messaging drawer is currently open and visible.
  52  |  */
  53  | export async function isDrawerOpen(page: Page): Promise<boolean> {
  54  |   const drawer = page.locator('[data-testid="messaging-drawer"]');
  55  |   return await drawer.isVisible();
  56  | }
  57  | 
  58  | /**
  59  |  * Selects a conversation from the conversation list by conversation ID or title.
  60  |  * Waits for the conversation to become active before returning.
  61  |  */
  62  | export async function selectConversation(
  63  |   page: Page,
  64  |   identifier: { id?: string; title?: string }
  65  | ): Promise<void> {
  66  |   let conversationItem: Locator;
  67  | 
  68  |   if (identifier.id) {
  69  |     conversationItem = page.locator(`[data-testid="conversation-item-${identifier.id}"]`);
  70  |   } else if (identifier.title) {
  71  |     conversationItem = page.locator(`[data-testid^="conversation-item-"]`, { hasText: identifier.title });
  72  |   } else {
  73  |     throw new Error('Must provide either id or title to select conversation');
  74  |   }
  75  | 
  76  |   await conversationItem.click();
  77  | 
  78  |   // Wait for conversation view to load
  79  |   await page.waitForSelector('[data-testid="messages-feed"]', {
  80  |     state: 'visible',
  81  |     timeout: 10_000
  82  |   });
  83  | }
  84  | 
  85  | /**
  86  |  * Sends a message in the currently active conversation.
  87  |  * Waits for message to appear in the feed before returning.
  88  |  */
  89  | export async function sendMessage(page: Page, messageText: string): Promise<string> {
  90  |   const composer = page.locator('[data-testid="composer"]').or(page.locator('[data-testid="message-composer"]'));
  91  |   const input = composer.locator('textarea, input[type="text"]').first();
  92  | 
  93  |   await input.fill(messageText);
  94  | 
  95  |   // Look for send button
  96  |   const sendButton = composer.getByRole('button', { name: /send/i }).or(
  97  |     composer.locator('[data-testid="message-send-button"]')
  98  |   );
  99  | 
  100 |   await sendButton.click();
  101 | 
  102 |   // Wait for message to appear in feed
  103 |   const messageInFeed = page.locator('[data-testid^="message-"]', { hasText: messageText });
  104 |   await expect(messageInFeed).toBeVisible({ timeout: 10_000 });
  105 | 
  106 |   // Extract message ID from data-testid if available
  107 |   const messageId = await messageInFeed.getAttribute('data-testid').then(
  108 |     (id) => id?.replace('message-', '') ?? ''
  109 |   );
  110 | 
  111 |   return messageId;
  112 | }
  113 | 
  114 | /**
  115 |  * Waits for a message to appear via realtime subscription.
  116 |  * Useful for testing cross-user realtime delivery.
  117 |  */
  118 | export async function waitForRealtimeMessage(
  119 |   page: Page,
  120 |   messageText: string,
  121 |   options: { timeout?: number } = {}
  122 | ): Promise<void> {
  123 |   const timeout = options.timeout ?? 15_000; // Realtime may take a few seconds
  124 | 
  125 |   const messageLocator = page.locator('[data-testid^="message-"]', { hasText: messageText });
> 126 |   await expect(messageLocator).toBeVisible({ timeout });
      |                                ^ Error: expect(locator).toBeVisible() failed
  127 | }
  128 | 
  129 | /**
  130 |  * Switches between conversation tabs (Rooms / DMs).
  131 |  */
  132 | export async function switchTab(page: Page, tab: 'rooms' | 'dms'): Promise<void> {
  133 |   const tabButton = page.locator(`[data-testid="conversation-tab-${tab}"]`).or(
  134 |     page.getByRole('tab', { name: new RegExp(tab, 'i') })
  135 |   );
  136 | 
  137 |   await tabButton.click();
  138 |   await expect(tabButton).toHaveAttribute('data-state', 'active');
  139 | }
  140 | 
  141 | /**
  142 |  * Toggles the "Pinned Only" filter in the conversation list.
  143 |  */
  144 | export async function togglePinnedFilter(page: Page): Promise<void> {
  145 |   const filterButton = page.getByRole('button', { name: /pinned/i }).or(
  146 |     page.locator('[data-testid="filter-pinned-toggle"]')
  147 |   );
  148 | 
  149 |   const previousState = await filterButton.getAttribute('aria-pressed');
  150 | 
  151 |   await filterButton.click();
  152 | 
  153 |   if (previousState) {
  154 |     const expectedState = previousState === 'true' ? 'false' : 'true';
  155 |     await expect(filterButton).toHaveAttribute('aria-pressed', expectedState);
  156 |   } else {
  157 |     await expect(filterButton).toHaveAttribute('aria-pressed', /true|false/);
  158 |   }
  159 | }
  160 | 
  161 | /**
  162 |  * Archives a conversation via its context menu.
  163 |  */
  164 | export async function archiveConversation(page: Page, conversationId: string): Promise<void> {
  165 |   const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);
  166 | 
  167 |   // Open context menu (right-click or kebab menu)
  168 |   const moreButton = conversationItem.locator('[data-testid="conversation-menu-trigger"]');
  169 | 
  170 |   if (await moreButton.isVisible()) {
  171 |     await moreButton.click();
  172 |   } else {
  173 |     // Fallback to right-click
  174 |     await conversationItem.click({ button: 'right' });
  175 |   }
  176 | 
  177 |   // Click archive option
  178 |   const archiveOption = page.getByRole('menuitem', { name: /archive/i }).or(
  179 |     page.locator('[data-testid="conversation-action-archive"]')
  180 |   );
  181 | 
  182 |   await Promise.all([
  183 |     page.waitForResponse(
  184 |       (response) =>
  185 |         response.url().includes('/api/conversations/archive') &&
  186 |         response.request().method() === 'PATCH' &&
  187 |         response.ok()
  188 |     ),
  189 |     archiveOption.click(),
  190 |   ]);
  191 | 
  192 |   // Wait for conversation to disappear from list
  193 |   await expect(conversationItem).toBeHidden({ timeout: 5_000 });
  194 | }
  195 | 
  196 | /**
  197 |  * Unarchives a conversation from the archived section.
  198 |  */
  199 | export async function unarchiveConversation(page: Page, conversationId: string): Promise<void> {
  200 |   // First navigate to archived section if not already there
  201 |   const archivedSection = page.locator('[data-testid="archived-section"]');
  202 | 
  203 |   if (!(await archivedSection.isVisible())) {
  204 |     const archivedTrigger = page.getByRole('button', { name: /archived/i }).or(
  205 |       page.locator('[data-testid="show-archived-button"]')
  206 |     );
  207 |     await archivedTrigger.click();
  208 |   }
  209 | 
  210 |   const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);
  211 | 
  212 |   // Open context menu
  213 |   const moreButton = conversationItem.locator('[data-testid="conversation-menu-trigger"]');
  214 | 
  215 |   if (await moreButton.isVisible()) {
  216 |     await moreButton.click();
  217 |   } else {
  218 |     await conversationItem.click({ button: 'right' });
  219 |   }
  220 | 
  221 |   // Click unarchive option
  222 |   const unarchiveOption = page.getByRole('menuitem', { name: /unarchive/i }).or(
  223 |     page.locator('[data-testid="conversation-action-unarchive"]')
  224 |   );
  225 | 
  226 |   await Promise.all([
```