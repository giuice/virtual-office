-- Baseline core schema, reconstructed from live schema-only dump (2026-07-10).
-- Source: `supabase db dump --schema public,private` (project vhabpcoyypobgasacsko). ZERO data rows.
-- Ordered BEFORE the 8 canonical supabase/migrations; objects those migrations recreate
-- non-idempotently (14 RLS policies, get_unread_counts, mark_conversation_read,
-- private.rate_limit_counters) are omitted here so baseline + migrations reproduce live cleanly.
-- Mapping: docs/presence-remediation/phase-0-baseline-mapping-2026-07-10.md



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."announcement_priority" AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE "public"."announcement_priority" OWNER TO "postgres";


CREATE TYPE "public"."conversation_type" AS ENUM (
    'direct',
    'group',
    'room'
);


ALTER TYPE "public"."conversation_type" OWNER TO "postgres";


CREATE TYPE "public"."conversation_visibility_type" AS ENUM (
    'public',
    'private',
    'direct'
);


ALTER TYPE "public"."conversation_visibility_type" OWNER TO "postgres";


CREATE TYPE "public"."invitation_status" AS ENUM (
    'pending',
    'accepted',
    'expired'
);


ALTER TYPE "public"."invitation_status" OWNER TO "postgres";


CREATE TYPE "public"."member_role_type" AS ENUM (
    'member',
    'admin',
    'director'
);


ALTER TYPE "public"."member_role_type" OWNER TO "postgres";


CREATE TYPE "public"."message_status" AS ENUM (
    'sending',
    'sent',
    'delivered',
    'read',
    'failed'
);


ALTER TYPE "public"."message_status" OWNER TO "postgres";


CREATE TYPE "public"."message_type" AS ENUM (
    'text',
    'image',
    'file',
    'system',
    'announcement'
);


ALTER TYPE "public"."message_type" OWNER TO "postgres";


CREATE TYPE "public"."note_generator" AS ENUM (
    'ai',
    'user'
);


ALTER TYPE "public"."note_generator" OWNER TO "postgres";


CREATE TYPE "public"."session_type_enum" AS ENUM (
    'meeting',
    'workspace',
    'conference'
);


ALTER TYPE "public"."session_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."space_status" AS ENUM (
    'active',
    'available',
    'maintenance',
    'locked',
    'reserved',
    'in_use'
);


ALTER TYPE "public"."space_status" OWNER TO "postgres";


CREATE TYPE "public"."space_type" AS ENUM (
    'workspace',
    'conference',
    'social',
    'breakout',
    'private_office',
    'open_space',
    'lounge',
    'lab'
);


ALTER TYPE "public"."space_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'member'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."user_status" AS ENUM (
    'online',
    'away',
    'busy',
    'offline'
);


ALTER TYPE "public"."user_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_app_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select u.id
  from public.users as u
  where u.supabase_uid = ((select auth.uid())::text)
  limit 1
$$;


ALTER FUNCTION "private"."current_app_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_company_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select u.company_id
  from public.users as u
  where u.supabase_uid = ((select auth.uid())::text)
  limit 1
$$;


ALTER FUNCTION "private"."current_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select u.role
  from public.users as u
  where u.supabase_uid = ((select auth.uid())::text)
  limit 1
$$;


ALTER FUNCTION "private"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_company_admin"("company_id_param" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.users as u
    where u.supabase_uid = ((select auth.uid())::text)
      and u.company_id = company_id_param
      and u.role = 'admin'
  )
$$;


