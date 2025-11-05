// src/utils/debug-logger.ts
/**
 * Utility for conditional logging in development environment
 * Helps with debugging space rendering and other UI components
 */
const isDevelopmentEnv = process.env.NODE_ENV === 'development';

const isTruthyFlag = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const MESSAGING_DEBUG_STORAGE_KEY = 'vo:debug:messaging';
const MESSAGING_FLAG_STORAGE_KEY = 'vo:flag:messaging_v2';

const isMessagingDebugEnabled = (): boolean => {
  // 1) Highest priority: explicit env flag (works in any NODE_ENV)
  if (isTruthyFlag((process as any)?.env?.NEXT_PUBLIC_DEBUG_MESSAGING ?? process.env?.NEXT_PUBLIC_DEBUG_MESSAGING)) {
    return true;
  }

  // 2) LocalStorage switch (works in any NODE_ENV)
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem(MESSAGING_DEBUG_STORAGE_KEY);
      if (isTruthyFlag(stored)) return true;
    } catch {
      // ignore storage errors
    }
  }

  // 3) Fallback: enable logs in development by default
  return isDevelopmentEnv;
};

const isMessagingV2Enabled = (): boolean => {
  // Explicit env toggle takes priority (server or build time)
  if (isTruthyFlag((process as any)?.env?.NEXT_PUBLIC_MESSAGING_V2 ?? process.env?.NEXT_PUBLIC_MESSAGING_V2)) {
    return true;
  }

  // Allow QA overrides via localStorage in the browser
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem(MESSAGING_FLAG_STORAGE_KEY);
      if (isTruthyFlag(stored)) {
        return true;
      }
    } catch {
      // Ignore storage access issues (Safari private mode, etc.)
    }
  }

  return false;
};

const logMessaging = (
  level: 'log' | 'warn' | 'error',
  scope: string,
  message: string,
  payload?: unknown
) => {
  if (!isMessagingDebugEnabled()) {
    return;
  }

  const formattedPayload = payload === undefined ? '' : payload;

  if (level === 'warn') {
    console.warn(`[MSG:${scope}] ${message}`, formattedPayload);
    return;
  }

  if (level === 'error') {
    console.error(`[MSG:${scope}] ${message}`, formattedPayload);
    return;
  }

  console.log(`[MSG:${scope}] ${message}`, formattedPayload);
};

const logMessagingMetric = (
  scope: string,
  metric: string,
  value: number,
  payload?: Record<string, unknown>
) => {
  if (!isMessagingDebugEnabled()) {
    return;
  }

  console.log(`[MSG:${scope}] ⏱️ ${metric}: ${value.toFixed(2)}ms`, payload ?? '');
};

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
  },

  messaging: {
    enabled: () => isMessagingDebugEnabled(),
    featureEnabled: () => isMessagingV2Enabled(),
    storageKeys: {
      debug: MESSAGING_DEBUG_STORAGE_KEY,
      flag: MESSAGING_FLAG_STORAGE_KEY,
    },

    info: (scope: string, message: string, payload?: unknown) => {
      logMessaging('log', `${scope}:info`, message, payload);
    },

    trace: (scope: string, message: string, payload?: unknown) => {
      logMessaging('log', `${scope}:trace`, message, payload);
    },

    event: (scope: string, message: string, payload?: unknown) => {
      logMessaging('log', scope, message, payload);
    },

    warn: (scope: string, message: string, payload?: unknown) => {
      logMessaging('warn', scope, message, payload);
    },

    error: (scope: string, message: string, payload?: unknown) => {
      logMessaging('error', scope, message, payload);
    },

    metric: (scope: string, metric: string, value: number, payload?: Record<string, unknown>) => {
      logMessagingMetric(scope, metric, value, payload);
    }
  }
};

export const messagingFeatureFlags = {
  isV2Enabled: (): boolean => isMessagingV2Enabled(),
  debugStorageKey: MESSAGING_DEBUG_STORAGE_KEY,
  flagStorageKey: MESSAGING_FLAG_STORAGE_KEY,
};
