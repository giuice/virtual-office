// __tests__/e2e/utils/realtime-helpers.ts
// Base test utilities for realtime assertions in E2E tests

import { Page } from '@playwright/test';

/**
 * Wait for a realtime message to appear in the drawer
 * Uses page.waitForFunction for deterministic assertions
 */
export async function waitForMessageDelivery(
  page: Page,
  expectedContent: string,
  timeout = 3000
): Promise<void> {
  await page.waitForFunction(
    (content) => {
      // Check if message appears in the messaging drawer
      const messages = document.querySelectorAll('[data-message-content]');
      return Array.from(messages).some(msg =>
        msg.textContent?.includes(content)
      );
    },
    expectedContent,
    { timeout }
  );
}

/**
 * Wait for conversation to appear in drawer list
 */
export async function waitForConversationInList(
  page: Page,
  conversationName: string,
  timeout = 3000
): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const conversations = document.querySelectorAll('[data-conversation-name]');
      return Array.from(conversations).some(conv =>
        conv.textContent?.includes(name)
      );
    },
    conversationName,
    { timeout }
  );
}

/**
 * Wait for drawer state change (open/closed)
 */
export async function waitForDrawerState(
  page: Page,
  isOpen: boolean,
  timeout = 3000
): Promise<void> {
  await page.waitForFunction(
    (open) => {
      const drawer = document.querySelector('[data-drawer]');
      if (!drawer) return !open; // If no drawer element, it's closed
      const state = drawer.getAttribute('data-state');
      return open ? (state === 'open' || state === 'minimized') : false;
    },
    isOpen,
    { timeout }
  );
}

/**
 * Poll API for message delivery as fallback
 */
export async function pollForMessageViaAPI(
  conversationId: string,
  expectedContent: string,
  timeout = 3000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (response.ok) {
        const messages = await response.json();
        if (messages.some((msg: any) => msg.content.includes(expectedContent))) {
          return true;
        }
      }
    } catch (error) {
      // Continue polling
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return false;
}

/**
 * Combined realtime assertion with fallback
 */
export async function assertRealtimeMessageDelivery(
  page: Page,
  expectedContent: string,
  conversationId?: string
): Promise<void> {
  try {
    await waitForMessageDelivery(page, expectedContent);
  } catch (error) {
    if (conversationId) {
      const delivered = await pollForMessageViaAPI(conversationId, expectedContent);
      if (!delivered) {
        throw new Error(`Message "${expectedContent}" not delivered within timeout`);
      }
    } else {
      throw error;
    }
  }
}