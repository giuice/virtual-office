-- Platform track follow-up of messaging audit S-03.
--
-- Probe 2026-06-12 found the 'user-uploads' bucket was public with a 1 MB
-- size limit and no MIME allowlist. The bucket stays public by design because
-- avatars render via public URLs; this migration adds a MIME allowlist as
-- defense in depth. The avatar upload route is the primary enforcement.
--
-- Re-runnable: idempotent UPDATE.

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'user-uploads';
