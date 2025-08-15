// src/lib/auth/index.ts
export { validateUserSession } from './session';
export { SessionManager } from './session-manager';
export { AuthErrorHandler, AuthErrorType } from './error-handler';
export type { RecoveryAction, CategorizedAuthError } from './error-handler';

// Alias for compatibility
export { validateUserSession as getServerSession } from './session';