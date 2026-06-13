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
    const star = await messageRepository.starMessage(messageId, ctx.message.conversationId, ctx.dbUser.id);

    return NextResponse.json({ star }, { status: 201 });
  } catch (error) {
    console.error('Error starring message:', error);
    return NextResponse.json(
      { error: 'Failed to star message' },
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
    const success = await messageRepository.unstarMessage(messageId, ctx.dbUser.id);

    if (!success) {
      return NextResponse.json({ message: 'Message unstarred (or was not starred)' }, { status: 200 });
    }

    return NextResponse.json({ message: 'Message unstarred' }, { status: 200 });
  } catch (error) {
    console.error('Error unstarring message:', error);
    return NextResponse.json(
      { error: 'Failed to unstar message' },
      { status: 500 }
    );
  }
}
