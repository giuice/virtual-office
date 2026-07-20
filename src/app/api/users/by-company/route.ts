import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { API_ERROR_CODES } from '@/lib/api/error-contract';
import { createCorrelationId, jsonError, jsonSuccess } from '@/lib/api/server-error';
import { requireAuthUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const correlationId = createCorrelationId();

  try {
    const authContext = await requireAuthUser({ correlationId, pathname: '/api/users/by-company' });
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const userRepository: IUserRepository = new SupabaseUserRepository(authContext.supabase);
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return jsonError(400, API_ERROR_CODES.BAD_REQUEST, 'Missing required companyId parameter', {
        correlationId,
        context: 'users.byCompany',
      });
    }

    if (companyId !== authContext.dbUser.companyId) {
      return jsonError(403, API_ERROR_CODES.FORBIDDEN, 'Cannot access users outside your company', {
        correlationId,
        context: 'users.byCompany',
      });
    }

    // Get users using the repository
    const users = await userRepository.findByCompany(companyId);
    
    // Return success with users array
    return jsonSuccess({
      success: true,
      users
    }, correlationId);
  } catch (error) {
    return jsonError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to get users', {
      correlationId,
      cause: error,
      context: 'users.byCompany',
    });
  }
}
