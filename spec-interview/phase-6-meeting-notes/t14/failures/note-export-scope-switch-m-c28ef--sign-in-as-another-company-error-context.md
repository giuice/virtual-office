# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: note-export-scope-switch.spec.ts >> meeting notes — export across an account switch (B-2) >> a delayed export of the previous account never downloads after sign-in as another company
- Location: __tests__\api\playwright\meeting-notes\note-export-scope-switch.spec.ts:22:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

```
Error: Sign-in as mn-e2e-acct-switcher-645e6669@local.test failed: Error: page.waitForEvent: Target page, context or browser has been closed
=========================== logs ===========================
waiting for event "requestfailed"
============================================================. Login page alert: none
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - img [ref=e4]
    - paragraph [ref=e6]: Redirecionando...
  - button "Open messages" [ref=e8]:
    - img
  - region "Notifications alt+T"
  - generic [ref=e13] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e14]:
      - img [ref=e15]
    - generic [ref=e18]:
      - button "Open issues overlay" [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]: "0"
          - generic [ref=e22]: "1"
        - generic [ref=e23]: Issue
      - button "Collapse issues badge" [ref=e24]:
        - img [ref=e25]
  - alert [ref=e27]: Authentication - Virtual Office
```

# Test source

```ts
  114 |     },
  115 |     data: input,
  116 |   });
  117 |   if (!response.ok()) {
  118 |     throw new Error(`Failed to mark messages read: ${response.status()} ${await response.text()}`);
  119 |   }
  120 |   const body = (await response.json()) as { recorded: number };
  121 |   return body.recorded;
  122 | }
  123 | 
  124 | /**
  125 |  * Removes a seeded member from a seeded conversation through the seed route
  126 |  * (the app has no member-removal path), to test a member who lost access.
  127 |  * Their star rows are kept. Returns the number of membership rows removed.
  128 |  */
  129 | export async function removeSeededMember(
  130 |   request: APIRequestContext,
  131 |   input: { conversationId: string; userId: string },
  132 | ): Promise<number> {
  133 |   const response = await request.patch('/api/test/messaging/seed', {
  134 |     headers: {
  135 |       'x-test-secret': PLAYWRIGHT_SECRET ?? '',
  136 |     },
  137 |     data: { action: 'remove-member', ...input },
  138 |   });
  139 |   if (!response.ok()) {
  140 |     throw new Error(`Failed to remove member: ${response.status()} ${await response.text()}`);
  141 |   }
  142 |   const body = (await response.json()) as { removed: number };
  143 |   return body.removed;
  144 | }
  145 | 
  146 | async function cleanupMessagingData(request: APIRequestContext, data: MessagingTestData) {
  147 |   await request.delete('/api/test/messaging/seed', {
  148 |     headers: {
  149 |       'x-test-secret': PLAYWRIGHT_SECRET ?? '',
  150 |     },
  151 |     data: {
  152 |       companyId: data.companyId,
  153 |       userIds: [data.primary.userId, data.secondary.userId],
  154 |       conversationIds: [
  155 |         data.directConversationId,
  156 |         ...data.roomConversationIds,
  157 |         ...(data.groupConversationId ? [data.groupConversationId] : []),
  158 |       ],
  159 |       messageIds: data.messageIds,
  160 |       spaceIds: data.spaceIds,
  161 |     },
  162 |   });
  163 | }
  164 | 
  165 | const SIGNED_IN_URL = /dashboard|floor-plan/;
  166 | const SIGN_IN_TIMEOUT_MS = 30_000;
  167 | 
  168 | const isPasswordSignInRequest = (request: Request) =>
  169 |   request.method() === 'POST' &&
  170 |   new URL(request.url()).pathname === '/auth/v1/token' &&
  171 |   new URL(request.url()).searchParams.get('grant_type') === 'password';
  172 | 
  173 | /**
  174 |  * Signs in through the login page. The browser calls Supabase Auth directly;
  175 |  * in local mode that request crosses the host → Docker port forward. When it
  176 |  * fails in transit (it never reaches the Auth gateway, which logs nothing for
  177 |  * it) the page shows "Unable to reach the authentication service". Only in
  178 |  * that case, and only once, the form is submitted again; the resubmission is
  179 |  * recorded on the test. Every other outcome (wrong credentials, a rate limit,
  180 |  * a second transport failure, no redirect) fails with what the page showed.
  181 |  */
  182 | export async function login(page: Page, email: string, password: string) {
  183 |   await page.goto('/login');
  184 |   // The login page is localized (pt-BR today); match either language.
  185 |   await page.getByLabel(/^email$/i).fill(email);
  186 |   await page.getByLabel(/^(password|senha)$/i).fill(password);
  187 |   const signInButton = page.getByRole('button', { name: /^(sign in|entrar)$/i });
  188 |   // The form's error message (Next's empty route announcer is also an alert).
  189 |   const formAlert = page.getByRole('alert').filter({ hasText: /\S/ });
  190 | 
  191 |   const submit = async (): Promise<string> => {
  192 |     const transportFailure = page
  193 |       .waitForEvent('requestfailed', { predicate: isPasswordSignInRequest, timeout: SIGN_IN_TIMEOUT_MS })
  194 |       .then((request) => request.failure()?.errorText ?? 'unknown network error');
  195 |     const signedIn = page
  196 |       .waitForURL(SIGNED_IN_URL, { timeout: SIGN_IN_TIMEOUT_MS })
  197 |       .then(() => 'signed-in' as const);
  198 |     // Whichever settles second is no longer awaited.
  199 |     transportFailure.catch(() => {});
  200 |     signedIn.catch(() => {});
  201 |     await signInButton.click();
  202 |     return Promise.race([signedIn, transportFailure]);
  203 |   };
  204 | 
  205 |   const describeFailure = async (reason: string) => {
  206 |     const pageAlert = (await formAlert.allInnerTexts().catch(() => [])).join(' | ');
  207 |     return `Sign-in as ${email} failed: ${reason}. Login page alert: ${pageAlert || 'none'}`;
  208 |   };
  209 | 
  210 |   let outcome: string;
  211 |   try {
  212 |     outcome = await submit();
  213 |   } catch (error) {
> 214 |     throw new Error(await describeFailure(String(error)), { cause: error });
      |           ^ Error: Sign-in as mn-e2e-acct-switcher-645e6669@local.test failed: Error: page.waitForEvent: Target page, context or browser has been closed
  215 |   }
  216 |   if (outcome === 'signed-in') return;
  217 | 
  218 |   // The form re-enables after the error; resubmit the same credentials.
  219 |   await expect(formAlert).toBeVisible();
  220 |   test.info().annotations.push({
  221 |     type: 'auth-transport-retry',
  222 |     description: `${email}: sign-in request failed in transit (${outcome}; page: "${await formAlert.innerText()}"); submitted once more`,
  223 |   });
  224 |   try {
  225 |     outcome = await submit();
  226 |   } catch (error) {
  227 |     throw new Error(await describeFailure(String(error)), { cause: error });
  228 |   }
  229 |   if (outcome !== 'signed-in') {
  230 |     throw new Error(await describeFailure(`sign-in request failed in transit twice (${outcome})`));
  231 |   }
  232 | }
  233 | 
  234 | async function createStorageState(browser: Browser, email: string, password: string): Promise<AuthStorageState> {
  235 |   const context = await browser.newContext();
  236 |   const page = await context.newPage();
  237 |   const verifyTraffic = guardLocalSupabaseTraffic(page, `login ${email}`);
  238 |   await login(page, email, password);
  239 |   const state = await context.storageState();
  240 |   await context.close();
  241 |   verifyTraffic();
  242 |   return state;
  243 | }
  244 | 
  245 | type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
  246 | 
  247 | const isLocalSupabaseMode = process.env[LOCAL_MESSAGING_FLAG] === '1';
  248 | 
  249 | /**
  250 |  * Local mode only: record every browser request and fail the test if any of
  251 |  * them reached a hosted Supabase domain. The Supabase hosts seen are attached
  252 |  * as an annotation so each run carries its own network evidence.
  253 |  */
  254 | export function guardLocalSupabaseTraffic(page: Page, label: string): () => void {
  255 |   if (!isLocalSupabaseMode) {
  256 |     return () => {};
  257 |   }
  258 |   const supabaseHosts = new Set<string>();
  259 |   const hostedRequests: string[] = [];
  260 |   const record = (url: string) => {
  261 |     if (isHostedSupabaseUrl(url)) {
  262 |       hostedRequests.push(new URL(url).host);
  263 |     } else if (/\/(rest|auth|realtime|storage)\/v1\//.test(url)) {
  264 |       supabaseHosts.add(new URL(url).host);
  265 |     }
  266 |   };
  267 |   page.on('request', (request) => record(request.url()));
  268 |   // Realtime runs over WebSocket, which does not emit 'request' events.
  269 |   page.on('websocket', (socket) => record(socket.url()));
  270 |   return () => {
  271 |     test.info().annotations.push({
  272 |       type: 'supabase-hosts',
  273 |       description: `${label}: ${[...supabaseHosts].join(', ') || 'none'}`,
  274 |     });
  275 |     expect(hostedRequests, `${label} sent requests to a hosted Supabase project`).toEqual([]);
  276 |   };
  277 | }
  278 | 
  279 | /**
  280 |  * Presence auto-placement shows a toast ("Welcome! You've been placed in …" /
  281 |  * "Reconnected to …") after every page load. The toaster sits bottom-right,
  282 |  * over the drawer composer, and hovering it pauses its auto-dismiss, so a
  283 |  * click aimed at the send button could wait on it indefinitely. Close it
  284 |  * whenever it is visible before an action; it is never what a messaging test
  285 |  * is exercising.
  286 |  */
  287 | export async function closePlacementToasts(page: Page): Promise<void> {
  288 |   const placementToast = page
  289 |     .locator('[data-sonner-toast]')
  290 |     .filter({ hasText: /Welcome! You've been placed in|Reconnected to/ });
  291 |   await page.addLocatorHandler(placementToast, async (toast) => {
  292 |     // Dispatched rather than clicked: the toast can appear while a modal
  293 |     // Radix menu is open, which disables pointer events outside the menu.
  294 |     // A toast that is already leaving has no close button any more; do not
  295 |     // block the interrupted action waiting for one (it dismisses itself).
  296 |     await toast
  297 |       .locator('[data-close-button]')
  298 |       .first()
  299 |       .dispatchEvent('click', undefined, { timeout: 2_000 })
  300 |       .catch(() => {});
  301 |   });
  302 | }
  303 | 
  304 | type MessagingFixtures = {
  305 |   /** Override per file with test.use({ messagingSeedOptions: { ... } }). */
  306 |   messagingSeedOptions: MessagingSeedOptions;
  307 |   primaryPage: Page;
  308 |   secondaryPage: Page;
  309 |   messagingData: MessagingTestData;
  310 |   primaryStorageState: AuthStorageState;
  311 |   secondaryStorageState: AuthStorageState;
  312 | };
  313 | 
  314 | export const test = base.extend<MessagingFixtures>({
```