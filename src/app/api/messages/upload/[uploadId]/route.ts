// src/app/api/messages/upload/[uploadId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { jsonError } from '@/lib/auth/authorize';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { requireAuthUser } from '@/lib/auth/session';
import { cancelPendingUpload } from '@/lib/messaging/attachment-uploads';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseMessageAttachmentUploadRepository } from '@/repositories/implementations/supabase/SupabaseMessageAttachmentUploadRepository';

const uploadIdSchema = z.guid();

/**
 * DELETE /api/messages/upload/[uploadId] — Phase 4 T12 (FR-010).
 *
 * Cancels one of the caller's pending (not yet sent) uploads: its record and
 * its storage object are deleted. 404 UPLOAD_NOT_FOUND when the id is not a
 * pending upload of the caller (unknown, another user's, already sent, or
 * already cancelled) — other users' uploads are indistinguishable from
 * unknown ids.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const { uploadId: rawUploadId } = await params;
    const parsedId = uploadIdSchema.safeParse(rawUploadId);
    if (!parsedId.success) {
      return jsonError(400, 'BAD_REQUEST', 'uploadId must be a UUID');
    }

    const auth = await requireAuthUser();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    // Ownership (uploader_id = the caller's users.id) is the authorization;
    // the service client is needed because pending uploads have no client
    // policies and the bucket has no storage policies.
    const serviceClient = await createSupabaseServerClient('service_role');
    const rateLimited = await enforceRateLimit(serviceClient, auth.dbUser.id, 'message:upload-cancel');
    if (rateLimited) {
      return rateLimited;
    }
    const outcome = await cancelPendingUpload(
      serviceClient,
      new SupabaseMessageAttachmentUploadRepository(serviceClient),
      parsedId.data.toLowerCase(),
      auth.dbUser.id
    );

    if (outcome === 'not_found') {
      return jsonError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
    }
    if (outcome === 'storage_failed') {
      return jsonError(500, 'INTERNAL_ERROR', 'Upload was cancelled but its file could not be deleted');
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling upload:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to cancel upload');
  }
}
