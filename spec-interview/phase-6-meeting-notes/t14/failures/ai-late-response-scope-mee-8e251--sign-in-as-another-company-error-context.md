# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ai-late-response-scope.spec.ts >> meeting notes — late AI responses across a scope change (AC-033) >> a delayed draft never appears after sign-out and sign-in as another company
- Location: __tests__\api\playwright\meeting-notes\ai-late-response-scope.spec.ts:76:3

# Error details

```
Error: Meeting-notes E2E cleanup failed: users: CLIENT_UPGRADE_REQUIRED
```

# Test source

```ts
  371 |             author_user_id, author_name, created_by, edited_by, revision)
  372 |          values ($1, $2, $3, now(), $4, null, 'user', $5, $6, $5, $5, 1)
  373 |          returning id::text`,
  374 |         [b.companyId, b.spaceId, input.title, input.content, b.userId, authorName],
  375 |       );
  376 |       const noteId = rows[0].id;
  377 |       noteIds.push(noteId);
  378 |       await db.query(
  379 |         `insert into public.meeting_note_versions
  380 |            (note_id, revision, title, meeting_date, participants, content, summary,
  381 |             editor_user_id, editor_name, edited_by)
  382 |          values ($1, 1, $2, now(), '[]'::jsonb, $3, null, $4, $5, $4)`,
  383 |         [noteId, input.title, input.content, b.userId, authorName],
  384 |       );
  385 |       return noteId;
  386 |     });
  387 | 
  388 |   const createOtherCompanyAccount: MeetingNotesE2EWorld['createOtherCompanyAccount'] = async (label) => {
  389 |     const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  390 |     const email = `mn-e2e-acct-${slug}-${runTag}@local.test`;
  391 |     const password = `mn-e2e-${randomUUID()}`;
  392 |     const displayName = `${MEETING_NOTES_E2E_PREFIX} ${label} ${runTag}`;
  393 |     const { data, error } = await localAuthAdmin().createUser({
  394 |       email,
  395 |       password,
  396 |       email_confirm: true,
  397 |       user_metadata: { full_name: displayName, name: displayName },
  398 |     });
  399 |     if (error || !data.user) throw new Error(`create local auth user: ${error?.message ?? 'no user'}`);
  400 |     authUserIds.push(data.user.id);
  401 |     const userId = await withLocalMessagingDb(async (db) => {
  402 |       await asServiceRole(db);
  403 |       const b = await ensureCompanyB(db);
  404 |       const { rows } = await db.query<{ id: string }>(
  405 |         `insert into public.users (supabase_uid, email, display_name, company_id, role)
  406 |          values ($1, $2, $3, $4, 'member'::public.user_role) returning id::text`,
  407 |         [data.user.id, email, displayName, b.companyId],
  408 |       );
  409 |       return rows[0].id;
  410 |     });
  411 |     userIds.push(userId);
  412 |     return { email, password, userId, displayName };
  413 |   };
  414 | 
  415 |   const createCompanyAccount: MeetingNotesE2EWorld['createCompanyAccount'] = async (label) => {
  416 |     const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  417 |     const email = `mn-e2e-acct-a-${slug}-${runTag}@local.test`;
  418 |     const password = `mn-e2e-${randomUUID()}`;
  419 |     const displayName = `${MEETING_NOTES_E2E_PREFIX} ${label} ${runTag}`;
  420 |     const { data, error } = await localAuthAdmin().createUser({
  421 |       email,
  422 |       password,
  423 |       email_confirm: true,
  424 |       user_metadata: { full_name: displayName, name: displayName },
  425 |     });
  426 |     if (error || !data.user) throw new Error(`create local auth user: ${error?.message ?? 'no user'}`);
  427 |     authUserIds.push(data.user.id);
  428 |     const userId = await withLocalMessagingDb(async (db) => {
  429 |       await asServiceRole(db);
  430 |       const { rows } = await db.query<{ id: string }>(
  431 |         `insert into public.users (supabase_uid, email, display_name, company_id, role)
  432 |          values ($1, $2, $3, $4, 'member'::public.user_role) returning id::text`,
  433 |         [data.user.id, email, displayName, companyAId],
  434 |       );
  435 |       return rows[0].id;
  436 |     });
  437 |     userIds.push(userId);
  438 |     return { email, password, userId, displayName };
  439 |   };
  440 | 
  441 |   const resetAiSettingsUnsafe: MeetingNotesE2EWorld['resetAiSettingsUnsafe'] = async () => {
  442 |     await withLocalMessagingDb(async (db) => {
  443 |       await db.query('delete from public.meeting_note_ai_settings where company_id = $1', [companyAId]);
  444 |     });
  445 |   };
  446 | 
  447 |   const cleanup = async () => {
  448 |     await withLocalMessagingDb(async (db) => {
  449 |       await asServiceRole(db);
  450 |       const errors: string[] = [];
  451 |       const run = async (label: string, sql: string, ids: string[]) => {
  452 |         if (ids.length === 0) return;
  453 |         try {
  454 |           await db.query(sql, [ids]);
  455 |         } catch (error) {
  456 |           errors.push(`${label}: ${(error as Error).message}`);
  457 |         }
  458 |       };
  459 |       await run('notes', 'delete from public.meeting_notes where id = any($1::uuid[])', noteIds);
  460 |       await run('notes of test spaces', 'delete from public.meeting_notes where room_id = any($1::uuid[])', spaceIds);
  461 |       // Users before spaces: a signed-in test account's presence rows (and its
  462 |       // current space) reference a test space; deleting the user cascades them.
  463 |       await run('users', 'delete from public.users where id = any($1::uuid[])', userIds);
  464 |       await run('spaces', 'delete from public.spaces where id = any($1::uuid[])', spaceIds);
  465 |       await run('companies', 'delete from public.companies where id = any($1::uuid[])', companyIds);
  466 |       for (const authUserId of authUserIds) {
  467 |         const { error } = await localAuthAdmin().deleteUser(authUserId);
  468 |         if (error) errors.push(`auth user: ${error.message}`);
  469 |       }
  470 |       if (errors.length > 0) {
> 471 |         throw new Error(`Meeting-notes E2E cleanup failed: ${errors.join('; ')}`);
      |               ^ Error: Meeting-notes E2E cleanup failed: users: CLIENT_UPGRADE_REQUIRED
  472 |       }
  473 |     });
  474 |   };
  475 | 
  476 |   return {
  477 |     runTag,
  478 |     createSpace,
  479 |     createNote,
  480 |     updateNote,
  481 |     readNote,
  482 |     readVersions,
  483 |     readVersion,
  484 |     createCompanyMember,
  485 |     removeFromCompany,
  486 |     displayNameOf,
  487 |     overwriteStoredContentUnsafe,
  488 |     addActionItem,
  489 |     setSummaryAndTranscriptUnsafe,
  490 |     deleteSpaceThroughApi,
  491 |     createOtherCompanyNote,
  492 |     createOtherCompanyAccount,
  493 |     createCompanyAccount,
  494 |     resetAiSettingsUnsafe,
  495 |     cleanup,
  496 |   };
  497 | }
  498 | 
  499 | /**
  500 |  * Removes what interrupted runs left: every note, space, member row, and
  501 |  * company whose name/title/email carries the E2E prefix. Local database only.
  502 |  */
  503 | export async function sweepMeetingNotesE2ELeftovers(): Promise<Record<string, number>> {
  504 |   return withLocalMessagingDb(async (db) => {
  505 |     await asServiceRole(db);
  506 |     const like = `${MEETING_NOTES_E2E_PREFIX} %`;
  507 |     const notes = await db.query(
  508 |       `delete from public.meeting_notes
  509 |         where title like $1
  510 |            or room_id in (select id from public.spaces where name like $1)
  511 |            or company_id in (select id from public.companies where name like $1)`,
  512 |       [like],
  513 |     );
  514 |     const users = await db.query('delete from public.users where email like $1', [E2E_EMAIL_PATTERN]);
  515 |     const spaces = await db.query('delete from public.spaces where name like $1', [like]);
  516 |     const companies = await db.query('delete from public.companies where name like $1', [like]);
  517 |     // Local Auth users of createOtherCompanyAccount (local stack only).
  518 |     const authUsers = await db.query('delete from auth.users where email like $1', [E2E_EMAIL_PATTERN]);
  519 |     return {
  520 |       notes: notes.rowCount ?? 0,
  521 |       spaces: spaces.rowCount ?? 0,
  522 |       users: users.rowCount ?? 0,
  523 |       companies: companies.rowCount ?? 0,
  524 |       authUsers: authUsers.rowCount ?? 0,
  525 |     };
  526 |   });
  527 | }
  528 | 
```