ALTER FUNCTION "private"."is_company_admin"("company_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_company_member"("company_id_param" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.users as u
    where u.supabase_uid = ((select auth.uid())::text)
      and u.company_id = company_id_param
  )
$$;


ALTER FUNCTION "private"."is_company_member"("company_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_conversation_member"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = private.current_app_user_id()
  )
$$;


ALTER FUNCTION "private"."is_conversation_member"("p_conversation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."is_conversation_member"("p_conversation_id" "uuid") IS 'True when the current authenticated app user is a member of the conversation (conversation_members).';



CREATE OR REPLACE FUNCTION "private"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.platform_admins as pa
    where pa.user_id = (select auth.uid())
  )
$$;


ALTER FUNCTION "private"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_counters as c (user_id, action, window_start, count)
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = c.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of this user's expired windows (PK-indexed, cheap).
  delete from private.rate_limit_counters
  where user_id = p_user_id
    and action = p_action
    and window_start < v_window_start;

  return v_count <= p_limit;
end;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Insert into public.users, letting 'id' default, and setting 'supabase_uid'
  INSERT INTO public.users (supabase_uid, email, display_name, role, status, preferences, avatar_url)
VALUES ( NEW.id,
         NEW.email,
         COALESCE(NEW.raw_user_meta_data->>'displayName', NEW.email),
         'member',
         'online',
         '{"theme":"light","notifications":true}',
         NEW.raw_user_meta_data->>'avatar_url')
ON CONFLICT (supabase_uid) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_unread_counts"("conv_id" "uuid", "user_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id_to_increment UUID;
  current_count int;
BEGIN
  FOREACH user_id_to_increment IN ARRAY user_ids
  LOOP
    -- Get the current count for the user, default to 0 if null or key doesn't exist
    SELECT COALESCE((unread_count->>user_id_to_increment::text)::int, 0)
    INTO current_count
    FROM public.conversations
    WHERE id = conv_id;

    -- Update the count for the user
    UPDATE public.conversations
    SET unread_count = jsonb_set(
        COALESCE(unread_count, '{}'::jsonb),
        ARRAY[user_id_to_increment::text],
        to_jsonb(current_count + 1) -- Increment and convert back to jsonb
      )
    WHERE id = conv_id;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."increment_unread_counts"("conv_id" "uuid", "user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user"("input_uid" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT input_uid = auth.uid()::text;
$$;


ALTER FUNCTION "public"."is_current_user"("input_uid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.platform_admins 
        WHERE user_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_platform_admin"() IS 'Returns true if the current authenticated user is a platform admin';


CREATE OR REPLACE FUNCTION "public"."remove_user_from_all_spaces"("user_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- No longer need to update the spaces table user_ids column
  -- RAISE NOTICE 'User % removed from spaces (logic deprecated)', user_id_param; -- Optional logging
END;
$$;


ALTER FUNCTION "public"."remove_user_from_all_spaces"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_participants_fingerprint"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- clear search_path for security
  PERFORM set_config('search_path', '', false);

  -- If UPDATE and participants didn't change, do nothing
  IF TG_OP = 'UPDATE' THEN
    IF OLD.participants IS NOT DISTINCT FROM NEW.participants THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.participants IS NULL THEN
    NEW.participants_fingerprint := NULL;
  ELSE
    SELECT md5(array_to_string(a, ':')) INTO STRICT NEW.participants_fingerprint
    FROM (
      SELECT array_agg(p_text ORDER BY p_text) AS a
      FROM (
        SELECT participant::text AS p_text
        FROM unnest(NEW.participants) AS participant
      ) t
    ) s;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_participants_fingerprint"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_conversation_members"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  select new.id, p.user_id, now()
  from unnest(coalesce(new.participants, '{}'::uuid[])) as p(user_id)
  join public.users u on u.id = p.user_id
  on conflict (conversation_id, user_id) do nothing;
  return new;
end $$;


ALTER FUNCTION "public"."sync_conversation_members"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_conversation_members"() IS 'Keeps conversation_members in sync with conversations.participants on insert and participant changes.';



CREATE OR REPLACE FUNCTION "public"."update_neighborhoods_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_neighborhoods_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_space_agendas_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_space_agendas_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "posted_by" "uuid",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expiration" timestamp with time zone,
    "priority" "public"."announcement_priority" DEFAULT 'medium'::"public"."announcement_priority",
    CONSTRAINT "check_content_not_empty_announcements" CHECK (("content" <> ''::"text")),
    CONSTRAINT "check_title_not_empty_announcements" CHECK (("title" <> ''::"text"))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "admin_ids" "uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settings" "jsonb"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "pinned_order" integer,
    "is_starred" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "notifications_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_at" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pinned_order_positive" CHECK ((("pinned_order" IS NULL) OR ("pinned_order" >= 0)))
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_members" IS 'Conversation membership with per-user read cursor (last_read_at) and per-user settings (pin/star/archive/notifications). One row per (conversation, participant).';



COMMENT ON COLUMN "public"."conversation_members"."pinned_order" IS 'User-defined order for pinned conversations (NULL = unpinned, 0-N for order)';



COMMENT ON COLUMN "public"."conversation_members"."is_archived" IS 'Per-user archive status (replaces global conversations.is_archived)';



COMMENT ON COLUMN "public"."conversation_members"."last_read_at" IS 'Per-user read cursor. Unread = messages with timestamp > last_read_at and a different sender.';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "public"."conversation_type" NOT NULL,
    "participants" "uuid"[],
    "last_activity" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "is_archived" boolean DEFAULT false NOT NULL,
    "room_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visibility" "public"."conversation_visibility_type" DEFAULT 'public'::"public"."conversation_visibility_type" NOT NULL,
    "participants_fingerprint" "text"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversations" IS 'Conversations table with RLS policies for multi-tenant messaging';



COMMENT ON COLUMN "public"."conversations"."is_archived" IS 'DEPRECATED: Use conversation_preferences.is_archived for per-user archive control. This global flag is kept for backward compatibility during migration.';



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "token" "text" NOT NULL,
    "email" "text" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "public"."invitation_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knock_requests" (
    "id" "text" NOT NULL,
    "space_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "requester_name" "text" NOT NULL,
    "requester_avatar_url" "text",
    "responder_id" "uuid",
    "responder_name" "text",
    "decision" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knock_requests_decision_check" CHECK (("decision" = ANY (ARRAY['APPROVE'::"text", 'DENY'::"text"]))),
    CONSTRAINT "knock_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."knock_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_note_action_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "assignee_id" "uuid",
    "due_date" timestamp with time zone,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_description_not_empty" CHECK (("description" <> ''::"text"))
);


ALTER TABLE "public"."meeting_note_action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_notes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "meeting_date" timestamp with time zone NOT NULL,
    "transcript" "text",
    "summary" "text" NOT NULL,
    "generated_by" "public"."note_generator" NOT NULL,
    "edited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_summary_not_empty" CHECK (("summary" <> ''::"text"))
);


ALTER TABLE "public"."meeting_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_attachments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "size" integer NOT NULL,
    "url" "text" NOT NULL,
    "thumbnail_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration" integer,
    "waveform_data" "jsonb",
    "transcription" "text",
    CONSTRAINT "check_duration_positive" CHECK ((("duration" IS NULL) OR ("duration" > 0)))
);


ALTER TABLE "public"."message_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_attachments" IS 'Message attachments table with RLS policies';



COMMENT ON COLUMN "public"."message_attachments"."duration" IS 'Duration in seconds for voice/audio attachments';



COMMENT ON COLUMN "public"."message_attachments"."waveform_data" IS 'Waveform amplitude data (array of numbers) for voice note visualization';



COMMENT ON COLUMN "public"."message_attachments"."transcription" IS 'Optional AI-generated transcription of voice note content';



CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."message_reactions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_reactions" IS 'Message reactions table with RLS policies and realtime publication enabled';



CREATE TABLE IF NOT EXISTS "public"."message_read_receipts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid"
);


ALTER TABLE "public"."message_read_receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_read_receipts" IS 'Tracks read receipts for messages (who read what and when)';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "content" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "public"."message_type" NOT NULL,
    "status" "public"."message_status" NOT NULL,
    "reply_to_id" "uuid",
    "is_edited" boolean DEFAULT false NOT NULL,
    CONSTRAINT "check_content_not_empty" CHECK (("content" <> ''::"text"))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."messages" IS 'Messages table with RLS policies and realtime publication enabled';



CREATE TABLE IF NOT EXISTS "public"."neighborhoods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '--vo-neighborhood-1'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."neighborhoods" OWNER TO "postgres";


COMMENT ON TABLE "public"."neighborhoods" IS 'Neighborhoods group spaces into logical sections (e.g., Engineering, Marketing) - Story 3.9';



COMMENT ON COLUMN "public"."neighborhoods"."color" IS 'CSS variable name like --vo-neighborhood-1';



CREATE TABLE IF NOT EXISTS "public"."pinned_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "pinned_by" "uuid" NOT NULL,
    "pinned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid" NOT NULL
);


ALTER TABLE "public"."pinned_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."pinned_messages" IS 'User-specific pinned messages within conversations for quick reference';



CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."platform_admins" IS 'Platform administrators who can create companies and manage tenants. Story: story-platform-admin';



CREATE TABLE IF NOT EXISTS "public"."space_agendas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "current_phase" integer DEFAULT 1 NOT NULL,
    "total_phases" integer DEFAULT 1 NOT NULL,
    "phase_name" character varying(255) DEFAULT 'Current Phase'::character varying NOT NULL,
    "phase_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    CONSTRAINT "valid_phases" CHECK ((("current_phase" >= 1) AND ("current_phase" <= "total_phases"))),
    CONSTRAINT "valid_total_phases" CHECK (("total_phases" >= 1))
);


