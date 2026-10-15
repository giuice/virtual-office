// src/lib/meeting-notes/request-origin.ts
// Cross-origin request guard of the mutating meeting-notes routes (Phase 6,
// block C review C-3). SameSite=Lax session cookies are still sent by a
// sibling origin of the same site (another subdomain), which can submit a
// credentialed form or multipart POST without any preflight. Every mutating
// meeting-notes route therefore refuses a request that a browser marks as
// coming from another origin:
//   * Sec-Fetch-Site `cross-site` or `same-site` → refused (browser-set; a page
//     cannot forge it). `same-origin` and `none` (user-initiated) continue.
//   * Origin present → it must be the app's own origin: the request's Host
//     (or X-Forwarded-Host, which Next.js fills from Host), the request URL's
//     origin, or NEXT_PUBLIC_APP_URL. `null` or an unparsable Origin is refused.
//   * Neither header → allowed. Browsers send Origin on every POST/PUT/PATCH/
//     DELETE fetch and form submission, so a cross-origin browser request
//     always carries one; a request without both comes from a non-browser
//     client (server-to-server, tests), which holds no victim's cookies.
// Host/X-Forwarded-Host are trusted because Next.js builds request.url from
// its own listen address, not the public host. A forged value cannot help an
// attacking PAGE (a non-safelisted header triggers a CORS preflight these
// routes never approve); a non-browser client can forge it, but such a client
// holds no victim's cookies and is not what this guard defends against.
import 'server-only';

const REFUSED_FETCH_SITES: ReadonlySet<string> = new Set(['cross-site', 'same-site']);

function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** First value of a possibly comma-separated forwarding header, lower-cased. */
function firstHost(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim().toLowerCase();
  return first ? first : null;
}

function isOwnOrigin(request: Request, origin: string): boolean {
  const parsed = originOf(origin);
  if (!parsed) return false;
  if (parsed === originOf(request.url)) return true;
  if (parsed === originOf(process.env.NEXT_PUBLIC_APP_URL)) return true;
  const host = new URL(parsed).host.toLowerCase();
  return host === firstHost(request.headers.get('host')) || host === firstHost(request.headers.get('x-forwarded-host'));
}

/** True when a browser marked the request as coming from another origin. */
export function isCrossOriginMeetingNoteRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite && REFUSED_FETCH_SITES.has(fetchSite)) return true;
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  return !isOwnOrigin(request, origin);
}
