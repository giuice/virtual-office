import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { NextResponse } from 'next/server';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  beginLegacyPresenceWrite,
  completionStatusForResponse,
  isLegacyPresenceWriteGateError,
  type LegacyPresenceCompletionStatus,
  type LegacyPresenceWriteGate,
} from '@/lib/presence/legacy-write-gate';

// Instantiate repositories per-request inside handler

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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

    if (authContext.dbUser.role !== 'admin') {
      return completeWith(NextResponse.json({ message: 'Only admins can remove users from a company' }, { status: 403 }));
    }

    const userRepository = new SupabaseUserRepository(authContext.supabase);
    const adminUserRepository = new SupabaseUserRepository(
      await createSupabaseServerClient('service_role')
    );
    const { userId, companyId } = await request.json();

    if (!userId || !companyId) {
      return completeWith(NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      ));
    }

    if (companyId !== authContext.dbUser.companyId) {
      return completeWith(NextResponse.json({ message: 'Cannot remove users outside your company' }, { status: 403 }));
    }

    writeGate.assertCanStartDatabaseOperation();
    const user = await userRepository.findById(userId);
    if (!user) {
      return completeWith(NextResponse.json({ message: 'User not found' }, { status: 404 }));
    }

    if (user.companyId !== authContext.dbUser.companyId) {
      return completeWith(NextResponse.json({ message: 'Cannot remove users outside your company' }, { status: 403 }));
    }

    // 1. Update the user to remove company association using repository
    await adminUserRepository.updateCompanyAssociation(
      userId,
      null,
      () => writeGate?.assertCanStartDatabaseOperation()
    );

    // 2. Remove user from any occupied spaces using the new presence system
    // With the new schema, users track their own location via currentSpaceId
    // So we just need to clear the user's current space
    if (user?.currentSpaceId) {
      // Clear the user's current space location
      await adminUserRepository.update(
        userId,
        { currentSpaceId: null },
        () => writeGate?.assertCanStartDatabaseOperation()
      );
      console.log(`Removed user ${userId} from space ${user.currentSpaceId}`);
    }

    return completeWith(NextResponse.json(
      { message: 'User removed from company successfully' },
      { status: 200 }
    ));
  } catch (error) {
    if (isLegacyPresenceWriteGateError(error)) {
      completionStatus = error.httpStatus >= 500 ? 'failed' : 'rejected';
      return NextResponse.json(error.toBody(), { status: error.httpStatus });
    }

    // Never serialize raw DB/exception text into the response (handoff rule).
    const correlationId = crypto.randomUUID();
    console.error('Error removing user from company:', { correlationId, error });
    completionStatus = 'failed';
    return NextResponse.json({
      message: 'Failed to remove user from company',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  } finally {
    if (writeGate) {
      await writeGate.close(completionStatus);
    }
  }
}
