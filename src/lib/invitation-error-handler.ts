// src/lib/invitation-error-handler.ts

export interface InvitationError {
  type: InvitationErrorType;
  message: string;
  userMessage: string;
  isRetryable: boolean;
  suggestedActions: InvitationErrorAction[];
}

export type InvitationErrorType = 
  | 'invitation_not_found'
  | 'invitation_expired'
  | 'invitation_already_used'
  | 'duplicate_invitation'
  | 'invalid_email'
  | 'company_not_found'
  | 'user_already_member'
  | 'permission_denied'
  | 'network_error'
  | 'validation_error'
  | 'rate_limit_exceeded'
  | 'server_error';

export interface InvitationErrorAction {
  label: string;
  description: string;
  type: 'retry' | 'redirect' | 'contact_admin' | 'refresh' | 'copy_link';
  action?: () => void | Promise<void>;
}

export class InvitationErrorHandler {
  /**
   * Categorizes and handles invitation-related errors
   */
  static handleError(error: any, context?: {
    email?: string;
    token?: string;
    operation?: 'create' | 'accept' | 'revoke' | 'validate';
  }): InvitationError {
    const errorMessage = error?.message || error?.error || String(error);
    const errorCode = error?.code || error?.status;

    // Network errors
    if (error?.name === 'NetworkError' || errorMessage.includes('fetch')) {
      return {
        type: 'network_error',
        message: errorMessage,
        userMessage: 'Network connection failed. Please check your internet connection and try again.',
        isRetryable: true,
        suggestedActions: [
          {
            label: 'Retry',
            description: 'Try the operation again',
            type: 'retry'
          },
          {
            label: 'Refresh Page',
            description: 'Reload the page and try again',
            type: 'refresh',
            action: () => window.location.reload()
          }
        ]
      };
    }

    // Rate limiting
    if (errorCode === 429 || errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      return {
        type: 'rate_limit_exceeded',
        message: errorMessage,
        userMessage: 'Too many requests. Please wait a moment before trying again.',
        isRetryable: true,
        suggestedActions: [
          {
            label: 'Wait and Retry',
            description: 'Wait 30 seconds and try again',
            type: 'retry'
          }
        ]
      };
    }

    // Permission errors
    if (errorCode === 403 || errorMessage.includes('forbidden') || errorMessage.includes('permission')) {
      return {
        type: 'permission_denied',
        message: errorMessage,
        userMessage: 'You don\'t have permission to perform this action. Only administrators can manage invitations.',
        isRetryable: false,
        suggestedActions: [
          {
            label: 'Contact Administrator',
            description: 'Ask your company administrator for help',
            type: 'contact_admin'
          }
        ]
      };
    }

    // Authentication errors
    if (errorCode === 401 || errorMessage.includes('unauthorized') || errorMessage.includes('sign in')) {
      return {
        type: 'permission_denied',
        message: errorMessage,
        userMessage: 'Please sign in to continue.',
        isRetryable: true,
        suggestedActions: [
          {
            label: 'Sign In',
            description: 'Go to the login page',
            type: 'redirect',
            action: () => window.location.href = '/login'
          }
        ]
      };
    }

    // Invitation not found
    if (errorCode === 404 || errorMessage.includes('not found') || errorMessage.includes('invalid')) {
      return {
        type: 'invitation_not_found',
        message: errorMessage,
        userMessage: 'This invitation link is invalid or has been removed. Please check the link or request a new invitation.',
        isRetryable: false,
        suggestedActions: [
          {
            label: 'Contact Administrator',
            description: 'Ask for a new invitation link',
            type: 'contact_admin'
          },
          {
            label: 'Go to Login',
            description: 'Try signing in with an existing account',
            type: 'redirect',
            action: () => window.location.href = '/login'
          }
        ]
      };
    }

    // Invitation expired
    if (errorCode === 410 || errorMessage.includes('expired')) {
      return {
        type: 'invitation_expired',
        message: errorMessage,
        userMessage: 'This invitation has expired. Please request a new invitation from your administrator.',
        isRetryable: false,
        suggestedActions: [
          {
            label: 'Contact Administrator',
            description: 'Request a new invitation',
            type: 'contact_admin'
          }
        ]
      };
    }

    // Already used invitation
    if (errorMessage.includes('already used') || errorMessage.includes('already accepted')) {
      return {
        type: 'invitation_already_used',
        message: errorMessage,
        userMessage: 'This invitation has already been used. If you\'re the intended recipient, try signing in instead.',
        isRetryable: false,
        suggestedActions: [
          {
            label: 'Sign In',
            description: 'Go to the login page',
            type: 'redirect',
            action: () => window.location.href = '/login'
          }
        ]
      };
    }

    // Duplicate invitation
    if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
      return {
        type: 'duplicate_invitation',
        message: errorMessage,
        userMessage: context?.email 
          ? `An invitation has already been sent to ${context.email}. Check if they received it or revoke the existing invitation first.`
          : 'An invitation for this email already exists.',
        isRetryable: false,
        suggestedActions: [
          {
            label: 'Check Existing Invitations',
            description: 'View pending invitations',
            type: 'refresh'
          }
        ]
      };
    }

