# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: messaging-reconnect-consistency.spec.ts >> Timeline data after the Realtime reconnect >> Realtime-only drop: the open reader list and the open starred view show the server state after reconnect
- Location: __tests__\api\playwright\messaging-reconnect-consistency.spec.ts:232:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 1

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e7]:
        - img "Logo" [ref=e9]
        - generic [ref=e10]:
          - link "Home" [ref=e11] [cursor=pointer]:
            - /url: /dashboard
          - link "About" [ref=e12] [cursor=pointer]:
            - /url: /about
          - link "Contact" [ref=e13] [cursor=pointer]:
            - /url: /contact
    - main [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e17]:
          - link "Virtual Office" [ref=e20] [cursor=pointer]:
            - /url: /dashboard
            - img [ref=e21]
            - generic [ref=e24]: Virtual Office
          - generic [ref=e27]:
            - textbox "Search users..." [ref=e28]
            - img [ref=e29]
          - generic [ref=e32]:
            - 'button "Current theme: Paper White. Click to change theme." [ref=e33]':
              - generic [ref=e36]: Paper White
              - generic [ref=e37]: Open theme menu
            - button [ref=e38]:
              - img
            - button "LS" [ref=e40] [cursor=pointer]:
              - generic [ref=e43]: LS
        - generic [ref=e47]:
          - button "Show Debug Panel" [ref=e49]
          - region "Office pulse summary" [ref=e50]:
            - group "2 online, 2 live, 2 free" [ref=e52]:
              - generic [ref=e53]:
                - strong [ref=e55]: "2"
                - text: online
              - generic [ref=e56]:
                - strong [ref=e57]: "2"
                - text: live
              - generic [ref=e58]:
                - strong [ref=e59]: "2"
                - text: free
            - generic [ref=e60]:
              - generic [ref=e61]:
                - img
                - textbox "Search spaces or people" [ref=e62]:
                  - /placeholder: Search spaces or people…
              - button "Use compact density" [ref=e63]:
                - img [ref=e64]
          - generic [ref=e66]:
            - generic [ref=e67]:
              - button "Manage Rooms" [ref=e68]:
                - img
                - text: Manage Rooms
              - button "Use Template" [ref=e69]:
                - img
                - text: Use Template
              - combobox [ref=e70]:
                - generic: All Types
                - img [ref=e71]
            - generic [ref=e73]:
              - button "Enable microphone" [ref=e74]:
                - img
              - generic [ref=e75]:
                - button "Share screen" [ref=e76]:
                  - img
                  - generic [ref=e77]: Share screen
                - generic [ref=e78]: No one is sharing a screen
              - button "Chat in Room" [ref=e79]:
                - img
                - text: Chat in Room
          - generic [ref=e83]:
            - button "Space Test Space Fixed 2, Conference, 1 of 9 participants" [ref=e85] [cursor=pointer]:
              - button "Actions for Test Space Fixed 2" [ref=e87]:
                - img
              - generic [ref=e88]:
                - img [ref=e91]
                - generic [ref=e94]:
                  - heading "Test Space Fixed 2" [level=3] [ref=e96]
                  - paragraph [ref=e97]: Conference
              - paragraph [ref=e98]: Local is here
              - button "Local Primary's avatar - click for options" [ref=e103]:
                - generic "Local Primary's avatar" [ref=e105]:
                  - img "Local Primary" [ref=e106]
              - generic [ref=e108]:
                - generic "1 of 9 places occupied" [ref=e109]:
                  - generic [ref=e110]: 1/9
                - button "Enter" [ref=e113]
            - button "Space Test Space Fixed 1, Workspace, 1 of 8 participants" [ref=e115] [cursor=pointer]:
              - generic [ref=e116]: YOU
              - button "Actions for Test Space Fixed 1" [ref=e118]:
                - img
              - generic [ref=e119]:
                - img [ref=e122]
                - generic [ref=e125]:
                  - heading "Test Space Fixed 1" [level=3] [ref=e127]
                  - paragraph [ref=e128]: Workspace
              - paragraph [ref=e129]: You're here
              - button "Local Secondary's avatar - click for options" [ref=e134]:
                - generic "Local Secondary's avatar" [ref=e136]:
                  - img "Local Secondary" [ref=e137]
              - generic [ref=e139]:
                - generic "1 of 8 places occupied" [ref=e140]:
                  - generic [ref=e141]: 1/8
                - button "You're here" [disabled] [ref=e144]
          - 'button "Find my space: Test Space Fixed 1" [ref=e145]':
            - img [ref=e147]
            - generic [ref=e150]: You are in
            - generic [ref=e151]: Test Space Fixed 1
  - generic [ref=e154]:
    - generic [ref=e155]:
      - generic [ref=e156]:
        - button "Back to conversations" [ref=e157]:
          - img
        - img [ref=e158]
        - generic [ref=e160]: Test Group e595b502-d54c-435a-a8e9-089c8800ce00
      - generic [ref=e161]:
        - button "Ativar notificações" [ref=e163]:
          - img
        - button "View all conversations" [ref=e164]:
          - img
        - button "Minimize" [ref=e165]:
          - img
        - button "Close" [ref=e166]:
          - img
    - status
    - generic [ref=e168]:
      - generic [ref=e170]:
        - generic [ref=e171]: Test Group e595b502-d54c-435a-a8e9-089c8800ce00
        - button "Favoritas" [ref=e172]:
          - img
          - text: Favoritas
      - generic [ref=e177]:
        - generic [ref=e179]:
          - button "Local Primary's avatar actions" [ref=e180]:
            - generic "Local Primary's avatar" [ref=e182]:
              - img "Local Primary" [ref=e183]
          - generic [ref=e185]:
            - generic [ref=e186]: Local Primary
            - paragraph [ref=e188]: t20-readers-1791946512240
            - generic [ref=e190]: less than a minute ago
            - button "Reply" [ref=e192]
        - generic [ref=e194]:
          - button "Local Primary's avatar actions" [ref=e195]:
            - generic "Local Primary's avatar" [ref=e197]:
              - img "Local Primary" [ref=e198]
          - generic [ref=e200]:
            - generic [ref=e201]: Local Primary
            - paragraph [ref=e203]: t20-starred-1791946513912
            - generic [ref=e205]: less than a minute ago
            - button "Reply" [ref=e207]
          - generic [ref=e208]:
            - button "Responder" [ref=e209]:
              - img
            - button [ref=e210]:
              - img
            - button "Mais ações" [ref=e211]:
              - img
      - generic [ref=e217]:
        - textbox "Type a message..." [ref=e218]
        - generic [ref=e219]:
          - button "Anexar arquivos" [ref=e220]:
            - img
          - button "Anexar imagens" [ref=e221]:
            - img
          - button "Insert emoji" [ref=e222]:
            - img
          - button "Gravar nota de voz" [ref=e223]:
            - img
          - button "Send message" [disabled]:
            - img
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e229] [cursor=pointer]:
    - img [ref=e230]
  - alert [ref=e233]
