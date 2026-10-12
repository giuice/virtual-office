/**
 * Phase 5 T24 — strict parser for the LOCAL messaging test database URL.
 *
 * The E2E fixtures connect to Postgres as a superuser and delete test state, so
 * the target must be the loopback Supabase CLI database. Validating a URL with
 * one parser and connecting with another is unsafe (a URL such as
 * `postgresql://u:p@127.0.0.1\@example.invalid:54322/db` looks loopback to the
 * WHATWG URL parser but `pg` connects to example.invalid). So this module
 * accepts only one plain shape and returns explicit connection fields; callers
 * pass those fields to `pg` (never the URL itself):
 *
 *   postgres[ql]://<user>:<password>@<127.0.0.1 | localhost | [::1]>:<port>/<database>
 *
 * Refused: an empty password (pg would fall back to PGPASSWORD/.pgpass),
 * backslashes, any query string or fragment, multiple hosts (comma lists),
 * Unix-socket forms, percent-encoding outside the password, and any host other
 * than the three loopback spellings. Self-contained (no imports).
 */
export interface LocalDbConnectionConfig {
  host: '127.0.0.1' | 'localhost' | '::1';
  port: number;
  user: string;
  password: string;
  database: string;
}

const LOCAL_DB_URL_PATTERN =
  /^postgres(?:ql)?:\/\/([A-Za-z0-9_.-]{1,63}):([A-Za-z0-9_.~!$&'()*+;=%-]{1,256})@(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})\/([A-Za-z0-9_-]{1,63})$/;

export function parseLoopbackDatabaseUrl(url: string): LocalDbConnectionConfig {
  const refuse = (reason: string): never => {
    throw new Error(`Refusing the messaging test database URL (${reason}); only a plain loopback URL is accepted.`);
  };
  if (/[\\\s,?#]/.test(url)) {
    refuse('backslash, whitespace, comma, query string or fragment');
  }
  const match = LOCAL_DB_URL_PATTERN.exec(url);
  if (!match) {
    return refuse('not postgres[ql]://user:password@<loopback>:<port>/<database>');
  }
  const [, user, encodedPassword, rawHost, rawPort, database] = match;
  let password: string;
  try {
    password = decodeURIComponent(encodedPassword);
  } catch {
    return refuse('malformed percent-encoding in the password');
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return refuse('invalid port');
  }
  const host = rawHost === '[::1]' ? '::1' : (rawHost as '127.0.0.1' | 'localhost');
  return { host, port, user, password, database };
}
