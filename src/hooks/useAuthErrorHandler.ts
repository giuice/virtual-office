// src/hooks/useAuthErrorHandler.ts
import { useState, useCallback } from 'react';
import { AuthErrorHandler, AuthErrorType, RecoveryAction, CategorizedAuthError } from '@/lib/auth/error-handler';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook for handling authentication errors with recovery actions
 */
export function useAuthErrorHandler() {
  const [currentError, setCurrentError] = useState<CategorizedAuthError | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const { clearAuthState, refreshSession, switchAccount } = useAuth();

  /**
   * Handle an authentication error and provide recovery options
   */
  const handleAuthError = useCallback(async (error: Error): Promise<CategorizedAuthError> => {
    const categorizedError = await AuthErrorHandler.handleError(error);
    setCurrentError(categorizedError);
    return categorizedError;
  }, []);

  /**
   * Execute a recovery action
   */
  const executeRecoveryAction = useCallback(async (action: RecoveryAction): Promise<void> => {
    setIsRecovering(true);
    try {
      // Handle built-in recovery actions
      switch (action.type) {
        case 'clear_data':
          clearAuthState();
          break;
        case 'refresh_session':
          await refreshSession();
          break;
        case 'retry':
          // Retry logic should be handled by the calling component
          break;
        default:
          // Execute custom action if provided
          if (action.action) {
            await AuthErrorHandler.executeRecoveryAction(action);
          }
      }
      
      // Clear the current error after successful recovery
      setCurrentError(null);
    } catch (recoveryError) {
      console.error('Recovery action failed:', recoveryError);
      throw recoveryError;
    } finally {
      setIsRecovering(false);
    }
  }, [clearAuthState, refreshSession]);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setCurrentError(null);
  }, []);

  /**
   * Create a retry wrapper for auth operations
   */
  const createRetryWrapper = useCallback(<T extends any[], R>(
    operation: (...args: T) => Promise<R>,
    maxRetries: number = 3
  ) => {
    return AuthErrorHandler.createRetryMechanism(
      () => operation.apply(null, [] as any),
      maxRetries
    );
  }, []);

  /**
   * Get user-friendly error message
   */
  const getErrorMessage = useCallback((error: Error): string => {
    return AuthErrorHandler.getUserFriendlyMessage(error);
  }, []);

  /**
   * Get recovery actions for an error
   */
  const getRecoveryActions = useCallback((error: Error): RecoveryAction[] => {
    return AuthErrorHandler.getRecoveryActions(error);
  }, []);

  return {
    // State
    currentError,
    isRecovering,
    
    // Actions
    handleAuthError,
    executeRecoveryAction,
    clearError,
    createRetryWrapper,
    
    // Utilities
    getErrorMessage,
    getRecoveryActions,
  };
}