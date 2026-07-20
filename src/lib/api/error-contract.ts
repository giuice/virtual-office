export const API_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
} as const;

export type ApiErrorCode = string;

export type ApiErrorBody = {
  error: string;
  code?: string;
  correlationId?: string;
};
