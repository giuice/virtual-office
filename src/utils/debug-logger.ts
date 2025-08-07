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
  },

  /**
   * Avatar-specific logging with enhanced formatting
   */
  avatar: {
    /**
     * Log avatar loading success
     */
    loadSuccess: (userId: string, url: string, source: string, metadata?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🖼️ [AVATAR:${userId.substring(0, 8)}] ✅ Loaded from ${source}`, {
          url: url.substring(0, 80) + (url.length > 80 ? '...' : ''),
          source,
          ...metadata
        });
      }
    },

    /**
     * Log avatar loading failure
     */
    loadFailure: (userId: string, url: string, error: string, metadata?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.error(`🖼️ [AVATAR:${userId.substring(0, 8)}] ❌ Load failed`, {
          url: url.substring(0, 80) + (url.length > 80 ? '...' : ''),
          error,
          ...metadata
        });
      }
    },

    /**
     * Log avatar retry attempts
     */
    retry: (userId: string, url: string, attempt: number, maxAttempts: number) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`🖼️ [AVATAR:${userId.substring(0, 8)}] 🔄 Retry ${attempt}/${maxAttempts}`, {
          url: url.substring(0, 80) + (url.length > 80 ? '...' : '')
        });
      }
    },

    /**
     * Log cache operations
     */
    cache: (operation: 'hit' | 'miss' | 'set' | 'invalidate', userId: string, metadata?: any) => {
      if (process.env.NODE_ENV === 'development') {
        const emoji = {
          hit: '🎯',
          miss: '❌',
          set: '💾',
          invalidate: '🗑️'
        }[operation];
        
        console.log(`🖼️ [AVATAR:${userId.substring(0, 8)}] ${emoji} Cache ${operation}`, metadata || '');
      }
    },

    /**
     * Log fallback avatar generation
     */
    fallback: (userId: string, reason: string, metadata?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🖼️ [AVATAR:${userId.substring(0, 8)}] 🎭 Fallback generated`, {
          reason,
          ...metadata
        });
      }
    },

    /**
     * Log avatar URL resolution process
     */
    resolution: (userId: string, sources: Array<{ source: string; url: string | null; selected: boolean }>) => {
      if (process.env.NODE_ENV === 'development') {
        console.group(`🖼️ [AVATAR:${userId.substring(0, 8)}] 🔍 URL Resolution`);
        sources.forEach(({ source, url, selected }) => {
          const status = selected ? '✅ SELECTED' : url ? '⏭️ Available' : '❌ Not found';
          console.log(`${status} ${source}:`, url ? url.substring(0, 60) + (url.length > 60 ? '...' : '') : 'null');
        });
        console.groupEnd();
      }
    },

    /**
     * Log performance metrics
     */
    performance: (userId: string, operation: string, duration: number, metadata?: any) => {
      if (process.env.NODE_ENV === 'development') {
        const emoji = duration > 1000 ? '🐌' : duration > 500 ? '⚡' : '🚀';
        console.log(`🖼️ [AVATAR:${userId.substring(0, 8)}] ${emoji} ${operation} took ${duration}ms`, metadata || '');
      }
    }
  }
};