ALTER TABLE "public"."space_agendas" OWNER TO "postgres";


COMMENT ON TABLE "public"."space_agendas" IS 'Stores meeting agendas and current phase for spaces (Story 3.11)';



CREATE TABLE IF NOT EXISTS "public"."space_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."member_role_type" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."space_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."space_presence_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entered_at" timestamp with time zone NOT NULL,
    "exited_at" timestamp with time zone,
    "session_type" "public"."session_type_enum",
    "context" "text",
    "authorized_by" "uuid",
    CONSTRAINT "check_exit_after_entry" CHECK ((("exited_at" IS NULL) OR ("exited_at" > "entered_at")))
);


ALTER TABLE "public"."space_presence_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."space_reservations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "purpose" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."space_reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spaces" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."space_type" NOT NULL,
    "status" "public"."space_status" NOT NULL,
    "capacity" integer DEFAULT 0 NOT NULL,
    "features" "text"[],
    "position" "jsonb",
    "description" "text",
    "access_control" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_template" boolean DEFAULT false NOT NULL,
    "template_name" "text",
    "neighborhood_id" "uuid"
);


ALTER TABLE "public"."spaces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."spaces"."neighborhood_id" IS 'Optional link to a neighborhood for grouping in floor plan UI';



CREATE TABLE IF NOT EXISTS "public"."starred_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "starred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid" NOT NULL
);


