// vitest.setup.ts
import '@testing-library/react';
import { vi, expect } from 'vitest';

// Mock Supabase client for realtime testing
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn().mockReturnValue({
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      }),
      getChannels: vi.fn().mockReturnValue([]),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'test-user-id' }
            }
          },
          error: null
        })
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'test-user-id',
            current_space_id: 'test-space-id',
            company_id: 'test-company-id'
          },
          error: null
        })
      })
    })
  };
});

// Mock FormData
class MockFormData {
  private data: Record<string, any> = {};

  append(key: string, value: any) {
    this.data[key] = value;
  }

  get(key: string) {
    return this.data[key];
  }

  getAll() {
    return Object.values(this.data);
  }
}

// Mock web APIs needed for testing Next.js API routes
if (typeof global.FormData === 'undefined') {
  (global as any).FormData = MockFormData;
}

// Mock fetch API
if (typeof global.fetch === 'undefined') {
  (global as any).fetch = vi.fn();
}

// Mock Request API
class MockRequest {
  url: string;
  method: string;
  headers: Headers;
  body: any;

  constructor(input: string, init?: any) {
    this.url = input;
    this.method = init?.method || 'GET';
    this.headers = new Headers(init?.headers || {});
    this.body = init?.body || null;
  }
}

// Mock Response API
class MockResponse {
  body: any;
  status: number;
  statusText: string;
  headers: Headers;
  _bodyInit: any;

  constructor(body: any, init: any = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.statusText = init.statusText || '';
    this.headers = new Headers(init.headers || {});
    this._bodyInit = body;
  }

  json() {
    if (typeof this.body === 'string') {
      return Promise.resolve(JSON.parse(this.body));
    }
    return Promise.resolve(this.body);
  }

  text() {
    return Promise.resolve(this.body);
  }
}

// Mock Headers API
class MockHeaders {
  private headers: Record<string, string> = {};

  constructor(init: Record<string, string> = {}) {
    if (init) {
      Object.keys(init).forEach(key => {
        this.headers[key.toLowerCase()] = init[key];
      });
    }
  }

  get(name: string) {
    return this.headers[name.toLowerCase()];
  }

  set(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  append(name: string, value: string) {
    const key = name.toLowerCase();
    this.headers[key] = this.headers[key] ? `${this.headers[key]}, ${value}` : value;
  }

  delete(name: string) {
    delete this.headers[name.toLowerCase()];
  }

  has(name: string) {
    return this.headers.hasOwnProperty(name.toLowerCase());
  }
}

// Add mocks to global scope if not defined
if (typeof global.Request === 'undefined') {
  (global as any).Request = MockRequest;
}

if (typeof global.Response === 'undefined') {
  (global as any).Response = MockResponse;
}

if (typeof global.Headers === 'undefined') {
  (global as any).Headers = MockHeaders;
}

// Mock NextResponse for Next.js API routes
vi.mock('next/server', () => {
  return {
    NextResponse: {
      json: (data: any, init?: ResponseInit) => {
        return new MockResponse(JSON.stringify(data), init);
      },
    },
  };
});

// Mock createRouteHandlerClient for Supabase
vi.mock('@supabase/auth-helpers-nextjs', () => {
  return {
    createRouteHandlerClient: vi.fn().mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { participants: ['user-db-456'] } }),
      }),
    }),
  };
});

// Mock session validation
vi.mock('@/lib/auth/session', () => {
  return {
    validateUserSession: vi.fn().mockResolvedValue({
      userId: 'user-123',
      userDbId: 'user-db-456',
      error: null,
    }),
  };
});

// Mock repositories
vi.mock('@/repositories/getSupabaseRepositories', () => {
  return {
    getSupabaseRepositories: vi.fn().mockResolvedValue({
      messageRepository: {
        findById: vi.fn().mockResolvedValue({
          id: 'message-123',
          conversationId: 'conversation-123',
          senderId: 'user-123',
          content: 'Test message',
          attachments: [],
          reactions: [],
        }),
        addAttachment: vi.fn().mockResolvedValue({
          id: 'attachment-123',
          name: 'test.jpg',
          type: 'image/jpeg',
          size: 1024,
          url: 'https://example.com/test.jpg',
          thumbnailUrl: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(true),
      },
    }),
  };
});
