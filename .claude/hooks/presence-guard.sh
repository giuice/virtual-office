#!/bin/bash
# Presence Safety Guard Hook
# Triggers on PreToolUse for Edit/Write to presence-related files.
# First encounter per session: blocks the edit and injects safety rules.
# Subsequent encounters: allows silently (rules already in context).

set -e

INPUT=$(cat)

# Parse JSON without jq — extract values using grep + sed
extract_json_string() {
  echo "$INPUT" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed "s/\"$1\"[[:space:]]*:[[:space:]]*\"//" | sed 's/"$//' | head -1
}

FILE_PATH=$(extract_json_string "file_path")
TOOL_NAME=$(extract_json_string "tool_name")
SESSION_ID=$(extract_json_string "session_id")

# Default session ID if not found
SESSION_ID="${SESSION_ID:-unknown}"

# Only check Edit and Write tools
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

# Exit early if no file path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Presence-related file patterns
IS_PRESENCE_FILE=false

case "$FILE_PATH" in
  *useUserPresence.ts)    IS_PRESENCE_FILE=true ;;
  *useLastSpace.ts)       IS_PRESENCE_FILE=true ;;
  *PresenceContext.tsx)    IS_PRESENCE_FILE=true ;;
  *users/location/route.ts) IS_PRESENCE_FILE=true ;;
  *ModernFloorPlan.tsx)   IS_PRESENCE_FILE=true ;;
  *floor-plan/floor-plan.tsx) IS_PRESENCE_FILE=true ;;
esac

if [[ "$IS_PRESENCE_FILE" != "true" ]]; then
  exit 0
fi

# Session-scoped flag: only block once per session
FLAG_DIR="/tmp/claude-presence-guard"
mkdir -p "$FLAG_DIR"
FLAG_FILE="$FLAG_DIR/$SESSION_ID"

if [[ -f "$FLAG_FILE" ]]; then
  # Rules already loaded this session — allow the edit
  exit 0
fi

# First time this session — create flag and block with safety message
touch "$FLAG_FILE"

BASENAME=$(basename "$FILE_PATH")

cat >&2 << EOF
PRESENCE SAFETY GUARD ACTIVATED for: $BASENAME

This file is part of the presence/space system which has 4 interacting sources of truth.
The presence-safety skill has been loaded with the full rules.

BEFORE proceeding, you MUST:
1. Read the presence-safety skill (it's in .claude/skills/presence-safety/SKILL.md)
2. Verify your change follows all 5 critical rules
3. Run the checklist at the bottom of the skill

Key rules:
- NEVER clear current_space_id in cleanup/disconnect paths
- Only ONE updateLocation call per user action
- Filter offline users from usersInSpaces (except current user)
- manualChangeRef guard must be preserved in useLastSpace
- Use query-derived values, NOT CompanyContext, for reactive guards

Re-attempt your edit after reviewing the rules.
EOF

exit 2
