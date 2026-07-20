import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase/SupabaseCompanyRepository';
import { API_ERROR_CODES } from '@/lib/api/error-contract';
import { createCorrelationId, jsonError, jsonSuccess } from '@/lib/api/server-error';
import { requireAuthUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const correlationId = createCorrelationId();

  try {
    const authContext = await requireAuthUser({ correlationId, pathname: '/api/companies/get' });
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return jsonError(400, API_ERROR_CODES.BAD_REQUEST, 'Company ID is required', {
        correlationId,
        context: 'companies.get',
      });
    }

    if (id !== authContext.dbUser.companyId) {
      return jsonError(403, API_ERROR_CODES.FORBIDDEN, 'Cannot access companies outside your account', {
        correlationId,
        context: 'companies.get',
      });
    }

    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(authContext.supabase);
    const company = await companyRepository.findById(id);
    
    if (!company) {
      return jsonError(404, API_ERROR_CODES.COMPANY_NOT_FOUND, 'Company not found', {
        correlationId,
        context: 'companies.get',
      });
    }

    return jsonSuccess({
      success: true,
      company 
    }, correlationId);
  } catch (error) {
    return jsonError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to get company', {
      correlationId,
      cause: error,
      context: 'companies.get',
    });
  }
}
