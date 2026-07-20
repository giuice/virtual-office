import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { API_ERROR_CODES } from '@/lib/api/error-contract';
import { createCorrelationId, jsonError, jsonSuccess } from '@/lib/api/server-error';
import { requireAuthUser } from '@/lib/auth/session';
import { User } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const correlationId = createCorrelationId();

  try {
    const authContext = await requireAuthUser({ correlationId, pathname: '/api/users/list' });
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const userRepository: IUserRepository = new SupabaseUserRepository(authContext.supabase);
    
    const users: User[] = authContext.dbUser.companyId
      ? await userRepository.findByCompany(authContext.dbUser.companyId)
      : [authContext.dbUser];

    return jsonSuccess({
      success: true,
      users,
    }, correlationId, { status: 200 });
  } catch (error) {
    return jsonError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch users', {
      correlationId,
      cause: error,
      context: 'users.list',
    });
  }
}
