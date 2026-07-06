#!/usr/bin/env bash
# lint-on-edit — PostToolUse (Edit|Write|MultiEdit)
#
# Runs `eslint --fix` on the single file just edited: auto-fixes what it can and
# surfaces remaining errors to Claude (exit 2) so they are corrected immediately
# instead of surfacing later at `npm run build`. Scoped to one file to stay
# token-cheap. No-ops when no eslint config is present. Requires jq.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# eslint config must exist, else no-op silently
if [ ! -f "$ROOT/eslint.config.mjs" ] && [ ! -f "$ROOT/eslint.config.js" ] \
   && [ ! -f "$ROOT/eslint.config.cjs" ] && [ ! -f "$ROOT/eslint.config.ts" ] \
   && [ ! -f "$ROOT/.eslintrc" ] && [ ! -f "$ROOT/.eslintrc.json" ] \
   && [ ! -f "$ROOT/.eslintrc.cjs" ] && [ ! -f "$ROOT/.eslintrc.js" ]; then
  exit 0
fi

input="$(cat)"
[ -z "${input:-}" ] && exit 0
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$file" ] && exit 0

# only lint JS/TS sources
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac
# skip generated / vendored paths
case "$file" in
  *node_modules/*|*/.next/*|*/dist/*|*/build/*|*/coverage/*) exit 0 ;;
esac
[ -f "$file" ] || exit 0

cd "$ROOT" || exit 0
if [ -x "$ROOT/node_modules/.bin/eslint" ]; then
  out="$("$ROOT/node_modules/.bin/eslint" --fix --format stylish "$file" 2>&1)"; status=$?
else
  out="$(npx --no-install eslint --fix --format stylish "$file" 2>&1)"; status=$?
fi

if [ "$status" -ne 0 ]; then
  {
    echo "eslint reported unresolved problems in $file (auto-fixable issues were already fixed):"
    printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | head -n 60
    echo "→ Fix the remaining lint errors above."
  } >&2
  exit 2
fi
exit 0
