// src/app/api/meeting-notes/[id]/ai/ticket/route.ts
// Processing ticket for the meeting-note AI flow (Phase 6 T9; FR-015, FR-031).
//
// POST issues the provider notice data and a signed processing ticket. It is
// called when the notice is shown. The route authorizes the session user
// first (auth.getUser → users.supabase_uid → current users row), reads the
// note under RLS (members of the note's company only), and requires editor
// rights (author while a member, current participant, or company admin —
// BR-003, the same rule the database applies) and a stored transcript. Only
// then does it read the AI settings metadata and today's usage (both through
// the user's session, own company only) and sign a ticket bound to the user,
// company, note, note revision, transcript identity, and settings revision,
// with a fresh SERVER-GENERATED idempotency key. Nothing is reserved here:
// the admission RPC re-checks membership, rights, settings revision, source,
// and the limit when processing starts. The API key is never read here.
import { NextRequest, NextResponse } from 'next/server';

import {
  issueMeetingNoteAiTicket,
  MeetingNoteAiTicketConfigError,
} from '@/lib/meeting-notes/ai/ticket';
import { computeMeetingNoteRights } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  internalError,
  meetingNoteError,
  meetingNoteErrorWithData,
  notFound,
  ok,
  parsePathId,
} from '@/lib/meeting-notes/route-support';
import { SupabaseMeetingNoteAiOperationRepository } from '@/repositories/implementations/supabase/SupabaseMeetingNoteAiOperationRepository';
import { SupabaseMeetingNoteAiSettingsRepository } from '@/repositories/implementations/supabase/SupabaseMeetingNoteAiSettingsRepository';
import type { MeetingNoteAiTicketResponse } from '@/types/meeting-notes';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PATH = '/api/meeting-notes/[id]/ai/ticket';

/**
 * POST /api/meeting-notes/[id]/ai/ticket (no body) → 200 MeetingNoteAiTicketResponse.
 * 404 MEETING_NOTE_NOT_FOUND (missing, other company, or caller removed);
 * 403 MEETING_NOTE_FORBIDDEN (member without edit rights);
 * 409 MEETING_NOTE_AI_TRANSCRIPT_REQUIRED (no stored transcript);
 * 409 MEETING_NOTE_AI_NOT_CONFIGURED { canConfigure } (no provider; admins get the settings hint);
 * 503 MEETING_NOTE_AI_UNAVAILABLE (server ticket secret missing — configuration error).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  // No body is read; release it whatever happens.
  await request.body?.cancel().catch(() => undefined);

  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:ai-ticket');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const id = parsePathId((await params).id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) return id.response;

  try {
    const note = await ctx.repository.findById(id.value);
    if (!note || !ctx.dbUser.companyId || note.companyId !== ctx.dbUser.companyId) {
      return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    }
    const participants = await ctx.repository.findParticipants(note.id);
    const rights = computeMeetingNoteRights(
      ctx.dbUser,
      note,
      participants.map((participant) => participant.userId)
    );
    if (!rights.canEdit) {
      return meetingNoteError(403, 'MEETING_NOTE_FORBIDDEN', ctx, 'meetingNotes.aiTicket.authorize');
    }
    if (!note.transcriptId) {
      return meetingNoteError(409, 'MEETING_NOTE_AI_TRANSCRIPT_REQUIRED', ctx, 'meetingNotes.aiTicket');
    }

    const settings = await new SupabaseMeetingNoteAiSettingsRepository(ctx.supabase).findByCompany(note.companyId);
    if (!settings.configured || !settings.provider || !settings.model || !settings.reasoningLevel || !settings.revision) {
      return meetingNoteErrorWithData(409, 'MEETING_NOTE_AI_NOT_CONFIGURED', ctx, {
        canConfigure: ctx.dbUser.role === 'admin',
      });
    }

    const usage = await new SupabaseMeetingNoteAiOperationRepository(ctx.supabase).getOwnCompanyUsage();

    let issued;
    try {
      issued = issueMeetingNoteAiTicket({
        userId: ctx.dbUser.id,
        companyId: note.companyId,
        noteId: note.id,
        sourceRevision: note.revision,
        transcriptId: note.transcriptId,
        settingsRevision: settings.revision,
      });
    } catch (error) {
      if (error instanceof MeetingNoteAiTicketConfigError) {
        // The event names the condition only; never the variable's value.
        console.error(
          JSON.stringify({ event: 'meeting_notes_ticket_secret_unconfigured', correlationId: ctx.correlationId })
        );
        return meetingNoteError(503, 'MEETING_NOTE_AI_UNAVAILABLE', ctx, 'meetingNotes.aiTicket.config');
      }
      throw error;
    }

    const body: MeetingNoteAiTicketResponse = {
      ticket: issued.ticket,
      expiresAt: issued.expiresAt,
      provider: settings.provider,
      model: settings.model,
      reasoningLevel: settings.reasoningLevel,
      settingsRevision: settings.revision,
      noteRevision: note.revision,
      transcriptId: note.transcriptId,
      usage: {
        limit: usage.limit,
        used: usage.used,
        usageDay: usage.usageDay,
        resetAt: usage.resetAt,
        limitReached: usage.used >= usage.limit,
      },
    };
    return ok(body, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.aiTicket');
  }
}
