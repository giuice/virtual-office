// src/lib/test-utils/e2e-query-cache-probe.ts
// E2E-only probe of the TanStack caches (Phase 6 AC-017; block B review B-1):
// answers whether a given text occurs anywhere in the QueryCache or the
// MutationCache (keys and whole states: data, variables, onMutate results,
// errors and failure reasons, as name + message). It
// returns a boolean only and never exposes cache contents.
//
// Installed by QueryProvider only when NEXT_PUBLIC_E2E === 'true', which only
// the meeting-notes Playwright runner sets (playwright.meeting-notes.config.ts).
// Next inlines NEXT_PUBLIC_* at build time, so in a production build without
// that variable the install branch is the constant `undefined === 'true'` and
// the probe is never reachable.
import type { QueryClient } from '@tanstack/react-query';

export const E2E_QUERY_CACHE_PROBE = '__voE2eQueryCacheContains';

type ProbeWindow = Window & { [E2E_QUERY_CACHE_PROBE]?: (needle: string) => boolean };

/** JSON of `value` with cycles cut and errors reduced to their name and message. */
function serialize(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, entry: unknown) => {
      if (entry instanceof Error) return { name: entry.name, message: entry.message };
      if (entry !== null && typeof entry === 'object') {
        if (seen.has(entry)) return undefined;
        seen.add(entry);
      }
      return entry;
    }) ?? '';
  } catch {
    return '';
  }
}

function cacheContains(queryClient: QueryClient, needle: string): boolean {
  if (needle.length === 0) return false;
  for (const query of queryClient.getQueryCache().getAll()) {
    if (serialize({ key: query.queryKey, state: query.state }).includes(needle)) return true;
  }
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (serialize({ key: mutation.options.mutationKey, state: mutation.state }).includes(needle)) return true;
  }
  return false;
}

/** Installs the probe on `window`; returns the uninstaller. */
export function installE2EQueryCacheProbe(queryClient: QueryClient): () => void {
  const target = window as ProbeWindow;
  target[E2E_QUERY_CACHE_PROBE] = (needle: string) => cacheContains(queryClient, needle);
  return () => {
    delete target[E2E_QUERY_CACHE_PROBE];
  };
}
