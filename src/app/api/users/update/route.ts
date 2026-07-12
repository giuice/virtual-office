import { NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  beginLegacyPresenceWrite,
  completionStatusForResponse,
  isLegacyPresenceWriteGateError,
  type LegacyPresenceCompletionStatus,
  type LegacyPresenceWriteGate,
} from '@/lib/presence/legacy-write-gate';
import type { User, UserRole, UserStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

const USER_ROLES = ['admin', 'member'] as const satisfies readonly UserRole[];
const USER_STATUSES = ['online', 'away', 'busy', 'offline'] as const satisfies readonly UserStatus[];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.some(role => role === value);
}

function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && USER_STATUSES.some(status => status === value);
}

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
    writeGate = await beginLegacyPresenceWrite();

    const authContext = await requireAuthUser(() => writeGate?.assertCanStartDatabaseOperation());
    if ('errorResponse' in authContext) {
      return completeWith(authContext.errorResponse);
    }

    const userRepository = new SupabaseUserRepository(authContext.supabase);

    // Get ID from query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || typeof id !== 'string') {
      return completeWith(NextResponse.json({ error: 'Missing or invalid id query parameter' }, { status: 400 }));
    }

    // Get user data from request body
    // Ensure lastActive is excluded if present, as the repository handles it.
    const body: Partial<User> = await request.json();
    if (id !== authContext.dbUser.id) {
      writeGate.assertCanStartDatabaseOperation();
    }
    const targetUser = id === authContext.dbUser.id ? authContext.dbUser : await userRepository.findById(id);

    if (!targetUser) {
      return completeWith(NextResponse.json({ success: false, message: 'User not found or update failed' }, { status: 404 }));
    }

    let userData: Partial<User>;

    if (id === authContext.dbUser.id) {
      if (body.status !== undefined && !isUserStatus(body.status)) {
        return completeWith(NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 }));
      }

      userData = {};
      if (body.displayName !== undefined) userData.displayName = body.displayName;
      if (body.statusMessage !== undefined) userData.statusMessage = body.statusMessage;
      if (body.status !== undefined) userData.status = body.status;
      if (body.preferences !== undefined) userData.preferences = body.preferences;
    } else {
      if (authContext.dbUser.role !== 'admin') {
        return completeWith(NextResponse.json({ success: false, error: 'Only admins can update other users' }, { status: 403 }));
      }

      if (!authContext.dbUser.companyId || targetUser.companyId !== authContext.dbUser.companyId) {
        return completeWith(NextResponse.json({ success: false, error: 'Cannot update users outside your company' }, { status: 403 }));
      }

      if (!isUserRole(body.role)) {
        return completeWith(NextResponse.json({ success: false, error: 'Cross-user updates may only change role' }, { status: 400 }));
      }

      userData = { role: body.role };
    }

    const updateRepository = id === authContext.dbUser.id
      ? userRepository
      : new SupabaseUserRepository(await createSupabaseServerClient('service_role'));

    const updatedUser = await updateRepository.update(
      id,
      userData,
      () => writeGate?.assertCanStartDatabaseOperation()
    );

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
