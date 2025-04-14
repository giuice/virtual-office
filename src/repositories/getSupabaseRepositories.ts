// src/repositories/getSupabaseRepositories.ts
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { SupabaseUserRepository, SupabaseMessageRepository, SupabaseConversationRepository, SupabaseSpaceRepository, SupabaseCompanyRepository, SupabaseAnnouncementRepository, SupabaseInvitationRepository, SupabaseMeetingNoteRepository } from './implementations/supabase';
import { IAnnouncementRepository, ICompanyRepository, IInvitationRepository, IMeetingNoteRepository, ISpaceRepository, IUserRepository } from './interfaces';
import { SupabaseMeetingNoteActionItemRepository } from './implementations/supabase/SupabaseMeetingNoteActionItemRepository';

// Factory to create and return repository instances
export async function getSupabaseRepositories(): Promise<{
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
  userRepository: IUserRepository;
  spaceRepository: ISpaceRepository;
  companyRepository: ICompanyRepository;
  announcementRepository: IAnnouncementRepository;
  meetingNoteRepository: IMeetingNoteRepository;
  invitationRepository: IInvitationRepository;
  meetingNoteActionItemRepository: SupabaseMeetingNoteActionItemRepository;
}> {
  // Create instances of the repositories
  const messageRepository = new SupabaseMessageRepository();
  const conversationRepository = new SupabaseConversationRepository();
  const userRepository = new SupabaseUserRepository();
  const spaceRepository = new SupabaseSpaceRepository();
  const companyRepository = new SupabaseCompanyRepository();
  const announcementRepository = new SupabaseAnnouncementRepository();
  const meetingNoteRepository = new SupabaseMeetingNoteRepository();
  const invitationRepository = new SupabaseInvitationRepository();
  const meetingNoteActionItemRepository = new SupabaseMeetingNoteActionItemRepository();
  
  return {
    messageRepository,
    conversationRepository,
    userRepository,
    spaceRepository,
    companyRepository,
    announcementRepository,
    meetingNoteRepository,
    invitationRepository,
    meetingNoteActionItemRepository,
  };
}
