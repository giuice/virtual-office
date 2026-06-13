// __tests__/messaging/message-cache.test.ts
// Audit B-04 regression suite: realtime inserts must land in page 0 (the
// newest window), dedupe must run across ALL pages, and the optimistic and
// realtime paths must not produce duplicates in either arrival order.
import { describe, expect, it } from 'vitest';
import {
  appendMessageToPages,
  replaceMessageInPages,
  type MessagesInfiniteData,
} from '@/lib/messaging/message-cache';
import { Message, MessageStatus, MessageType } from '@/types/messaging';

const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';

function makeMessage(overrides: Partial<Message> & { id: string }): Message {
  return {
    conversationId: CONVERSATION_ID,
    senderId: 'user-1',
    content: 'hello',
    timestamp: new Date('2026-06-10T12:00:00Z'),
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    reactions: [],
    attachments: [],
    isEdited: false,
    ...overrides,
  };
}

/** Two loaded pages: page 0 = newest window, page 1 = older history. */
function makeMultiPageData(): MessagesInfiniteData {
  return {
    pages: [
      {
        messages: [
          makeMessage({ id: 'new-1', timestamp: new Date('2026-06-10T11:58:00Z') }),
          makeMessage({ id: 'new-2', timestamp: new Date('2026-06-10T11:59:00Z') }),
        ],
        hasMoreOlder: true,
        nextCursorBefore: '2026-06-10T11:58:00Z',
      },
      {
        messages: [
          makeMessage({ id: 'old-1', timestamp: new Date('2026-06-10T10:00:00Z') }),
          makeMessage({ id: 'old-2', timestamp: new Date('2026-06-10T10:01:00Z') }),
        ],
        hasMoreOlder: false,
      },
    ],
    pageParams: [undefined, '2026-06-10T11:58:00Z'],
  };
}

describe('appendMessageToPages', () => {
  it('appends an incoming message to page 0, never the last (oldest) page', () => {
    const incoming = makeMessage({ id: 'incoming-1' });

    const result = appendMessageToPages(makeMultiPageData(), incoming);

    expect(result.pages[0].messages.map((m) => m.id)).toEqual(['new-1', 'new-2', 'incoming-1']);
    expect(result.pages[1].messages.map((m) => m.id)).toEqual(['old-1', 'old-2']);
  });

  it('no-ops when the id already exists in another page (cross-page dedupe)', () => {
    const data = makeMultiPageData();
    const duplicate = makeMessage({ id: 'old-2' });

    const result = appendMessageToPages(data, duplicate);

    expect(result).toBe(data);
  });

  it('replaces a matching optimistic message in place, preserving its attachments', () => {
    const data = makeMultiPageData();
    const attachment = { id: 'att-1', name: 'a.png', url: 'u', type: 'image/png', size: 1 };
    data.pages[0].messages.push(
      makeMessage({
        id: 'temp-123',
        content: 'sent with file',
        status: MessageStatus.SENDING,
        attachments: [attachment as never],
      })
    );
    const saved = makeMessage({ id: 'real-1', content: 'sent with file', attachments: [] });

    const result = appendMessageToPages(data, saved);

    const ids = result.pages.flatMap((p) => p.messages.map((m) => m.id));
    expect(ids).not.toContain('temp-123');
    expect(ids.filter((id) => id === 'real-1')).toHaveLength(1);
    const merged = result.pages[0].messages.find((m) => m.id === 'real-1');
    expect(merged?.attachments).toEqual([attachment]);
  });

  it('does not let a second optimistic send swallow a pending one with identical content', () => {
    const data = makeMultiPageData();
    const first = makeMessage({ id: 'temp-1', content: 'same', status: MessageStatus.SENDING });
    const second = makeMessage({ id: 'temp-2', content: 'same', status: MessageStatus.SENDING });

    const afterFirst = appendMessageToPages(data, first);
    const afterSecond = appendMessageToPages(afterFirst, second);

    const ids = afterSecond.pages[0].messages.map((m) => m.id);
    expect(ids).toContain('temp-1');
    expect(ids).toContain('temp-2');
  });

  it('creates a single-page skeleton when the cache is empty', () => {
    const incoming = makeMessage({ id: 'incoming-1' });

    const result = appendMessageToPages(undefined, incoming);

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].messages.map((m) => m.id)).toEqual(['incoming-1']);
  });
});

describe('replaceMessageInPages', () => {
  it('swaps the optimistic message for the saved one in place', () => {
    const data = makeMultiPageData();
    data.pages[0].messages.push(makeMessage({ id: 'temp-1', status: MessageStatus.SENDING }));
    const saved = makeMessage({ id: 'real-1' });

    const result = replaceMessageInPages(data, 'temp-1', saved);

    const ids = result!.pages[0].messages.map((m) => m.id);
    expect(ids).toEqual(['new-1', 'new-2', 'real-1']);
  });

  it('drops the optimistic copy when realtime already delivered the saved id', () => {
    const data = makeMultiPageData();
    const saved = makeMessage({ id: 'real-1' });
    data.pages[0].messages.push(saved, makeMessage({ id: 'temp-1', status: MessageStatus.SENDING }));

    const result = replaceMessageInPages(data, 'temp-1', saved);

    const ids = result!.pages.flatMap((p) => p.messages.map((m) => m.id));
    expect(ids.filter((id) => id === 'real-1')).toHaveLength(1);
    expect(ids).not.toContain('temp-1');
  });
});
