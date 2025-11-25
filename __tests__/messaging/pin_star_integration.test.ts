
// @vitest-environment node
import { vi } from 'vitest';

// Unmock supabase-js to use the real client for integration testing
vi.unmock('@supabase/supabase-js');

import { createClient } from '@supabase/supabase-js';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase/SupabaseMessageRepository';
import { MessageType, MessageStatus } from '@/types/messaging';
import dotenv from 'dotenv';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	throw new Error('Missing Supabase credentials in .env.local');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});
const repository = new SupabaseMessageRepository(supabase);

console.log('Supabase URL:', supabaseUrl);
console.log('Service Key length:', supabaseServiceKey.length);
console.log('Supabase Auth Admin exists:', !!supabase.auth.admin);

describe('Pin and Star Integration Test', () => {
	let conversationId: string;
	let userId: string;
	let messageId: string;

	beforeAll(async () => {
		try {
			// 1. Create a test user
			// Note: We use signUp because admin.createUser might be restricted or require different setup
			// But since we have service role key, we can try admin.createUser first
			const email = `test_pin_star_${Date.now()}@example.com`;
			const password = 'password123';

			const { data: user, error: userError } = await supabase.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
			});

			if (userError) {
				console.error('Error creating user:', userError);
				throw userError;
			}
			if (!user.user) throw new Error('User creation failed');
			userId = user.user.id;
			console.log('Test user created:', userId);

			// 1.1 Wait for trigger to populate public.users, or insert if missing
			// Give the trigger a moment
			await new Promise(resolve => setTimeout(resolve, 1000));

			let publicUserId = userId; // Default to auth ID, but update if found in public.users

			const { data: existingUser } = await supabase
				.from('users')
				.select('id, supabase_uid')
				.or(`email.eq.${email},supabase_uid.eq.${userId}`)
				.single();

			if (existingUser) {
				console.log('User found in public.users:', existingUser.id);
				publicUserId = existingUser.id;
			} else {
				console.log('User not found in public.users, inserting manually...');
				// Note: If we insert manually, we should try to match the schema expectations
				// But since we don't know if ID is auto-generated or not, we'll try to let DB handle ID if possible
				// or generate a new one if it's UUID.
				// Actually, if the trigger failed, we might want to insert with auth ID as supabase_uid
				const { data: newUser, error: publicUserError } = await supabase
					.from('users')
					.insert({
						// id: userId, // Don't force ID if it's auto-generated
						supabase_uid: userId,
						email: email,
						display_name: 'Test User',
						avatar_url: 'https://example.com/avatar.png',
						status: 'online'
					})
					.select()
					.single();

				if (publicUserError) {
					console.error('Error inserting into public.users:', publicUserError);
					throw publicUserError;
				}
				publicUserId = newUser.id;
			}

			// Update userId variable to point to public ID for subsequent tests
			// But keep auth ID if needed? The repository methods likely expect public ID.
			const authUserId = userId;
			userId = publicUserId;
			console.log('Using Public User ID for tests:', userId);

			// 2. Create a conversation
			const { data: conversation, error: convError } = await supabase
				.from('conversations')
				.insert({
					type: 'direct', // or 'group'
					participants: [userId], // Use public ID
				})
				.select()
				.single();

			if (convError) {
				console.error('Error creating conversation:', convError);
				throw convError;
			}
			conversationId = conversation.id;
			console.log('Test conversation created:', conversationId);

			// 3. (Removed) Add user to conversation participants - table does not exist
			// Participants are handled via the array column in conversations table
		} catch (e) {
			console.error('Setup failed:', e);
			throw e;
		}
	});

	afterAll(async () => {
		// Cleanup
		if (conversationId) {
			// Messages and pins/stars should cascade delete or we delete them manually if needed
			// But for now, just deleting conversation might be enough if cascade is set up
			// Or just leave it, it's a test DB
		}
		if (userId) {
			await supabase.auth.admin.deleteUser(userId);
		}
	});

	it('should create a message, pin it, star it, and fetch it with pins/stars', async () => {
		// 1. Create a message
		const message = await repository.create({
			conversationId,
			senderId: userId,
			content: 'Message to be pinned and starred',
			type: MessageType.TEXT,
			status: MessageStatus.SENT,
		});
		messageId = message.id;
		expect(messageId).toBeDefined();

		// 2. Pin the message
		const pin = await repository.pinMessage(messageId, conversationId, userId);
		expect(pin).toBeDefined();
		expect(pin.messageId).toBe(messageId);
		expect(pin.userId).toBe(userId); // pinnedBy

		// 3. Star the message
		const star = await repository.starMessage(messageId, conversationId, userId);
		expect(star).toBeDefined();
		expect(star.messageId).toBe(messageId);
		expect(star.userId).toBe(userId);

		// 4. Fetch message by ID and check pins/stars
		const fetchedMessage = await repository.findById(messageId);
		expect(fetchedMessage).not.toBeNull();
		expect(fetchedMessage?.pins).toHaveLength(1);
		expect(fetchedMessage?.pins?.[0].userId).toBe(userId);
		expect(fetchedMessage?.stars).toHaveLength(1);
		expect(fetchedMessage?.stars?.[0].userId).toBe(userId);

		// 5. Fetch messages by conversation and check pins/stars (bulk fetch)
		const paginatedResult = await repository.findByConversation(conversationId);
		const conversationMessage = paginatedResult.items.find(m => m.id === messageId);
		expect(conversationMessage).toBeDefined();
		expect(conversationMessage?.pins).toHaveLength(1);
		expect(conversationMessage?.stars).toHaveLength(1);
	});

	it('should unpin and unstar the message', async () => {
		// 1. Unpin
		const unpinSuccess = await repository.unpinMessage(messageId, userId);
		expect(unpinSuccess).toBe(true);

		// 2. Unstar
		const unstarSuccess = await repository.unstarMessage(messageId, userId);
		expect(unstarSuccess).toBe(true);

		// 3. Verify removal
		const fetchedMessage = await repository.findById(messageId);
		expect(fetchedMessage?.pins).toHaveLength(0);
		expect(fetchedMessage?.stars).toHaveLength(0);
	});
});
