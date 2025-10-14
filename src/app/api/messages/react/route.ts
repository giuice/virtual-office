import { NextRequest, NextResponse } from 'next/server';
import { IMessageRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(request: NextRequest) {
  try {
    // Authenticate the user
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    // Get the database user record
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    const userRecord = await userRepository.findBySupabaseUid(user.id);
    if (!userRecord) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(supabase);
    const { messageId, emoji } = await request.json();

    // Input Validation
    if (!messageId || typeof messageId !== 'string' || !emoji || typeof emoji !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid messageId or emoji' }, { status: 400 });
    }

    // Fetch the message to check current reaction state
    const message = await messageRepository.findById(messageId);

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Determine if user is adding or removing reaction
    // message.reactions is an array of MessageReaction objects
    const userHasReacted = message.reactions.some(
      (reaction) => reaction.userId === userRecord.id && reaction.emoji === emoji
    );
    let action: 'added' | 'removed';

    try {
      if (userHasReacted) {
        // User is removing their reaction
        await messageRepository.removeReaction(messageId, userRecord.id, emoji);
        action = 'removed';
      } else {
        // User is adding a new reaction
        await messageRepository.addReaction(messageId, { userId: userRecord.id, emoji });
        action = 'added';
      }
    } catch (repoError) {
       console.error(`Repository error during reaction ${userHasReacted ? 'removal' : 'addition'}:`, repoError);
       return NextResponse.json({ error: 'Error processing reaction' }, { status: 500 });
    }

    console.log(`API: Reaction ${action} for message ${messageId} by user ${userRecord.id}`);
    return NextResponse.json({ message: `Reaction ${action} successfully`, action }, { status: 200 });

  } catch (error) {
    console.error('Error processing reaction request:', error);
    return NextResponse.json({ error: 'Internal Server Error processing reaction request' }, { status: 500 });
  }
}