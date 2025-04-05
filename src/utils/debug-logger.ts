// src/utils/debug-logger.ts
/**
 * Utility for conditional logging in development environment
 * Helps with debugging space rendering and other UI components
 */
export const debugLogger = {
  /**
   * Log message with component identification
   */
  log: (component: string, message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${component}] ${message}`, data || '');
    }
  },

  /**
   * Log warning with component identification
   */
  warn: (component: string, message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[${component}] WARNING: ${message}`, data || '');
    }
  },

  /**
   * Log error with component identification
   */
  error: (component: string, message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${component}] ERROR: ${message}`, data || '');
    }
  },

  /**
   * Trace general component activity
   */
  trace: (component: string, message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TRACE:${component}] ${message}`, data || '');
    }
  },

  /**
   * Trace space-specific actions (useful for debugging space rendering)
   */
  traceSpace: (spaceId: string, action: string, details?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SPACE:${spaceId.substring(0, 6)}] ${action}`, details || '');
    }
  }
};