```

# Test source

```ts
  167 |     const starTarget = await sendTextViaApi(secondaryPage.request, conversationId, `t20-star-${Date.now()}`);
  168 |     await expect(feedMessage(primaryPage, starTarget)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
  169 |     const ownMessage = await sendMessage(primaryPage, `t20-receipt-${Date.now()}`);
  170 |     await expect(readBy(primaryPage, ownMessage)).toHaveCount(0);
  171 |     await expect(starredIndicator(primaryPage, starTarget)).toHaveCount(0);
  172 | 
  173 |     // Recorded before the outage: B's tab records a real voice note.
  174 |     const voiceBytes = await recordToneInBrowser(secondaryPage.context(), WEBM, 2);
  175 |     if (!voiceBytes) throw new Error('Chromium cannot record audio/webm;codecs=opus');
  176 |     const image = { name: 't20-foto.png', mimeType: 'image/png', buffer: await canvasPng(secondaryPage, 320, 200) };
  177 |     const pdf = { name: 't20-relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n%T20 ${Date.now()}\n%%EOF\n`) };
  178 | 
  179 |     // A's other session: stars are personal, so a star made there reaches this page only by refetch.
  180 |     const otherSession = await browser.newContext({ storageState: primaryStorageState });
  181 | 
  182 |     // --- Outage.
  183 |     await primaryPage.context().setOffline(true);
  184 |     await realtime.drop();
  185 |     expect(await primaryPage.evaluate(() => navigator.onLine)).toBe(false);
  186 | 
  187 |     // B reads A's message.
  188 |     await selectConversation(secondaryPage, { id: conversationId });
  189 |     await expect(feedMessage(secondaryPage, ownMessage)).toBeInViewport({ timeout: RECV_TIMEOUT_MS });
  190 |     await expect.poll(() => serverReadCount(otherSession.request, ownMessage), { timeout: RECV_TIMEOUT_MS }).toBe(1);
  191 |     // A stars B's message elsewhere.
  192 |     const star = await otherSession.request.post(`/api/messages/${starTarget}/star`);
  193 |     expect(star.status()).toBe(201);
  194 |     // B sends an image + file message and a voice note.
  195 |     const files = await sendFilesViaApi(secondaryPage.request, conversationId, [image, pdf]);
  196 |     const voice = await sendVoiceNoteViaApi(secondaryPage, { conversationId, bytes: voiceBytes, mimeType: WEBM, durationSeconds: 2 });
  197 | 
  198 |     // The app's own reconnect keeps trying while the connection is down.
  199 |     await expect.poll(() => realtime.refusedAttempts(), { timeout: RECV_TIMEOUT_MS }).toBeGreaterThan(0);
  200 |     // Nothing reached the disconnected page.
  201 |     await expect(readBy(primaryPage, ownMessage)).toHaveCount(0);
  202 |     await expect(starredIndicator(primaryPage, starTarget)).toHaveCount(0);
  203 |     await expect(feedMessage(primaryPage, files.messageId)).toHaveCount(0);
  204 |     await expect(feedMessage(primaryPage, voice.messageId)).toHaveCount(0);
  205 | 
  206 |     // --- Back online: the existing reconnect restores Realtime.
  207 |     await reconnect(primaryPage, realtime, { goOnline: true });
  208 | 
  209 |     await expect(readBy(primaryPage, ownMessage)).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
  210 |     await expect(starredIndicator(primaryPage, starTarget)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
  211 |     const filesMessage = feedMessage(primaryPage, files.messageId);
  212 |     await expect(filesMessage).toHaveAttribute('data-attachment-count', '2', { timeout: RECV_TIMEOUT_MS });
  213 |     const thumbnail = filesMessage.getByTestId('attachment-image-thumbnail').locator('img');
  214 |     await expect(thumbnail).toBeVisible();
  215 |     await expect
  216 |       .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: RECV_TIMEOUT_MS })
  217 |       .toBe(320);
  218 |     await expect(filesMessage.getByTestId('attachment-file-name')).toHaveText(pdf.name);
  219 |     await expect(voicePlayerOf(primaryPage, voice.messageId)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
  220 |     await expect(voicePlayerOf(primaryPage, voice.messageId)).toHaveAttribute('data-attachment-id', voice.attachmentId);
  221 | 
  222 |     await expectFeedMatchesServer(
  223 |       primaryPage,
  224 |       await serverFeed(primaryPage.request, conversationId),
  225 |       [ownMessage, starTarget, files.messageId, voice.messageId],
  226 |       primaryId,
  227 |     );
  228 | 
  229 |     await otherSession.close();
  230 |   });
  231 | 
  232 |   test('Realtime-only drop: the open reader list and the open starred view show the server state after reconnect', async ({
  233 |     primaryPage,
  234 |     secondaryPage,
  235 |     messagingData,
  236 |   }) => {
  237 |     test.setTimeout(150_000);
  238 |     const conversationId = messagingData.groupConversationId ?? '';
  239 |     const tertiaryId = messagingData.tertiary?.userId ?? '';
  240 |     expect(conversationId, 'group conversation seeded').toBeTruthy();
  241 |     expect(tertiaryId, 'third member seeded').toBeTruthy();
  242 | 
  243 |     const realtime = await controlRealtimeConnection(primaryPage);
  244 |     await openConversation(primaryPage, realtime, conversationId);
  245 |     await openDrawerOnly(secondaryPage);
  246 | 
  247 |     const first = await sendMessage(primaryPage, `t20-readers-${Date.now()}`);
  248 |     const second = await sendMessage(primaryPage, `t20-starred-${Date.now()}`);
  249 | 
  250 |     // --- Cycle 1: the reader list of A's message is open across the drop.
  251 |     expect(
  252 |       await markReadAsSeededMember(primaryPage.request, { conversationId, userId: tertiaryId, messageIds: [first] }),
  253 |     ).toBe(1);
  254 |     const trigger = readBy(primaryPage, first);
  255 |     await expect(trigger).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
  256 |     await trigger.click();
  257 |     const list = readersList(primaryPage, first);
  258 |     await expect(readerItems(list)).toHaveCount(1);
  259 |     await expect(list.getByTestId(`reader-item-${tertiaryId}`)).toBeVisible();
  260 | 
  261 |     await realtime.drop();
  262 |     expect(await primaryPage.evaluate(() => navigator.onLine)).toBe(true);
  263 | 
  264 |     // B opens the group and reads both messages while A is disconnected.
  265 |     await selectConversation(secondaryPage, { id: conversationId });
  266 |     await expect(feedMessage(secondaryPage, second)).toBeInViewport({ timeout: RECV_TIMEOUT_MS });
> 267 |     await expect.poll(() => serverReadCount(primaryPage.request, first), { timeout: RECV_TIMEOUT_MS }).toBe(2);
      |                                                                                                        ^ Error: expect(received).toBe(expected) // Object.is equality
  268 |     await expect.poll(() => serverReadCount(primaryPage.request, second), { timeout: RECV_TIMEOUT_MS }).toBe(1);
  269 |     await expect(readerItems(list)).toHaveCount(1);
  270 | 
  271 |     await reconnect(primaryPage, realtime);
  272 | 
  273 |     await expect(trigger).toHaveText('Lida por 2', { timeout: RECV_TIMEOUT_MS });
  274 |     await expect(readBy(primaryPage, second)).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
  275 |     await expect(list).toBeVisible();
  276 |     await expect(readerItems(list)).toHaveCount(2, { timeout: RECV_TIMEOUT_MS });
  277 |     await expect(list.getByTestId(`reader-item-${messagingData.secondary.userId}`)).toBeVisible();
  278 |     await expect(list).toContainText('Lida por 2');
  279 |     await primaryPage.keyboard.press('Escape');
  280 |     await expect(list).toBeHidden();
  281 | 
  282 |     // --- Cycle 2: the starred view is open across the drop.
  283 |     const starSecond = await primaryPage.request.post(`/api/messages/${second}/star`);
  284 |     expect(starSecond.status()).toBe(201);
  285 |     await primaryPage.getByTestId('starred-filter-toggle').click();
  286 |     await expect(primaryPage.getByTestId('starred-messages-view')).toBeVisible();
  287 |     await expect(starredResults(primaryPage)).toHaveCount(1, { timeout: RECV_TIMEOUT_MS });
  288 |     await expect(primaryPage.getByTestId(`starred-result-${second}`)).toBeVisible();
  289 | 
  290 |     await realtime.drop();
  291 | 
  292 |     // As A, from outside this page (an API call): star the first message, unstar the second.
  293 |     const starFirst = await primaryPage.request.post(`/api/messages/${first}/star`);
  294 |     expect(starFirst.status()).toBe(201);
  295 |     const unstarSecond = await primaryPage.request.delete(`/api/messages/${second}/star`);
  296 |     expect(unstarSecond.status()).toBe(200);
  297 |     await expect(primaryPage.getByTestId(`starred-result-${second}`)).toBeVisible();
  298 | 
  299 |     await reconnect(primaryPage, realtime);
  300 | 
  301 |     await expect(primaryPage.getByTestId(`starred-result-${first}`)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
  302 |     await expect(primaryPage.getByTestId(`starred-result-${second}`)).toHaveCount(0);
  303 |     const starredOnServer = await primaryPage.request.get(`/api/messages/starred?conversationId=${conversationId}`);
  304 |     expect(starredOnServer.ok()).toBe(true);
  305 |     const serverStarredIds = ((await starredOnServer.json()) as { messages: Array<{ id: string }> }).messages.map(
  306 |       (message) => message.id,
  307 |     );
  308 |     expect(serverStarredIds).toEqual([first]);
  309 |     await expect(starredResults(primaryPage)).toHaveCount(serverStarredIds.length);
  310 | 
  311 |     // Back in the feed, the per-message stars match too.
  312 |     await primaryPage.getByTestId('starred-filter-toggle').click();
  313 |     await expect(primaryPage.getByTestId('messages-feed')).toBeVisible();
  314 |     await expectFeedMatchesServer(
  315 |       primaryPage,
  316 |       await serverFeed(primaryPage.request, conversationId),
  317 |       [first, second],
  318 |       messagingData.primary.userId,
  319 |     );
  320 |   });
  321 | });
  322 | 
```