ALTER TABLE "public"."starred_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."starred_messages" IS 'User-specific starred messages across all conversations for bookmarking';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "supabase_uid" "text",
    "company_id" "uuid",
    "email" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "status" "public"."user_status" DEFAULT 'offline'::"public"."user_status" NOT NULL,
    "status_message" "text",
    "preferences" "jsonb",
    "role" "public"."user_role" DEFAULT 'member'::"public"."user_role" NOT NULL,
    "last_active" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_space_id" "uuid"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."supabase_uid" IS 'Stores the Supabase Authentication User ID.';



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_preferences_unique_user_conversation" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_unique" UNIQUE ("token");



ALTER TABLE ONLY "public"."knock_requests"
    ADD CONSTRAINT "knock_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_note_action_items"
    ADD CONSTRAINT "meeting_note_action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_notes"
    ADD CONSTRAINT "meeting_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "message_pins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "message_pins_unique_user_message" UNIQUE ("message_id", "pinned_by");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_unique_user_message" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "message_stars_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "message_stars_unique_user_message" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."neighborhoods"
    ADD CONSTRAINT "neighborhoods_company_id_name_key" UNIQUE ("company_id", "name");



ALTER TABLE ONLY "public"."neighborhoods"
    ADD CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."space_agendas"
    ADD CONSTRAINT "space_agendas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_space_id_user_id_key" UNIQUE ("space_id", "user_id");



ALTER TABLE ONLY "public"."space_presence_log"
    ADD CONSTRAINT "space_presence_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."space_reservations"
    ADD CONSTRAINT "space_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_firebase_uid_key" UNIQUE ("supabase_uid");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_announcements_company_id" ON "public"."announcements" USING "btree" ("company_id");



CREATE INDEX "idx_conversation_preferences_archived" ON "public"."conversation_members" USING "btree" ("user_id", "is_archived") WHERE ("is_archived" = true);



CREATE INDEX "idx_conversation_preferences_conversation_id" ON "public"."conversation_members" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_preferences_pinned" ON "public"."conversation_members" USING "btree" ("user_id", "is_pinned", "pinned_order") WHERE ("is_pinned" = true);



CREATE INDEX "idx_conversation_preferences_user_id" ON "public"."conversation_members" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_participants" ON "public"."conversations" USING "gin" ("participants");



CREATE INDEX "idx_conversations_room_id" ON "public"."conversations" USING "btree" ("room_id");



CREATE INDEX "idx_invitations_company_id" ON "public"."invitations" USING "btree" ("company_id");



CREATE INDEX "idx_invitations_company_status_expires_at" ON "public"."invitations" USING "btree" ("company_id", "status", "expires_at");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_pending_company_email_created_at" ON "public"."invitations" USING "btree" ("company_id", "email", "created_at" DESC) WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE INDEX "idx_invitations_pending_company_expires_at" ON "public"."invitations" USING "btree" ("company_id", "expires_at") WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE INDEX "idx_invitations_pending_email_expires_created_at" ON "public"."invitations" USING "btree" ("email", "expires_at", "created_at" DESC) WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE INDEX "idx_knock_requests_requester_id" ON "public"."knock_requests" USING "btree" ("requester_id");



CREATE INDEX "idx_knock_requests_space_id" ON "public"."knock_requests" USING "btree" ("space_id");



CREATE INDEX "idx_knock_requests_status" ON "public"."knock_requests" USING "btree" ("status");



CREATE INDEX "idx_meeting_note_action_items_assignee_id" ON "public"."meeting_note_action_items" USING "btree" ("assignee_id");



CREATE INDEX "idx_meeting_note_action_items_note_id" ON "public"."meeting_note_action_items" USING "btree" ("note_id");



