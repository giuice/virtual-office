#!/usr/bin/env bash
# supabase-guard — PreToolUse (Edit|Write|MultiEdit)
#
# Blocks the documented Supabase/DB footguns from CLAUDE.md *before* they reach
# disk. These are the project's #1 source of bugs (users.id vs supabase_uid),
# plus leaked service credentials. Exit 2 blocks the edit and shows the reason
# to Claude; warnings are advisory (exit 0). Self-contained; requires jq.
set -uo pipefail

# --- read hook payload from stdin ---
input="$(cat)"
[ -z "${input:-}" ] && exit 0

file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$file" ] && exit 0

# All text being written: Write.content, Edit.new_string, MultiEdit.edits[].new_string
content="$(printf '%s' "$input" | jq -r '
  [ .tool_input.content,
    .tool_input.new_string,
    (.tool_input.edits[]?.new_string)
  ] | map(select(. != null)) | join("\n")
' 2>/dev/null || true)"
[ -z "$content" ] && exit 0

has() { printf '%s' "$content" | grep -Eq "$1"; }

base="$(basename "$file")"
is_env=false; case "$base" in .env|.env.*) is_env=true ;; esac
is_ignored=false; git check-ignore -q "$file" 2>/dev/null && is_ignored=true
is_code=false; case "$file" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.sql) is_code=true ;; esac
is_api=false;  case "$file" in *"/src/app/api/"*|src/app/api/*) is_api=true ;; esac

blocks=()
warns=()

# === BLOCK: secret leaks (only in files that would actually be committed) ===
if [ "$is_env" = false ] && [ "$is_ignored" = false ]; then
  if has 'sbp_[A-Za-z0-9]{20,}'; then
    blocks+=('Hardcoded Supabase access token (sbp_...). Reference ${SUPABASE_ACCESS_TOKEN} from env — never a literal in tracked files.')
  fi
  if has 'SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*["'\''][A-Za-z0-9._-]{20,}'; then
    blocks+=('Hardcoded SUPABASE_SERVICE_ROLE_KEY value. Service-role key is server-only env; never inline, never shipped to the client.')
  fi
fi

# === BLOCK: always-wrong code patterns ===
if [ "$is_code" = true ]; then
  if has '\.id[[:space:]]*=[[:space:]]*auth\.uid\(\)' && ! has 'supabase_uid'; then
    blocks+=('`id = auth.uid()` — auth.uid() matches users.supabase_uid (TEXT), NOT users.id (UUID). Use `supabase_uid = auth.uid()::text`.')
  fi
  if [ "$is_api" = true ] && has 'createSupabaseBrowserClient'; then
    blocks+=('Browser Supabase client in an API route. Use createSupabaseServerClient() from src/lib/supabase/server-client.ts — auth.uid() needs server context or RLS fails.')
  fi
fi

# === WARN: likely-wrong (advisory only) ===
if [ "$is_code" = true ]; then
  has "from\(['\"]profiles['\"]\)" && warns+=("Table 'profiles' does not exist — use 'users'.")
  has 'messages\.room_id'          && warns+=('messages.room_id does not exist — messages link via conversations.room_id.')
  if [ "$is_api" = true ]; then
    has 'getSession\(' && warns+=('getSession() in server/API context — use getUser() (validates the JWT on the Auth server).')
  fi
fi

# === emit ===
if [ "${#blocks[@]}" -gt 0 ]; then
  {
    echo "⛔ supabase-guard blocked this change → $file"
    for b in "${blocks[@]}"; do echo "  • $b"; done
    for w in "${warns[@]}"; do echo "  ⚠ $w"; done
    echo "Ref: CLAUDE.md › Database (User ID vs Supabase UID) + Supabase & RLS."
  } >&2
  exit 2
fi

if [ "${#warns[@]}" -gt 0 ]; then
  {
    echo "⚠ supabase-guard — verify before relying on this change → $file"
    for w in "${warns[@]}"; do echo "  • $w"; done
  } >&2
fi
exit 0
