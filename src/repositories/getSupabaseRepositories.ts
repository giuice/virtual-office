// src/repositories/getSupabaseRepositories.ts
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import type { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import type { ICompanyRepository, ISpaceRepository, IUserRepository } from './interfaces';
import type { SupabaseClient } from '@supabase/supabase-js';

// Factory to create and return repository instances (only those needed by API routes)
export async function getSupabaseRepositories(supabase: SupabaseClient): Promise<{
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
  userRepository: IUserRepository;
  spaceRepository: ISpaceRepository;
  companyRepository: ICompanyRepository;
}> {
  // Lazy-load ONLY the implementations needed to avoid test-time side effects
  const [
    { SupabaseMessageRepository },
    { SupabaseConversationRepository },
    { SupabaseUserRepository },
    { SupabaseSpaceRepository },
    { SupabaseCompanyRepository }
  ] = await Promise.all([
    import('./implementations/supabase/SupabaseMessageRepository'),
    import('./implementations/supabase/SupabaseConversationRepository'),
    import('./implementations/supabase/SupabaseUserRepository'),
    import('./implementations/supabase/SupabaseSpaceRepository'),
    import('./implementations/supabase/SupabaseCompanyRepository'),
  ]);

  const messageRepository: IMessageRepository = new SupabaseMessageRepository(supabase);
  const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);
  const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(supabase);
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(supabase);

  return {
    messageRepository,
    conversationRepository,
    userRepository,
    spaceRepository,
    companyRepository,
  };
}