CREATE INDEX "idx_meeting_notes_room_id" ON "public"."meeting_notes" USING "btree" ("room_id");



CREATE INDEX "idx_message_attachments_message_id" ON "public"."message_attachments" USING "btree" ("message_id");



CREATE INDEX "idx_message_attachments_voice_notes" ON "public"."message_attachments" USING "btree" ("message_id", "type") WHERE ("duration" IS NOT NULL);



CREATE INDEX "idx_message_pins_message_id" ON "public"."pinned_messages" USING "btree" ("message_id");



CREATE INDEX "idx_message_pins_user_id_pinned_at" ON "public"."pinned_messages" USING "btree" ("pinned_by", "pinned_at" DESC);



CREATE INDEX "idx_message_reactions_message_id" ON "public"."message_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_message_reactions_user_id" ON "public"."message_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_message_read_receipts_message_id" ON "public"."message_read_receipts" USING "btree" ("message_id");



CREATE INDEX "idx_message_read_receipts_user_id" ON "public"."message_read_receipts" USING "btree" ("user_id");



CREATE INDEX "idx_message_stars_message_id" ON "public"."starred_messages" USING "btree" ("message_id");



CREATE INDEX "idx_message_stars_user_id_starred_at" ON "public"."starred_messages" USING "btree" ("user_id", "starred_at" DESC);



CREATE INDEX "idx_messages_conversation_id_timestamp" ON "public"."messages" USING "btree" ("conversation_id", "timestamp" DESC);



CREATE INDEX "idx_messages_conversation_timestamp" ON "public"."messages" USING "btree" ("conversation_id", "timestamp" DESC);



CREATE INDEX "idx_messages_reply_to_id" ON "public"."messages" USING "btree" ("reply_to_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_neighborhoods_company_id" ON "public"."neighborhoods" USING "btree" ("company_id");



CREATE INDEX "idx_platform_admins_user_id" ON "public"."platform_admins" USING "btree" ("user_id");



CREATE INDEX "idx_read_receipts_conversation" ON "public"."message_read_receipts" USING "btree" ("conversation_id", "user_id");



CREATE UNIQUE INDEX "idx_space_agendas_active" ON "public"."space_agendas" USING "btree" ("space_id") WHERE ("started_at" IS NOT NULL);



CREATE INDEX "idx_space_agendas_company_id" ON "public"."space_agendas" USING "btree" ("company_id");



CREATE INDEX "idx_space_agendas_space_id" ON "public"."space_agendas" USING "btree" ("space_id");



CREATE INDEX "idx_space_members_space_id" ON "public"."space_members" USING "btree" ("space_id");



CREATE INDEX "idx_space_members_user_id" ON "public"."space_members" USING "btree" ("user_id");



CREATE INDEX "idx_space_presence_log_space_id" ON "public"."space_presence_log" USING "btree" ("space_id");



CREATE INDEX "idx_space_presence_log_time" ON "public"."space_presence_log" USING "btree" ("entered_at", "exited_at");



CREATE INDEX "idx_space_presence_log_user_id" ON "public"."space_presence_log" USING "btree" ("user_id");



CREATE INDEX "idx_space_reservations_space_id" ON "public"."space_reservations" USING "btree" ("space_id");



CREATE INDEX "idx_space_reservations_times" ON "public"."space_reservations" USING "btree" ("start_time", "end_time");



CREATE INDEX "idx_space_reservations_user_id" ON "public"."space_reservations" USING "btree" ("user_id");



CREATE INDEX "idx_spaces_company_id" ON "public"."spaces" USING "btree" ("company_id");



CREATE INDEX "idx_spaces_neighborhood_id" ON "public"."spaces" USING "btree" ("neighborhood_id");



CREATE INDEX "idx_users_company_id" ON "public"."users" USING "btree" ("company_id");



CREATE INDEX "idx_users_current_space_id" ON "public"."users" USING "btree" ("current_space_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_supabase_uid" ON "public"."users" USING "btree" ("supabase_uid");



CREATE INDEX "invitations_token_idx" ON "public"."invitations" USING "btree" ("token");



CREATE UNIQUE INDEX "uniq_direct_participants_fingerprint" ON "public"."conversations" USING "btree" ("participants_fingerprint") WHERE ("type" = 'direct'::"public"."conversation_type");



CREATE UNIQUE INDEX "uniq_room_conversation" ON "public"."conversations" USING "btree" ("room_id") WHERE (("type" = 'room'::"public"."conversation_type") AND ("room_id" IS NOT NULL));



CREATE UNIQUE INDEX "ux_invitations_pending_company_email" ON "public"."invitations" USING "btree" ("company_id", "email") WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE OR REPLACE TRIGGER "conversations_set_participants_fingerprint" BEFORE INSERT OR UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_participants_fingerprint"();



CREATE OR REPLACE TRIGGER "set_neighborhoods_updated_at" BEFORE UPDATE ON "public"."neighborhoods" FOR EACH ROW EXECUTE FUNCTION "public"."update_neighborhoods_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_space_agendas_updated_at" BEFORE UPDATE ON "public"."space_agendas" FOR EACH ROW EXECUTE FUNCTION "public"."update_space_agendas_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_sync_conversation_members" AFTER INSERT OR UPDATE OF "participants" ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_conversation_members"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_preferences_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."spaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_requests"
    ADD CONSTRAINT "knock_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_requests"
    ADD CONSTRAINT "knock_requests_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."knock_requests"
    ADD CONSTRAINT "knock_requests_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_note_action_items"
    ADD CONSTRAINT "meeting_note_action_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_note_action_items"
    ADD CONSTRAINT "meeting_note_action_items_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_notes"
    ADD CONSTRAINT "meeting_notes_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_notes"
    ADD CONSTRAINT "meeting_notes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "message_pins_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "message_pins_user_id_fkey" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "message_stars_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "message_stars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."neighborhoods"
    ADD CONSTRAINT "neighborhoods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_agendas"
    ADD CONSTRAINT "space_agendas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_agendas"
    ADD CONSTRAINT "space_agendas_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_members"
    ADD CONSTRAINT "space_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_presence_log"
    ADD CONSTRAINT "space_presence_log_authorized_by_fkey" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."space_presence_log"
    ADD CONSTRAINT "space_presence_log_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_presence_log"
    ADD CONSTRAINT "space_presence_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_reservations"
    ADD CONSTRAINT "space_reservations_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."space_reservations"
    ADD CONSTRAINT "space_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."starred_messages"
    ADD CONSTRAINT "starred_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_current_space_id_fkey" FOREIGN KEY ("current_space_id") REFERENCES "public"."spaces"("id") ON DELETE SET NULL;


CREATE POLICY "Admins can manage agendas" ON "public"."space_agendas" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."company_id" = "space_agendas"."company_id") AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Company admins can create neighborhoods" ON "public"."neighborhoods" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Company admins can delete neighborhoods" ON "public"."neighborhoods" FOR DELETE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Company admins can update neighborhoods" ON "public"."neighborhoods" FOR UPDATE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Company members can read neighborhoods" ON "public"."neighborhoods" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))));



