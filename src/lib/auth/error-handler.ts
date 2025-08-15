// src/lib/auth/error-handler.ts
import { AuthError } from '@supabase/supabase-js';
import { SessionManager } from './session-manager';

/**
 * Enum for categorizing authentication errors
 */
export enum AuthErrorType {
  // Session and token related errors
  SESSION_EXPIRED = 'session_expired',
  INVALID_TOKEN = 'invalid_token',
  TOKEN_REFRESH_FAILED = 'token_refresh_failed',
  
  // Account and credential errors
  INVALID_CREDENTIALS = 'invalid_credentials',
  ACCOUNT_NOT_FOUND = 'account_not_found',
  ACCOUNT_ALREADY_EXISTS = 'account_already_exists',
  EMAIL_NOT_CONFIRMED = 'email_not_confirmed',
  
  // Multi-account conflicts
  ACCOUNT_CONFLICT = 'account_conflict',
  SESSION_CONFLICT = 'session_conflict',
  
  // Network and service errors
  NETWORK_ERROR = 'network_error',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  RATE_LIMITED = 'rate_limited',
  
  // OAuth specific errors
  OAUTH_CANCELLED = 'oauth_cancelled',
  OAUTH_ACCESS_DENIED = 'oauth_access_denied',
  OAUTH_ERROR = 'oauth_error',
  
  // Generic errors
  UNKNOWN_ERROR = 'unknown_error',
  VALIDATION_ERROR = 'validation_error'
}

/**
 * Recovery action interface
 */
export interface RecoveryAction {
  type: 'retry' | 'clear_data' | 'refresh_session' | 'redirect' | 'manual';
  label: string;
  description: string;
  action?: () => Promise<void> | void;
}

/**
 * Categorized auth error with recovery options
 */
export interface CategorizedAuthError {
  type: AuthErrorType;
  message: string;
  userMessage: string;
  recoveryActions: RecoveryAction[];
  isRetryable: boolean;
  shouldClearSession: boolean;
}

/**
 * Comprehensive authentication error handler
 */
export class AuthErrorHandler {
  /**
   * Categorize an authentication error and provide recovery strategies
   */
  static categorizeError(error: AuthError | Error): CategorizedAuthError {
    const message = error.message.toLowerCase();
    
    // Session and token errors
    if (message.includes('session') && (message.includes('expired') || message.includes('invalid'))) {
      return {
        type: AuthErrorType.SESSION_EXPIRED,
        message: error.message,
        userMessage: 'Your session has expired. Please sign in again.',
        recoveryActions: [
          {
            type: 'refresh_session',
            label: 'Refresh Session',
            description: 'Try to refresh your current session',
            action: async () => await SessionManager.refreshSession()
          },
          {
            type: 'clear_data',
            label: 'Sign In Again',
            description: 'Clear session data and sign in again',
            action: async () => await SessionManager.switchAccount()
          }
        ],
        isRetryable: true,
        shouldClearSession: true
      };
    }

    if (message.includes('invalid') && message.includes('token')) {
      return {
        type: AuthErrorType.INVALID_TOKEN,
        message: error.message,
        userMessage: 'Authentication token is invalid. Please sign in again.',
        recoveryActions: [
          {
            type: 'clear_data',
            label: 'Clear Data & Sign In',
            description: 'Clear authentication data and sign in again',
            action: async () => await SessionManager.switchAccount()
          }
        ],
        isRetryable: false,
        shouldClearSession: true
      };
    }

    // Credential errors
    if (message.includes('invalid login credentials') || message.includes('invalid email or password')) {
      return {
        type: AuthErrorType.INVALID_CREDENTIALS,
        message: error.message,
        userMessage: 'Invalid email or password. Please check your credentials and try again.',
        recoveryActions: [
          {
            type: 'manual',
            label: 'Check Credentials',
            description: 'Verify your email and password are correct'
          },
          {
            type: 'redirect',
            label: 'Reset Password',
            description: 'Reset your password if you\'ve forgotten it'
          }
        ],
        isRetryable: true,
        shouldClearSession: false
      };
    }

    if (message.includes('email not confirmed')) {
      return {
        type: AuthErrorType.EMAIL_NOT_CONFIRMED,
        message: error.message,
        userMessage: 'Please check your email and click the confirmation link before signing in.',
        recoveryActions: [
          {
            type: 'manual',
            label: 'Check Email',
            description: 'Look for the confirmation email in your inbox'
          },
          {
            type: 'retry',
            label: 'Resend Confirmation',
            description: 'Request a new confirmation email'
          }
        ],
        isRetryable: true,
        shouldClearSession: false
      };
    }

    if (message.includes('user already registered') || message.includes('account already exists')) {
      return {
        type: AuthErrorType.ACCOUNT_ALREADY_EXISTS,
        message: error.message,
        userMessage: 'An account with this email already exists. Please sign in instead.',
        recoveryActions: [
          {
            type: 'redirect',
            label: 'Sign In Instead',
            description: 'Go to the sign in page'
          },
          {
            type: 'redirect',
            label: 'Reset Password',
            description: 'Reset your password if you\'ve forgotten it'
          }
        ],
        isRetryable: false,
        shouldClearSession: false
      };
    }

    // Rate limiting
    if (message.includes('too many requests') || message.includes('rate limit')) {
      return {
        type: AuthErrorType.RATE_LIMITED,
        message: error.message,
        userMessage: 'Too many attempts. Please wait a moment and try again.',
        recoveryActions: [
          {
            type: 'retry',
            label: 'Try Again Later',
            description: 'Wait a few minutes before attempting again'
          }
        ],
        isRetryable: true,
        shouldClearSession: false
      };
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message: error.message,
        userMessage: 'Network error. Please check your connection and try again.',
        recoveryActions: [
          {
            type: 'retry',
            label: 'Retry',
            description: 'Try the operation again'
          },
          {
            type: 'manual',
            label: 'Check Connection',
            description: 'Verify your internet connection is working'
          }
        ],
        isRetryable: true,
        shouldClearSession: false
      };
    }

