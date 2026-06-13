import { NextRequest, NextResponse } from 'next/server';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, requireMessageParticipant } from '@/lib/auth/authorize';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;

    const ctx = await requireMessageParticipant(messageId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(ctx.serviceClient);

    const pin = await messageRepository.pinMessage(messageId, ctx.message.conversationId, ctx.dbUser.id);

    return NextResponse.json({ pin }, { status: 201 });
  } catch (error) {
    console.error('Error pinning message:', error);
    return NextResponse.json(
      { error: 'Failed to pin message' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;

    const ctx = await requireMessageParticipant(messageId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(ctx.serviceClient);

    const success = await messageRepository.unpinMessage(messageId, ctx.dbUser.id);

    if (!success) {
      return NextResponse.json({ message: 'Message unpinned (or was not pinned)' }, { status: 200 });
    }

    return NextResponse.json({ message: 'Message unpinned' }, { status: 200 });
  } catch (error) {
    console.error('Error unpinning message:', error);
    return NextResponse.json(
      { error: 'Failed to unpin message' },
      { status: 500 }
    );
  }
}