CREATE POLICY "Participants can pin messages" ON "public"."pinned_messages" FOR INSERT WITH CHECK ((("pinned_by" = ( SELECT "private"."current_app_user_id"() AS "current_app_user_id")) AND "private"."is_conversation_member"("conversation_id")));



CREATE POLICY "Participants can unpin messages" ON "public"."pinned_messages" FOR DELETE USING ("private"."is_conversation_member"("conversation_id"));



CREATE POLICY "Participants can view pinned messages" ON "public"."pinned_messages" FOR SELECT USING ("private"."is_conversation_member"("conversation_id"));



CREATE POLICY "Platform admins can read own entry" ON "public"."platform_admins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own conversation preferences" ON "public"."conversation_members" FOR DELETE USING ((("auth"."uid"())::"text" = ( SELECT "users"."supabase_uid"
   FROM "public"."users"
  WHERE ("users"."id" = "conversation_members"."user_id"))));



CREATE POLICY "Users can insert their own conversation preferences" ON "public"."conversation_members" FOR INSERT WITH CHECK ((("auth"."uid"())::"text" = ( SELECT "users"."supabase_uid"
   FROM "public"."users"
  WHERE ("users"."id" = "conversation_members"."user_id"))));



CREATE POLICY "Users can insert their own read receipts" ON "public"."message_read_receipts" FOR INSERT WITH CHECK ((("auth"."uid"())::"text" = ( SELECT "users"."supabase_uid"
   FROM "public"."users"
  WHERE ("users"."id" = "message_read_receipts"."user_id"))));



CREATE POLICY "Users can star messages" ON "public"."starred_messages" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "private"."current_app_user_id"() AS "current_app_user_id")) AND "private"."is_conversation_member"("conversation_id")));



CREATE POLICY "Users can unstar messages" ON "public"."starred_messages" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text")))));



CREATE POLICY "Users can update their own conversation preferences" ON "public"."conversation_members" FOR UPDATE USING ((("auth"."uid"())::"text" = ( SELECT "users"."supabase_uid"
   FROM "public"."users"
  WHERE ("users"."id" = "conversation_members"."user_id"))));



