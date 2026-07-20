import { NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  companyMemberRoleUpdateRequestSchema,
  companyMemberRoleUpdateRpcErrorMap,
  parseCompanyMemberRoleUpdateRpcErrorCode,
  parseCompanyMemberRoleUpdateRpcResult,
} from '@/lib/api/company-membership-contracts';
import { selfProfileUpdateSchema } from '@/lib/presence/user-write-contracts';
import {
  beginLegacyPresenceWrite,
  completionStatusForResponse,
  isLegacyPresenceWriteGateError,
  type LegacyPresenceCompletionStatus,
  type LegacyPresenceWriteGate,
} from '@/lib/presence/legacy-write-gate';
import type { User } from '@/types/database';
import {
  isLegacyPresenceRouteAuditError,
  recordLegacyPresenceRouteCall,
} from '@/lib/presence/legacy-route-audit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
) {
  let writeGate: LegacyPresenceWriteGate | null = null;
  let completionStatus: LegacyPresenceCompletionStatus = 'failed';

  const completeWith = (response: NextResponse): NextResponse => {
    completionStatus = completionStatusForResponse(response);
    return response;
  };

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return completeWith(NextResponse.json({
        success: false,
        code: 'INVALID_JSON',
        error: 'Invalid JSON payload',
      }, { status: 400 }));
    }

    const attemptedOffline =
      typeof body === 'object' &&
      body !== null &&
      'status' in body &&
      body.status === 'offline';

    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return completeWith(authContext.errorResponse);
    }

    if (attemptedOffline) {
      await recordLegacyPresenceRouteCall('users-offline-status');
      writeGate = await beginLegacyPresenceWrite();
    }

    const readRepository = new SupabaseUserRepository(authContext.supabase);

    // Get ID from query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || typeof id !== 'string') {
      return completeWith(NextResponse.json({ error: 'Missing or invalid id query parameter' }, { status: 400 }));
    }

    // Get user data from request body
    // Ensure lastActive is excluded if present, as the repository handles it.
    const targetUser = id === authContext.dbUser.id ? authContext.dbUser : await readRepository.findById(id);

    if (!targetUser) {
      return completeWith(NextResponse.json({ success: false, message: 'User not found or update failed' }, { status: 404 }));
    }

    let userData: Partial<User>;

    if (id === authContext.dbUser.id) {
      const parsed = selfProfileUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return completeWith(NextResponse.json({
          success: false,
          code: attemptedOffline ? 'PERSISTED_OFFLINE_NOT_ALLOWED' : 'INVALID_PROFILE_UPDATE',
          error: attemptedOffline
            ? 'Offline is derived from connectivity and cannot be persisted'
            : 'Invalid profile update',
        }, { status: 400 }));
      }
      userData = parsed.data;
    } else {
      if (authContext.dbUser.role !== 'admin') {
        return completeWith(NextResponse.json({ success: false, error: 'Only admins can update other users' }, { status: 403 }));
      }

      if (!authContext.dbUser.companyId || targetUser.companyId !== authContext.dbUser.companyId) {
        return completeWith(NextResponse.json({ success: false, error: 'Cannot update users outside your company' }, { status: 403 }));
      }

      const parsed = companyMemberRoleUpdateRequestSchema.safeParse(body);
      if (!parsed.success) {
        return completeWith(NextResponse.json({ success: false, code: 'INVALID_ROLE_UPDATE', error: 'Cross-user updates may only change role' }, { status: 400 }));
      }

      userData = parsed.data;

      const companyId = authContext.dbUser.companyId;
      const admin = await createSupabaseServerClient('service_role');
      const { data: roleResult, error: roleError } = await admin.rpc(
        'update_company_member_role',
        {
          p_actor_user_id: authContext.dbUser.id,
          p_target_user_id: id,
          p_company_id: companyId,
          p_role: parsed.data.role,
        },
      );
      if (roleError) {
        const errorCode = parseCompanyMemberRoleUpdateRpcErrorCode(roleError.message);
        const contract = errorCode
          ? companyMemberRoleUpdateRpcErrorMap[errorCode]
          : null;
        if (contract) {
          return completeWith(
            NextResponse.json(contract.body, { status: contract.status }),
          );
        }
        return completeWith(NextResponse.json({
          success: false,
          code: 'INTERNAL_ERROR',
          error: 'Failed to update user',
        }, { status: 500 }));
      }

      const result = parseCompanyMemberRoleUpdateRpcResult(roleResult, {
        actorUserId: authContext.dbUser.id,
        targetUserId: id,
        companyId,
        role: parsed.data.role,
      });
      if (!result) {
        return completeWith(NextResponse.json({
          success: false,
          code: 'INTERNAL_ERROR',
          error: 'Failed to update user',
        }, { status: 500 }));
      }

      return completeWith(NextResponse.json({
        success: true,
        user: { ...targetUser, role: parsed.data.role },
        message: 'User updated successfully',
      }));
    }

    const updateRepository = new SupabaseUserRepository(
      await createSupabaseServerClient('service_role')
    );

    const updatedUser = await updateRepository.update(id, userData);

    if (!updatedUser) {
      return completeWith(NextResponse.json({ success: false, message: 'User not found or update failed' }, { status: 404 }));
    }

    // Return success with the updated user object (mapped back to camelCase by repository)
    return completeWith(NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully'
    }, { status: 200 }));

  } catch (error) {
    if (isLegacyPresenceRouteAuditError(error)) {
      completionStatus = 'failed';
      return NextResponse.json({
        success: false,
        code: error.code,
        retryable: true,
      }, { status: 503 });
    }

    if (isLegacyPresenceWriteGateError(error)) {
      completionStatus = error.httpStatus >= 500 ? 'failed' : 'rejected';
      return NextResponse.json(error.toBody(), { status: error.httpStatus });
    }

    // Never serialize raw DB/exception text into the response; keep internals
    // (incl. the known 'lastActive' schema-cache failure mode) in server logs.
    const correlationId = crypto.randomUUID();
    console.error('Error updating user:', { correlationId, error });
    if (error instanceof Error && error.message.includes("Could not find the 'lastActive' column")) {
      console.error("Potential Supabase schema cache issue detected for 'last_active'. Consider refreshing the schema cache in Supabase.");
    }
    completionStatus = 'failed';
    return NextResponse.json({
      success: false,
      error: 'Failed to update user',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  } finally {
    if (writeGate) {
      await writeGate.close(completionStatus);
    }
  }
}
