// src/hooks/useInvitationOperation.ts
'use client';

import { useState, useCallback } from 'react';
import { InvitationErrorHandler, InvitationError } from '@/lib/invitation-error-handler';
import { useNotification } from '@/hooks/useNotification';

interface UseInvitationOperationOptions {
  onSuccess?: (result: any) => void;
  onError?: (error: InvitationError) => void;
  maxRetries?: number;
  showNotifications?: boolean;
}

interface InvitationOperationState {
  isLoading: boolean;
  error: InvitationError | null;
  retryCount: number;
}

export function useInvitationOperation(options: UseInvitationOperationOptions = {}) {
  const {
    onSuccess,
    onError,
    maxRetries = 3,
    showNotifications = true
  } = options;

  const [state, setState] = useState<InvitationOperationState>({
    isLoading: false,
    error: null,
    retryCount: 0
  });

  const { showSuccess, showError } = useNotification();

  const executeOperation = useCallback(async (
    operation: () => Promise<any>,
    operationType: 'create' | 'accept' | 'revoke' | 'validate',
    context?: { email?: string; token?: string }
  ) => {
    const performOperation = async (retryCount: number = 0): Promise<any> => {
      setState(prev => ({ ...prev, isLoading: true, retryCount }));

      try {
        const result = await operation();
        
        // Success
        setState({
          isLoading: false,
          error: null,
          retryCount: 0
        });

        if (showNotifications) {
          const successMessage = getSuccessMessage(operationType, context);
          showSuccess({ description: successMessage });
        }

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (error) {
        console.error(`Invitation ${operationType} error:`, error);
        
        const invitationError = InvitationErrorHandler.handleError(error, {
          ...context,
          operation: operationType
        });

        // Check if we should retry
        if (InvitationErrorHandler.shouldRetry(invitationError, retryCount) && retryCount < maxRetries) {
          const delay = InvitationErrorHandler.getRetryDelay(invitationError, retryCount);
          
          console.log(`Retrying ${operationType} operation in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          
          // Wait for the delay, then retry
          await new Promise(resolve => setTimeout(resolve, delay));
          return performOperation(retryCount + 1);
        }

        // No more retries or not retryable
        setState({
          isLoading: false,
          error: invitationError,
          retryCount
        });

        if (showNotifications) {
          const errorMessage = InvitationErrorHandler.getOperationErrorMessage(operationType, invitationError);
          showError({ description: errorMessage });
        }

        if (onError) {
          onError(invitationError);
        }

        throw invitationError;
      }
    };

    return performOperation();
  }, [onSuccess, onError, maxRetries, showNotifications, showSuccess, showError]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const retry = useCallback(async (
    operation: () => Promise<any>,
    operationType: 'create' | 'accept' | 'revoke' | 'validate',
    context?: { email?: string; token?: string }
  ) => {
    if (state.error) {
      clearError();
      return executeOperation(operation, operationType, context);
    }
  }, [state.error, clearError, executeOperation]);

  return {
    ...state,
    executeOperation,
    clearError,
    retry
  };
}

function getSuccessMessage(
  operationType: 'create' | 'accept' | 'revoke' | 'validate',
  context?: { email?: string; token?: string }
): string {
  switch (operationType) {
    case 'create':
      return context?.email 
        ? `Invitation sent to ${context.email} successfully!`
        : 'Invitation created successfully!';
    case 'accept':
      return 'Welcome! You have successfully joined the company.';
    case 'revoke':
      return context?.email
        ? `Invitation for ${context.email} has been revoked.`
        : 'Invitation revoked successfully.';
    case 'validate':
      return 'Invitation validated successfully.';
    default:
      return 'Operation completed successfully.';
  }
}