CREATE POLICY "Users can view agendas in their company" ON "public"."space_agendas" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can view private conversations they're part of" ON "public"."conversations" FOR SELECT USING (((("visibility" = 'private'::"public"."conversation_visibility_type") OR ("visibility" = 'direct'::"public"."conversation_visibility_type")) AND ("auth"."uid"() = ANY ("participants"))));



CREATE POLICY "Users can view public conversations in their spaces" ON "public"."conversations" FOR SELECT USING ((("visibility" = 'public'::"public"."conversation_visibility_type") AND (EXISTS ( SELECT 1
   FROM "public"."space_members" "sm"
  WHERE (("sm"."space_id" = "conversations"."room_id") AND ("sm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own conversation preferences" ON "public"."conversation_members" FOR SELECT USING ((("auth"."uid"())::"text" = ( SELECT "users"."supabase_uid"
   FROM "public"."users"
  WHERE ("users"."id" = "conversation_members"."user_id"))));



CREATE POLICY "Users can view their own read receipts" ON "public"."message_read_receipts" FOR SELECT USING (((("auth"."uid"())::"text" = ( SELECT "users"."supabase_uid"
   FROM "public"."users"
  WHERE ("users"."id" = "message_read_receipts"."user_id"))) OR (("auth"."uid"())::"text" = ( SELECT "u"."supabase_uid"
   FROM ("public"."messages" "m"
     JOIN "public"."users" "u" ON (("m"."sender_id" = "u"."id")))
  WHERE ("m"."id" = "message_read_receipts"."message_id")))));



CREATE POLICY "Users can view their own starred messages" ON "public"."starred_messages" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text")))));



CREATE POLICY "add_attachments_to_own_messages" ON "public"."message_attachments" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_attachments"."message_id") AND ("m"."sender_id" = ( SELECT "users"."id"
           FROM "public"."users"
          WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))))))));



CREATE POLICY "add_own_reactions" ON "public"."message_reactions" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "private"."current_app_user_id"() AS "current_app_user_id")) AND (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND "private"."is_conversation_member"("m"."conversation_id"))))));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "create_conversations_as_participant" ON "public"."conversations" FOR INSERT WITH CHECK ((( SELECT "private"."current_app_user_id"() AS "current_app_user_id") = ANY ("participants")));



CREATE POLICY "delete_own_message_attachments" ON "public"."message_attachments" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_attachments"."message_id") AND ("m"."sender_id" = ( SELECT "users"."id"
           FROM "public"."users"
          WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))))))));



CREATE POLICY "delete_own_messages" ON "public"."messages" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("sender_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text")))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knock_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knock_requests_delete" ON "public"."knock_requests" FOR DELETE USING ((("requester_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))) OR ("space_id" IN ( SELECT "users"."current_space_id"
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."current_space_id" IS NOT NULL))))));



CREATE POLICY "knock_requests_insert" ON "public"."knock_requests" FOR INSERT WITH CHECK (("requester_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))));



CREATE POLICY "knock_requests_select" ON "public"."knock_requests" FOR SELECT USING ((("requester_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text"))) OR ("space_id" IN ( SELECT "users"."current_space_id"
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."current_space_id" IS NOT NULL))))));



CREATE POLICY "knock_requests_update" ON "public"."knock_requests" FOR UPDATE USING (("space_id" IN ( SELECT "users"."current_space_id"
   FROM "public"."users"
  WHERE (("users"."supabase_uid" = ("auth"."uid"())::"text") AND ("users"."current_space_id" IS NOT NULL)))));



ALTER TABLE "public"."meeting_note_action_items" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."meeting_notes" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_read_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."neighborhoods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pinned_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_attachments_in_own_conversations" ON "public"."message_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_attachments"."message_id") AND "private"."is_conversation_member"("m"."conversation_id")))));



CREATE POLICY "read_messages_in_own_conversations" ON "public"."messages" FOR SELECT USING ("private"."is_conversation_member"("conversation_id"));



CREATE POLICY "read_own_conversations" ON "public"."conversations" FOR SELECT USING ("private"."is_conversation_member"("id"));



CREATE POLICY "read_reactions_in_own_conversations" ON "public"."message_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND "private"."is_conversation_member"("m"."conversation_id")))));



CREATE POLICY "read_receipts_in_own_conversations" ON "public"."message_read_receipts" FOR SELECT USING ("private"."is_conversation_member"("conversation_id"));



