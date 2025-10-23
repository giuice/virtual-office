const DEFAULT_ERROR_MESSAGE = 'Something went wrong while communicating with the authentication service. Please try again.';

interface SupabaseAuthErrorLike {
  message?: string;
  code?: string;
  status?: string | number;
  error_description?: string;
}

const ERROR_MATCHERS: Array<{ test: (value: string) => boolean; message: string }> = [
  {
    test: (value) => /invalid login credentials/i.test(value) || /invalid_credentials/i.test(value),
    message: 'Invalid email or password. Please check your credentials and try again.',
  },
  {
    test: (value) => /email not confirmed/i.test(value) || /email confirmation/i.test(value),
    message: 'Please confirm your email address before signing in. Check your inbox for the confirmation link.',
  },
  {
    test: (value) => /rate limit/i.test(value) || /too many requests/i.test(value),
    message: 'Too many attempts detected. Please wait a moment before trying again.',
  },
  {
    test: (value) => /password/i.test(value) && /weak/i.test(value),
    message: 'Your password does not meet the required strength. Choose a stronger password and try again.',
  },
  {
    test: (value) => /network/i.test(value) || /fetch failed/i.test(value) || /failed to fetch/i.test(value),
    message: 'Unable to reach the authentication service. Check your internet connection and try again.',
  },
];

function normaliseError(error: unknown): string | null {
  if (!error) return null;

  if (typeof error === 'string') {
    return error;
  }

  const details = error as SupabaseAuthErrorLike;

  if (typeof details.message === 'string' && details.message.trim().length > 0) {
    return details.message;
  }

  if (typeof details.error_description === 'string') {
    return details.error_description;
  }

  if (typeof details.code === 'string') {
    return details.code;
  }

  return null;
}

export function mapSupabaseAuthError(error: unknown): string {
  const rawMessage = normaliseError(error);

  if (!rawMessage) {
    return DEFAULT_ERROR_MESSAGE;
  }

  const trimmedMessage = rawMessage.trim();

  for (const matcher of ERROR_MATCHERS) {
    if (matcher.test(trimmedMessage)) {
      return matcher.message;
    }
  }

  return trimmedMessage || DEFAULT_ERROR_MESSAGE;
}

