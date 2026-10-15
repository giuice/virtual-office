// Replacement for `next/headers` inside the start-route child process (T12
// AC-034 / production-override tests): the request cookies are the session
// cookies the parent sent with the current command. Only the cookie transport
// is replaced; auth.getUser(), RLS, RPCs, and the fake provider are real.
export async function cookies() {
  const current = globalThis.__meetingNotesChildCookies ?? [];
  return {
    getAll: () => current.map(({ name, value }) => ({ name, value })),
    set: () => undefined,
  };
}
