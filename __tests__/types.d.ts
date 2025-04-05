// __tests__/types.d.ts
import type { Conversation, FileAttachment, Message, MessageStatus } from '@/types/messaging';
import type { SupabaseClient } from '@supabase/supabase-js';

// Extend the global namespace for Jest
declare global {
  // Extend the jest namespace
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledWith(expected: any): R;
    }
    
    // Add jest.fn() type
    function fn<T extends (...args: any[]) => any>(
      implementation?: T
    ): jest.MockInstance<ReturnType<T>, Parameters<T>>;
    
    // Add jest.resetAllMocks() type
    function resetAllMocks(): void;
    
    // Add MockInstance type
    interface MockInstance<TReturn, TArgs extends any[]> {
      new (...args: TArgs): TReturn;
      (...args: TArgs): TReturn;
      mockImplementation(fn: (...args: TArgs) => TReturn): this;
      mockImplementationOnce(fn: (...args: TArgs) => TReturn): this;
      mockReturnValue(value: TReturn): this;
      mockReturnValueOnce(value: TReturn): this;
    }
  }
  
  // Add test and describe functions
  function describe(name: string, fn: () => void): void;
  function test(name: string, fn: () => void | Promise<void>, timeout?: number): void;
  function expect<T>(actual: T): jest.Matchers<void>;
  function beforeEach(fn: () => void | Promise<void>): void;
  
  // Extend fetch for mocking
  var fetch: jest.Mock;
}

// Mock types for repositories
interface MockMessageRepository {
  findById: jest.Mock;
  addAttachment: jest.Mock;
  updateStatus: jest.Mock;
}

interface MockConversationRepository {
  setArchiveStatus: jest.Mock;
  markAsRead: jest.Mock;
}

// Export types for use in tests
export {
  MockMessageRepository,
  MockConversationRepository
};
