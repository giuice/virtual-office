-- Phase 3 / S-03 (messaging audit 2026-06-10) — attachments bucket hardening.
--
-- The 'attachments' bucket was public with no size or MIME limits: anyone
-- with a leaked URL could read any attachment forever, and any authenticated
-- user could upload unlimited arbitrary files. This migration:
--   1. Makes the bucket private and sets bucket-level size/MIME limits
--      (the upload route enforces the same limits server-side; the bucket
--      config is defense in depth).
--   2. Rewrites legacy public URLs stored in message_attachments to bare
--      storage paths. Reads now go through GET /api/messages/attachment/{id},
--      which checks conversation membership and redirects to a short-lived
--      signed URL.
--
-- The avatars bucket ('user-uploads') is intentionally untouched.
-- Re-runnable: idempotent UPDATEs.

-- Probe 2026-06-12: the bucket did not exist in the live project (the upload
-- route would always have failed at runtime) — create it private, or fix the
-- config if it exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10485760, -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Legacy rows stored the full public URL; store the storage path instead.
update public.message_attachments
set url = regexp_replace(url, '^.*/storage/v1/object/public/attachments/', '')
where url like '%/storage/v1/object/public/attachments/%';

update public.message_attachments
set thumbnail_url = regexp_replace(thumbnail_url, '^.*/storage/v1/object/public/attachments/', '')
where thumbnail_url like '%/storage/v1/object/public/attachments/%';
