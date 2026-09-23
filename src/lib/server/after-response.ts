import 'server-only';

import { after } from 'next/server';

export function runAfterResponse(task: () => Promise<void>): void {
  after(task);
}
