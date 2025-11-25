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

		// Star the message
		const star = await messageRepository.starMessage(messageId, message.conversationId, userRecord.id);

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

		// Unstar the message
		const success = await messageRepository.unstarMessage(messageId, userRecord.id);

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
