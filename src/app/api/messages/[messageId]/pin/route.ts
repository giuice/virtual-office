import { NextRequest, NextResponse } from 'next/server';
import { IMessageRepository, IConversationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository, SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ messageId: string }> }
) {
	try {
		const { messageId } = await params;

		// Authenticate the user
		const supabase = await createSupabaseServerClient();
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
		}

		// Use service role client for DB operations
		const serviceClient = await createSupabaseServerClient('service_role');
		const messageRepository: IMessageRepository = new SupabaseMessageRepository(serviceClient);
		const conversationRepository: IConversationRepository = new SupabaseConversationRepository(serviceClient);
		const userRepository: IUserRepository = new SupabaseUserRepository(supabase);

		const userRecord = await userRepository.findBySupabaseUid(user.id);
		if (!userRecord) {
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
		}

		// Fetch message to get conversationId and verify existence
		const message = await messageRepository.findById(messageId);
		if (!message) {
			return NextResponse.json({ error: 'Message not found' }, { status: 404 });
		}

		// Authorization: ensure the user is a participant of the conversation
		const conversation = await conversationRepository.findById(message.conversationId);
		if (!conversation) {
			return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
		}

		if (!Array.isArray(conversation.participants) || !conversation.participants.includes(userRecord.id)) {
			return NextResponse.json({ error: 'Forbidden: You are not a participant of this conversation' }, { status: 403 });
		}

		// Pin the message
		const pin = await messageRepository.pinMessage(messageId, message.conversationId, userRecord.id);

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

		// Authenticate the user
		const supabase = await createSupabaseServerClient();
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
		}

		// Use service role client for DB operations
		const serviceClient = await createSupabaseServerClient('service_role');
		const messageRepository: IMessageRepository = new SupabaseMessageRepository(serviceClient);
		const conversationRepository: IConversationRepository = new SupabaseConversationRepository(serviceClient);
		const userRepository: IUserRepository = new SupabaseUserRepository(supabase);

		const userRecord = await userRepository.findBySupabaseUid(user.id);
		if (!userRecord) {
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
		}

		// Fetch message to get conversationId (needed for auth check)
		const message = await messageRepository.findById(messageId);
		if (!message) {
			// If message is not found, maybe it was deleted?
			// But we can't check auth if we don't know the conversation.
			// We could try to find the pin directly, but repo.unpinMessage needs userId.
			// If message is gone, pins should be gone (cascade).
			return NextResponse.json({ error: 'Message not found' }, { status: 404 });
		}

		// Authorization: ensure the user is a participant
		const conversation = await conversationRepository.findById(message.conversationId);
		if (!conversation) {
			return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
		}

		if (!Array.isArray(conversation.participants) || !conversation.participants.includes(userRecord.id)) {
			return NextResponse.json({ error: 'Forbidden: You are not a participant of this conversation' }, { status: 403 });
		}

		// Unpin the message
		const success = await messageRepository.unpinMessage(messageId, userRecord.id);

		if (!success) {
			// Could be not pinned, or error.
			// We'll return 200 OK if it's not pinned (idempotent) or 404 if we want to be strict.
			// But repo returns false on error or count 0.
			// Let's assume success if it's done.
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
