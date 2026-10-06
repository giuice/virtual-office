import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Message, MessagePin, MessageStar } from '@/types/messaging';
import { useToast } from '@/components/ui/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import type { MessagesInfiniteData } from '@/lib/messaging/message-cache';
import { starredMessagesQueryKey } from '@/hooks/queries/useStarredMessages';

/** Feed and starred-list caches as they were before an optimistic star change. */
interface StarCachesSnapshot {
	previousData: MessagesInfiniteData | undefined;
	previousStarred: MessagesInfiniteData | undefined;
}

interface UseMessageActionsProps {
	conversationId: string;
}

export function useMessageActions({ conversationId }: UseMessageActionsProps) {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const { currentUserProfile } = useCompany();

	const feedKey = ['messages', conversationId] as const;
	const starredKey = starredMessagesQueryKey(conversationId);

	const mapMessageInPages = (
		oldData: MessagesInfiniteData | undefined,
		messageId: string,
		updater: (message: Message) => Message
	): MessagesInfiniteData | undefined => {
		if (!oldData || !oldData.pages) return oldData;

		return {
			...oldData,
			pages: oldData.pages.map((page) => ({
				...page,
				messages: page.messages.map((msg) => (msg.id === messageId ? updater(msg) : msg)),
			})),
		};
	};

	// Helper to update message in cache
	const updateMessageInCache = (messageId: string, updater: (message: Message) => Message) => {
		queryClient.setQueryData<MessagesInfiniteData>(feedKey, (oldData) =>
			mapMessageInPages(oldData, messageId, updater)
		);
	};

	// The viewer's starred list for this conversation (useStarredMessages).
	const updateMessageInStarredCache = (messageId: string, updater: (message: Message) => Message) => {
		queryClient.setQueryData<MessagesInfiniteData>(starredKey, (oldData) =>
			mapMessageInPages(oldData, messageId, updater)
		);
	};

	const snapshotStarCaches = async (): Promise<StarCachesSnapshot> => {
		await Promise.all([
			queryClient.cancelQueries({ queryKey: feedKey }),
			queryClient.cancelQueries({ queryKey: starredKey }),
		]);
		return {
			previousData: queryClient.getQueryData<MessagesInfiniteData>(feedKey),
			previousStarred: queryClient.getQueryData<MessagesInfiniteData>(starredKey),
		};
	};

	const restoreStarCaches = (snapshot: StarCachesSnapshot | undefined) => {
		queryClient.setQueryData(feedKey, snapshot?.previousData);
		queryClient.setQueryData(starredKey, snapshot?.previousStarred);
	};

	const invalidateStarCaches = () => {
		void queryClient.invalidateQueries({ queryKey: feedKey });
		void queryClient.invalidateQueries({ queryKey: starredKey });
	};

	const pinMessageMutation = useMutation({
		mutationFn: async (messageId: string) => {
			console.log('[useMessageActions] Pinning message:', messageId);
			const response = await fetch(`/api/messages/${messageId}/pin`, {
				method: 'POST',
			});
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.error('[useMessageActions] Pin failed:', response.status, errorData);
				throw new Error(errorData.error || 'Failed to pin message');
			}
			const data = await response.json();
			console.log('[useMessageActions] Pin success:', data);
			return data;
		},
		onMutate: async (messageId) => {
			console.log('[useMessageActions] Optimistic pin update for:', messageId);
			await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
			const previousData = queryClient.getQueryData(['messages', conversationId]);

			// Optimistic update
			updateMessageInCache(messageId, (msg) => {
				const newPin: MessagePin = {
					id: 'temp-pin-' + Date.now(),
					messageId,
					conversationId,
					userId: currentUserProfile?.id || 'unknown',
					pinnedAt: new Date(),
				};
				return {
					...msg,
					pins: [...(msg.pins || []), newPin],
				};
			});

			return { previousData };
		},
		onSuccess: () => {
			toast({
				title: 'Message pinned',
				description: 'The message has been pinned successfully.',
			});
		},
		onError: (err, messageId, context) => {
			console.error('[useMessageActions] Pin error, rolling back:', err);
			queryClient.setQueryData(['messages', conversationId], context?.previousData);
			toast({
				title: 'Error',
				description: err instanceof Error ? err.message : 'Failed to pin message. Please try again.',
				variant: 'destructive',
			});
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
		},
	});

	const unpinMessageMutation = useMutation({
		mutationFn: async (messageId: string) => {
			const response = await fetch(`/api/messages/${messageId}/pin`, {
				method: 'DELETE',
			});
			if (!response.ok) throw new Error('Failed to unpin message');
			return response.json();
		},
		onMutate: async (messageId) => {
			await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
			const previousData = queryClient.getQueryData(['messages', conversationId]);

			// Optimistic update
			updateMessageInCache(messageId, (msg) => ({
				...msg,
				pins: (msg.pins || []).filter((p) => p.userId !== currentUserProfile?.id), // Only remove my pin? Wait, pins are shared.
				// Actually, unpin removes the pin regardless of who pinned it?
				// The API implementation checks if the user is a participant.
				// But the repository `unpinMessage` filters by `pinned_by`.
				// So a user can only remove THEIR OWN pin?
				// Story says "Any member of a conversation can pin a message".
				// And "Any member can unpin a message".
				// But my repo implementation `unpinMessage` uses `eq('pinned_by', userId)`.
				// This means I can only unpin messages I pinned.
				// If the requirement is "Any member can unpin", I need to change the repo implementation.
				// Let's check the story requirements again.
				// "Any member of a conversation can pin a message to the top."
				// "Pinned messages are visible to all members."
				// Usually shared pins can be unpinned by anyone.
				// If so, I need to update the repo to NOT filter by `pinned_by` for unpinning, or allow if admin?
				// For now, I'll assume I can only unpin my own pins or if I implement "unpin any", I need to change repo.
				// Let's assume for now I can only unpin my own pins based on current repo code.
				// Wait, if I pin it, `pinned_by` is me.
				// If someone else pins it, `pinned_by` is them.
				// If I try to unpin someone else's pin, `unpinMessage` with my ID will fail to find the row.
				// So currently, it's "only pinner can unpin".
				// I will stick to this for now unless I see explicit "anyone can unpin" requirement.
				// Re-reading Story 4A.3: "Pinned messages are visible to all members of the conversation."
				// Doesn't explicitly say "anyone can unpin".
				// But usually in apps like Slack/Discord, anyone can unpin.
				// If I want anyone to unpin, I should change `unpinMessage` to delete by `message_id` only (and maybe check conversation membership).
				// But `pinned_messages` table has `pinned_by`.
				// If I delete by `message_id`, it removes the pin.
				// I'll stick to "pinner unpins" for now to be safe, or update repo if I want "anyone unpins".
				// Let's assume "anyone unpins" is better for collaboration.
				// But for now, I'll implement optimistic update removing *the pin* regardless of user, assuming the API will handle it.
				// But wait, if I use `filter(p => p.userId !== currentUserProfile?.id)`, I am only removing MY pin from UI.
				// If I want to remove ANY pin, I should remove all pins? Or find the pin for this message?
				// A message can have multiple pins? No, usually one pin per message.
				// The schema allows multiple pins per message?
				// `upsert(dbData, { onConflict: 'message_id, pinned_by' })`
				// This allows multiple users to pin the SAME message?
				// If so, then "Pinned messages" list would show duplicates?
				// Usually a message is either pinned or not.
				// If multiple users pin it, it's just "pinned".
				// If the schema allows multiple rows, then it's "User A pinned this", "User B pinned this".
				// If I want "Shared Pin" state, usually it's a single boolean or single record.
				// My schema allows multiple.
				// So `message.pins` is an array.
				// If ANYONE pinned it, it's pinned.
				// So `isPinned` = `message.pins.length > 0`.
				// If I unpin, do I remove MY pin?
				// Yes, `unpinMessage` in repo removes `pinned_by` user's pin.
				// So if User A and User B both pinned it, and User A unpins, User B's pin remains?
				// Yes.
				// So the message remains pinned for everyone?
				// Yes.
				// This seems to be "Personalized Pinned Messages" but visible to all?
				// Or "Vote to Pin"?
				// If the requirement is "Shared Pinned Messages", usually one pin is enough.
				// But my implementation allows multiple.
				// I will proceed with "remove my pin".
			}));

			return { previousData };
		},
		onError: (err, messageId, context) => {
			queryClient.setQueryData(['messages', conversationId], context?.previousData);
			toast({
				title: 'Error',
				description: 'Failed to unpin message. Please try again.',
				variant: 'destructive',
			});
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
		},
	});

	const starMessageMutation = useMutation({
		mutationFn: async (messageId: string) => {
			const response = await fetch(`/api/messages/${messageId}/star`, {
				method: 'POST',
			});
			if (!response.ok) throw new Error('Failed to star message');
			return response.json();
		},
		onMutate: async (messageId) => {
			const snapshot = await snapshotStarCaches();
			const newStar: MessageStar = {
				id: 'temp-star-' + Date.now(),
				messageId,
				conversationId,
				userId: currentUserProfile?.id || 'unknown',
				starredAt: new Date(),
			};
			const addStar = (msg: Message): Message => ({
				...msg,
				stars: [...(msg.stars || []), newStar],
			});

			// Optimistic update. A message not yet in the starred list appears
			// there on the next open (the list refetches whenever it opens).
			updateMessageInCache(messageId, addStar);
			updateMessageInStarredCache(messageId, addStar);

			return snapshot;
		},
		onError: (err, messageId, context) => {
			restoreStarCaches(context);
			toast({
				title: 'Erro',
				description: 'Não foi possível favoritar a mensagem. Tente novamente.',
				variant: 'destructive',
			});
		},
		onSettled: () => {
			invalidateStarCaches();
		},
	});

	const unstarMessageMutation = useMutation({
		mutationFn: async (messageId: string) => {
			const response = await fetch(`/api/messages/${messageId}/star`, {
				method: 'DELETE',
			});
			if (!response.ok) throw new Error('Failed to unstar message');
			return response.json();
		},
		onMutate: async (messageId) => {
			const snapshot = await snapshotStarCaches();

			// Optimistic update: the star goes away in the feed, and the message
			// leaves the starred list (stars are personal, so it no longer
			// belongs there).
			updateMessageInCache(messageId, (msg) => ({
				...msg,
				stars: (msg.stars || []).filter((s) => s.userId !== currentUserProfile?.id),
			}));
			queryClient.setQueryData<MessagesInfiniteData>(starredKey, (oldData) => {
				if (!oldData?.pages) return oldData;
				return {
					...oldData,
					pages: oldData.pages.map((page) => ({
						...page,
						messages: page.messages.filter((msg) => msg.id !== messageId),
					})),
				};
			});

			return snapshot;
		},
		onError: (err, messageId, context) => {
			restoreStarCaches(context);
			toast({
				title: 'Erro',
				description: 'Não foi possível remover a mensagem dos favoritos. Tente novamente.',
				variant: 'destructive',
			});
		},
		onSettled: () => {
			invalidateStarCaches();
		},
	});

	return {
		pinMessage: pinMessageMutation.mutate,
		unpinMessage: unpinMessageMutation.mutate,
		starMessage: starMessageMutation.mutate,
		unstarMessage: unstarMessageMutation.mutate,
		isPinning: pinMessageMutation.isPending,
		isUnpinning: unpinMessageMutation.isPending,
		isStarring: starMessageMutation.isPending,
		isUnstarring: unstarMessageMutation.isPending,
	};
}
