
import { describe, it, expect } from 'vitest';

// Mock types
interface Message {
	id: string;
	content: string;
	timestamp: Date;
}

interface Page {
	messages: Message[];
	nextCursorBefore?: string;
}

describe('Pagination Logic Reproduction', () => {
	it('should demonstrate the ordering bug in flatMap', () => {
		// Page 0: Newest messages (e.g., Today)
		const page0: Page = {
			messages: [
				{ id: '3', content: 'Msg 3', timestamp: new Date('2023-01-01T12:00:00Z') },
				{ id: '4', content: 'Msg 4', timestamp: new Date('2023-01-01T13:00:00Z') },
			]
		};

		// Page 1: Older messages (e.g., Yesterday)
		const page1: Page = {
			messages: [
				{ id: '1', content: 'Msg 1', timestamp: new Date('2023-01-01T10:00:00Z') },
				{ id: '2', content: 'Msg 2', timestamp: new Date('2023-01-01T11:00:00Z') },
			]
		};

		const data = { pages: [page0, page1] };

		// Current logic in useMessages.ts (FIXED)
		const flattened = [...data.pages].reverse().flatMap((p) => p.messages);

		// Expected: [Msg 1, Msg 2, Msg 3, Msg 4] (Chronological)
		// Actual (Current Bug): [Msg 3, Msg 4, Msg 1, Msg 2]

		const ids = flattened.map(m => m.id);
		console.log('Flattened IDs:', ids);

		// We expect the CORRECT order now
		expect(ids).toEqual(['1', '2', '3', '4']);

	});

	it('should demonstrate the addMessage bug', () => {
		// Initial State: Page 0 (Newest) and Page 1 (Older)
		const page0: Page = {
			messages: [
				{ id: '3', content: 'Msg 3', timestamp: new Date('2023-01-01T12:00:00Z') },
				{ id: '4', content: 'Msg 4', timestamp: new Date('2023-01-01T13:00:00Z') },
			]
		};
		const page1: Page = {
			messages: [
				{ id: '1', content: 'Msg 1', timestamp: new Date('2023-01-01T10:00:00Z') },
				{ id: '2', content: 'Msg 2', timestamp: new Date('2023-01-01T11:00:00Z') },
			]
		};

		const oldData = { pages: [page0, page1] };

		// New message
		const newMessage: Message = { id: '5', content: 'Msg 5', timestamp: new Date('2023-01-01T14:00:00Z') };

		// Current logic in useMessages.ts (addMessage / sendMessage) (FIXED)
		const updatedPages = [...oldData.pages];
		// Target: 0 (Page 0, the NEWEST page)
		updatedPages[0] = {
			...updatedPages[0],
			messages: [...updatedPages[0].messages, newMessage],
		};

		// Flatten to see result
		const flattened = [...updatedPages].reverse().flatMap((p) => p.messages);
		const ids = flattened.map(m => m.id);
		console.log('After Add IDs:', ids);

		// Expected: [1, 2, 3, 4, 5]
		// Actual (Current Bug): [3, 4, 1, 2, 5] (Added to the end of the OLDER page)

		// We expect the CORRECT order now
		expect(ids).toEqual(['1', '2', '3', '4', '5']);

	});
});
