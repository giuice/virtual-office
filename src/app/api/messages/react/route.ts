import { NextRequest, NextResponse } from 'next/server';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, requireMessageParticipant } from '@/lib/auth/authorize';

export async function POST(request: NextRequest) {
  try {
    const { messageId, emoji } = await request.json();

    // Input Validation
    if (!messageId || typeof messageId !== 'string' || !emoji || typeof emoji !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid messageId or emoji' }, { status: 400 });
    }

    const ctx = await requireMessageParticipant(messageId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(ctx.supabase);

    // Fetch the message to check current reaction state
    const message = await messageRepository.findById(messageId);

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Determine if user is adding or removing reaction
    // message.reactions is an array of MessageReaction objects
    const userHasReacted = message.reactions.some(
      (reaction) => reaction.userId === ctx.dbUser.id && reaction.emoji === emoji
    );
    let action: 'added' | 'removed';

    try {
      if (userHasReacted) {
        // User is removing their reaction
        await messageRepository.removeReaction(messageId, ctx.dbUser.id, emoji);
        action = 'removed';
      } else {
        // User is adding a new reaction
        await messageRepository.addReaction(messageId, { userId: ctx.dbUser.id, emoji });
        action = 'added';
      }
    } catch (repoError) {
       console.error(`Repository error during reaction ${userHasReacted ? 'removal' : 'addition'}:`, repoError);
       return NextResponse.json({ error: 'Error processing reaction' }, { status: 500 });
    }

    return NextResponse.json({ message: `Reaction ${action} successfully`, action }, { status: 200 });

  } catch (error) {
    console.error('Error processing reaction request:', error);
    return NextResponse.json({ error: 'Internal Server Error processing reaction request' }, { status: 500 });
  }
}
