// src/repositories/getSupabaseRepositories.ts
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { SupabaseUserRepository, SupabaseMessageRepository, SupabaseConversationRepository } from './implementations/supabase';
import { IUserRepository } from './interfaces';

// Factory to create and return repository instances
export async function getSupabaseRepositories(): Promise<{
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
  userRepository: IUserRepository;
  spaceRepository: IUserRepository;
  companyRepository: IUserRepository;
  announcementRepository: IUserRepository;
  meetingNoteRepository: IUserRepository;
  invitationRepository: IUserRepository;
}> {
  // Create instances of the repositories
  const messageRepository = new SupabaseMessageRepository();
  const conversationRepository = new SupabaseConversationRepository();
  const userRepository = new SupabaseUserRepository();
  const spaceRepository = new SupabaseUserRepository();
  const companyRepository = new SupabaseUserRepository();
  const announcementRepository = new SupabaseUserRepository();
  const meetingNoteRepository = new SupabaseUserRepository();
  const invitationRepository = new SupabaseUserRepository();
  
  return {
    messageRepository,
    conversationRepository,
    userRepository,
    spaceRepository,
    companyRepository,
    announcementRepository,
    meetingNoteRepository,
    invitationRepository,
  };
}
