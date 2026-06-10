import { NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';
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
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const userRepository = new SupabaseUserRepository(authContext.supabase);

    // Get ID from query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid id query parameter' }, { status: 400 });
    }

    // Get user data from request body
    // Ensure lastActive is excluded if present, as the repository handles it.
    const body: Partial<User> = await request.json();
    const targetUser = id === authContext.dbUser.id ? authContext.dbUser : await userRepository.findById(id);

    if (!targetUser) {
      return NextResponse.json({ success: false, message: 'User not found or update failed' }, { status: 404 });
    }

    let userData: Partial<User>;

    if (id === authContext.dbUser.id) {
      if (body.status !== undefined && !isUserStatus(body.status)) {
        return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
      }

      userData = {};
      if (body.displayName !== undefined) userData.displayName = body.displayName;
      if (body.statusMessage !== undefined) userData.statusMessage = body.statusMessage;
      if (body.status !== undefined) userData.status = body.status;
      if (body.preferences !== undefined) userData.preferences = body.preferences;
    } else {
      if (authContext.dbUser.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only admins can update other users' }, { status: 403 });
      }

      if (!authContext.dbUser.companyId || targetUser.companyId !== authContext.dbUser.companyId) {
        return NextResponse.json({ success: false, error: 'Cannot update users outside your company' }, { status: 403 });
      }

      if (!isUserRole(body.role)) {
        return NextResponse.json({ success: false, error: 'Cross-user updates may only change role' }, { status: 400 });
      }

      userData = { role: body.role };
    }

    const updatedUser = await userRepository.update(id, userData);

    if (!updatedUser) {
      return NextResponse.json({ success: false, message: 'User not found or update failed' }, { status: 404 });
    }

    // Return success with the updated user object (mapped back to camelCase by repository)
    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error updating user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
    // Check specifically for the schema cache error
    if (typeof errorMessage === 'string' && errorMessage.includes("Could not find the 'lastActive' column")) {
      console.error("Potential Supabase schema cache issue detected for 'last_active'. Consider refreshing the schema cache in Supabase.");
      return NextResponse.json({
        success: false,
        error: `Database schema cache error: ${errorMessage}. Please try again later or refresh the Supabase schema cache.`
      }, { status: 500 });
    }
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}
