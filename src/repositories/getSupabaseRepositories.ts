// src/repositories/getSupabaseRepositories.ts
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase/SupabaseMessageRepository';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase/SupabaseConversationRepository';
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';

// Factory to create and return repository instances
export async function getSupabaseRepositories(): Promise<{
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
}> {
  // Create instances of the repositories
  const messageRepository = new SupabaseMessageRepository();
  const conversationRepository = new SupabaseConversationRepository();
  
  return {
    messageRepository,
    conversationRepository
  };
}