    // OAuth errors
    if (message.includes('popup_closed_by_user') || message.includes('cancelled')) {
      return {
        type: AuthErrorType.OAUTH_CANCELLED,
        message: error.message,
        userMessage: 'Sign in was cancelled. Please try again.',
        recoveryActions: [
          {
            type: 'retry',
            label: 'Try Again',
            description: 'Attempt the OAuth sign in again'
          }
        ],
        isRetryable: true,
        shouldClearSession: false
      };
    }

    if (message.includes('access_denied')) {
      return {
        type: AuthErrorType.OAUTH_ACCESS_DENIED,
        message: error.message,
        userMessage: 'Access denied. Please allow the required permissions and try again.',
        recoveryActions: [
          {
            type: 'retry',
            label: 'Try Again',
            description: 'Attempt the OAuth sign in again and allow permissions'
          }
        ],
        isRetryable: true,
        shouldClearSession: false
      };
    }

    // Multi-account conflicts
    if (message.includes('session conflict') || message.includes('account conflict')) {
      return {
        type: AuthErrorType.ACCOUNT_CONFLICT,
        message: error.message,
        userMessage: 'Account conflict detected. Please clear your session and sign in again.',
        recoveryActions: [
          {
            type: 'clear_data',
            label: 'Clear Session',
            description: 'Clear all authentication data and start fresh',
            action: async () => await SessionManager.switchAccount()
          }
        ],
        isRetryable: true,
        shouldClearSession: true
      };
    }

    // Default unknown error
    return {
      type: AuthErrorType.UNKNOWN_ERROR,
      message: error.message,
      userMessage: 'An unexpected error occurred. Please try again or contact support.',
      recoveryActions: [
        {
          type: 'retry',
          label: 'Try Again',
          description: 'Attempt the operation again'
        },
        {
          type: 'clear_data',
          label: 'Clear Data',
          description: 'Clear authentication data and start fresh',
          action: async () => await SessionManager.switchAccount()
        }
      ],
      isRetryable: true,
      shouldClearSession: false
    };
  }

  /**
   * Get user-friendly error message for display
   */
  static getUserFriendlyMessage(error: AuthError | Error): string {
    const categorized = this.categorizeError(error);
    return categorized.userMessage;
  }

  /**
   * Get suggested recovery actions for an error
   */
  static getRecoveryActions(error: AuthError | Error): RecoveryAction[] {
    const categorized = this.categorizeError(error);
    return categorized.recoveryActions;
  }

  /**
   * Handle error with automatic recovery attempts
   */
  static async handleError(error: AuthError | Error): Promise<CategorizedAuthError> {
    const categorized = this.categorizeError(error);
    
    console.log(`Handling auth error: ${categorized.type}`, {
      message: categorized.message,
      userMessage: categorized.userMessage,
      isRetryable: categorized.isRetryable,
      shouldClearSession: categorized.shouldClearSession
    });

    // Automatic recovery for certain error types
    if (categorized.shouldClearSession) {
      try {
        console.log('Automatically clearing session due to error type');
        SessionManager.clearBrowserData();
      } catch (clearError) {
        console.error('Failed to clear session data:', clearError);
      }
    }

    return categorized;
  }

  /**
   * Create a retry mechanism with exponential backoff
   */
  static createRetryMechanism(
    operation: () => Promise<any>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): () => Promise<any> {
    return async () => {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error: any) {
          lastError = error;
          const categorized = this.categorizeError(error);
          
          // Don't retry if error is not retryable
          if (!categorized.isRetryable) {
            throw error;
          }
          
          // Don't retry on the last attempt
          if (attempt === maxRetries) {
            break;
          }
          
          // Calculate delay with exponential backoff
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`Auth operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError!;
    };
  }

  /**
   * Validate error recovery action
   */
  static async executeRecoveryAction(action: RecoveryAction): Promise<void> {
    if (action.action) {
      try {
        await action.action();
        console.log(`Recovery action '${action.label}' executed successfully`);
      } catch (error) {
        console.error(`Recovery action '${action.label}' failed:`, error);
        throw new Error(`Recovery action failed: ${error}`);
      }
    } else {
      console.log(`Manual recovery action: ${action.label} - ${action.description}`);
    }
  }
}