    // User already member
    if (errorMessage.includes('already belongs') || errorMessage.includes('already member')) {
      return {
        type: 'user_already_member',
        message: errorMessage,
        userMessage: 'This user is already a member of a company. They cannot join another company.',
        isRetryable: false,
        suggestedActions: [
          {
            label: 'Contact Administrator',
            description: 'Discuss with your administrator',
            type: 'contact_admin'
          }
        ]
      };
    }

    // Email validation errors
    if (errorMessage.includes('email') && (errorMessage.includes('invalid') || errorMessage.includes('format'))) {
      return {
        type: 'invalid_email',
        message: errorMessage,
        userMessage: 'Please enter a valid email address.',
        isRetryable: true,
        suggestedActions: [
          {
            label: 'Fix Email',
            description: 'Check the email format and try again',
            type: 'retry'
          }
        ]
      };
    }

    // Validation errors
    if (errorCode === 400 || errorMessage.includes('validation') || errorMessage.includes('required')) {
      return {
        type: 'validation_error',
        message: errorMessage,
        userMessage: 'Please check your input and try again. All required fields must be filled.',
        isRetryable: true,
        suggestedActions: [
          {
            label: 'Check Input',
            description: 'Verify all fields are filled correctly',
            type: 'retry'
          }
        ]
      };
    }

    // Server errors
    if (errorCode >= 500 || errorMessage.includes('server') || errorMessage.includes('internal')) {
      return {
        type: 'server_error',
        message: errorMessage,
        userMessage: 'A server error occurred. Please try again in a few moments.',
        isRetryable: true,
        suggestedActions: [
          {
            label: 'Try Again',
            description: 'Retry the operation',
            type: 'retry'
          },
          {
            label: 'Contact Support',
            description: 'If the problem persists, contact support',
            type: 'contact_admin'
          }
        ]
      };
    }

    // Generic error fallback
    return {
      type: 'server_error',
      message: errorMessage,
      userMessage: 'An unexpected error occurred. Please try again.',
      isRetryable: true,
      suggestedActions: [
        {
          label: 'Try Again',
          description: 'Retry the operation',
          type: 'retry'
        },
        {
          label: 'Refresh Page',
          description: 'Reload the page and try again',
          type: 'refresh',
          action: () => window.location.reload()
        }
      ]
    };
  }

  /**
   * Get user-friendly error message for specific invitation operations
   */
  static getOperationErrorMessage(operation: string, error: InvitationError): string {
    const baseMessage = error.userMessage;
    
    switch (operation) {
      case 'create':
        return `Failed to send invitation: ${baseMessage}`;
      case 'accept':
        return `Failed to accept invitation: ${baseMessage}`;
      case 'revoke':
        return `Failed to revoke invitation: ${baseMessage}`;
      case 'validate':
        return `Invitation validation failed: ${baseMessage}`;
      default:
        return baseMessage;
    }
  }

  /**
   * Check if an error should trigger a retry mechanism
   */
  static shouldRetry(error: InvitationError, retryCount: number = 0): boolean {
    if (!error.isRetryable || retryCount >= 3) {
      return false;
    }

    // Only retry network errors and server errors
    return ['network_error', 'server_error', 'rate_limit_exceeded'].includes(error.type);
  }

  /**
   * Get retry delay in milliseconds based on error type and retry count
   */
  static getRetryDelay(error: InvitationError, retryCount: number): number {
    switch (error.type) {
      case 'rate_limit_exceeded':
        return Math.min(30000, 5000 * Math.pow(2, retryCount)); // Exponential backoff, max 30s
      case 'network_error':
        return Math.min(10000, 1000 * Math.pow(2, retryCount)); // Exponential backoff, max 10s
      case 'server_error':
        return Math.min(15000, 2000 * Math.pow(2, retryCount)); // Exponential backoff, max 15s
      default:
        return 1000; // 1 second default
    }
  }
}