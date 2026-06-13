export function resolveAppBaseUrl(request: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      return new URL(configuredAppUrl).origin;
    } catch (error) {
      console.warn('[API /invitations/create] Invalid NEXT_PUBLIC_APP_URL, falling back to request origin:', error);
    }
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}