CREATE POLICY "remove_own_reactions" ON "public"."message_reactions" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("user_id" = ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_uid" = ("auth"."uid"())::"text")))));



CREATE POLICY "send_message_as_self" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = ( SELECT "private"."current_app_user_id"() AS "current_app_user_id")) AND "private"."is_conversation_member"("conversation_id")));



ALTER TABLE "public"."space_agendas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."space_members" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."space_presence_log" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."space_reservations" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."spaces" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."starred_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_own_conversations" ON "public"."conversations" FOR UPDATE USING ("private"."is_conversation_member"("id"));



CREATE POLICY "update_own_messages" ON "public"."messages" FOR UPDATE USING (("sender_id" = ( SELECT "private"."current_app_user_id"() AS "current_app_user_id"))) WITH CHECK ((("sender_id" = ( SELECT "private"."current_app_user_id"() AS "current_app_user_id")) AND "private"."is_conversation_member"("conversation_id")));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;



GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."current_app_user_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_app_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."current_app_user_id"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."current_company_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."current_company_id"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."current_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_company_admin"("company_id_param" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_company_admin"("company_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_company_admin"("company_id_param" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_company_member"("company_id_param" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_company_member"("company_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_company_member"("company_id_param" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_conversation_member"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_conversation_member"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_conversation_member"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_platform_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_platform_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_unread_counts"("conv_id" "uuid", "user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_unread_counts"("conv_id" "uuid", "user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_unread_counts"("conv_id" "uuid", "user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_current_user"("input_uid" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user"("input_uid" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user"("input_uid" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_user_from_all_spaces"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_user_from_all_spaces"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_user_from_all_spaces"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_participants_fingerprint"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_participants_fingerprint"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_participants_fingerprint"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_conversation_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_conversation_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_conversation_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_neighborhoods_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_neighborhoods_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_neighborhoods_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_space_agendas_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_space_agendas_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_space_agendas_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "service_role";
GRANT SELECT ON TABLE "public"."announcements" TO "authenticated";



GRANT ALL ON TABLE "public"."companies" TO "service_role";
GRANT SELECT ON TABLE "public"."companies" TO "authenticated";



GRANT UPDATE("name") ON TABLE "public"."companies" TO "authenticated";



GRANT UPDATE("settings") ON TABLE "public"."companies" TO "authenticated";



GRANT ALL ON TABLE "public"."conversation_members" TO "anon";
GRANT ALL ON TABLE "public"."conversation_members" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."knock_requests" TO "anon";
GRANT ALL ON TABLE "public"."knock_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."knock_requests" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_note_action_items" TO "service_role";
GRANT SELECT ON TABLE "public"."meeting_note_action_items" TO "authenticated";



GRANT ALL ON TABLE "public"."meeting_notes" TO "service_role";
GRANT SELECT ON TABLE "public"."meeting_notes" TO "authenticated";



GRANT ALL ON TABLE "public"."message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."message_read_receipts" TO "anon";
GRANT ALL ON TABLE "public"."message_read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."message_read_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."neighborhoods" TO "anon";
GRANT ALL ON TABLE "public"."neighborhoods" TO "authenticated";
GRANT ALL ON TABLE "public"."neighborhoods" TO "service_role";



GRANT ALL ON TABLE "public"."pinned_messages" TO "anon";
GRANT ALL ON TABLE "public"."pinned_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."pinned_messages" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."space_agendas" TO "anon";
GRANT ALL ON TABLE "public"."space_agendas" TO "authenticated";
GRANT ALL ON TABLE "public"."space_agendas" TO "service_role";



GRANT ALL ON TABLE "public"."space_members" TO "service_role";
GRANT SELECT ON TABLE "public"."space_members" TO "authenticated";



GRANT ALL ON TABLE "public"."space_presence_log" TO "service_role";
GRANT SELECT ON TABLE "public"."space_presence_log" TO "authenticated";



GRANT ALL ON TABLE "public"."space_reservations" TO "service_role";
GRANT SELECT ON TABLE "public"."space_reservations" TO "authenticated";



GRANT ALL ON TABLE "public"."spaces" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."spaces" TO "authenticated";



GRANT ALL ON TABLE "public"."starred_messages" TO "anon";
GRANT ALL ON TABLE "public"."starred_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."starred_messages" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT SELECT ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("status_message") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("preferences") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("last_active") ON TABLE "public"."users" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


-- Realtime publication membership present in live but added outside tracked migrations.
-- Reproduced idempotently so local == prod for presence realtime tests.
-- (messages, conversations, message_reactions, message_read_receipts are added by
--  20260612130141_messaging_realtime_publication_and_receipts_policy.sql.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['spaces','users','knock_requests','message_attachments','conversation_members']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
