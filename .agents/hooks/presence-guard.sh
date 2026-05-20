#!/usr/bin/env bash
# Presence Safety Guard Hook
# Blocks the first edit per session to presence/space critical files and
# injects the presence-safety checklist in the host tool's native format.

set -euo pipefail

INPUT="$(cat || true)"
HOST="${PRESENCE_GUARD_HOST:-auto}"
INPUT_FILE="$(mktemp)"
trap 'rm -f "$INPUT_FILE"' EXIT
printf '%s' "$INPUT" > "$INPUT_FILE"

ANALYSIS="$(
  node - "$INPUT_FILE" <<'NODE'
const fs = require('fs');
const path = require('path');

const input = fs.readFileSync(process.argv[2], 'utf8');

let data = {};
try {
  data = JSON.parse(input || '{}');
} catch {
  data = {};
}

const toolInput = data.tool_input ?? data.toolArgs ?? data.input ?? {};
const toolName = String(data.tool_name ?? data.toolName ?? '');
const sessionId = String(data.session_id ?? data.sessionId ?? 'unknown');

const editToolNames = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'apply_patch',
  'edit',
  'create',
  'write',
]);

function addPath(paths, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed.length > 0) paths.add(trimmed);
}

function walkForPaths(value, paths) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walkForPaths(item, paths);
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (/^(file_?path|filePath|path|target_?file|targetFile)$/.test(key)) {
      addPath(paths, nestedValue);
    }
    walkForPaths(nestedValue, paths);
  }
}

function extractPatchPaths(text, paths) {
  if (typeof text !== 'string') return;

  for (const line of text.split(/\r?\n/)) {
    let match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (match) {
      addPath(paths, match[1]);
      continue;
    }

    match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      addPath(paths, match[1]);
      addPath(paths, match[2]);
      continue;
    }

    match = line.match(/^(?:---|\+\+\+) [ab]\/(.+)$/);
    if (match) {
      addPath(paths, match[1]);
    }
  }
}

function collectPaths() {
  const paths = new Set();
  walkForPaths(toolInput, paths);

  if (typeof toolInput === 'string') {
    extractPatchPaths(toolInput, paths);
  }

  extractPatchPaths(toolInput.patch, paths);
  extractPatchPaths(toolInput.diff, paths);
  extractPatchPaths(data.patch, paths);
  extractPatchPaths(data.diff, paths);

  return [...paths];
}

function isPresencePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return [
    /(^|\/)useUserPresence\.ts$/,
    /(^|\/)useLastSpace\.ts$/,
    /(^|\/)PresenceContext\.tsx$/,
    /(^|\/)users\/location\/route\.ts$/,
    /(^|\/)ModernFloorPlan\.tsx$/,
    /(^|\/)floor-plan\/floor-plan\.tsx$/,
  ].some((pattern) => pattern.test(normalized));
}

const candidatePaths = collectPaths();
const presencePaths = candidatePaths.filter(isPresencePath);
const shouldCheckTool = editToolNames.has(toolName);
const blockedPath = presencePaths[0] ?? '';

process.stdout.write(JSON.stringify({
  shouldBlock: shouldCheckTool && blockedPath.length > 0,
  toolName,
  sessionId,
  blockedPath,
  basename: blockedPath ? path.basename(blockedPath) : '',
}));
NODE
)"

node_value() {
  node -e "const d = JSON.parse(process.argv[1]); const v = d[process.argv[2]] ?? ''; process.stdout.write(String(v));" "$ANALYSIS" "$1"
}

SHOULD_BLOCK="$(node_value shouldBlock)"
if [[ "$SHOULD_BLOCK" != "true" ]]; then
  exit 0
fi

SESSION_ID="$(node_value sessionId)"
BLOCKED_PATH="$(node_value blockedPath)"
BASENAME="$(node_value basename)"
SAFE_SESSION_ID="$(printf '%s' "$SESSION_ID" | tr -c 'A-Za-z0-9_.-' '_')"
SAFE_HOST="$(printf '%s' "$HOST" | tr -c 'A-Za-z0-9_.-' '_')"

FLAG_DIR="/tmp/presence-guard-${SAFE_HOST:-auto}"
mkdir -p "$FLAG_DIR"
FLAG_FILE="$FLAG_DIR/${SAFE_SESSION_ID:-unknown}"

if [[ -f "$FLAG_FILE" ]]; then
  exit 0
fi

touch "$FLAG_FILE"

MESSAGE="$(cat <<EOF
PRESENCE SAFETY GUARD ACTIVATED for: $BASENAME

This file is part of the presence/space system, which has 4 interacting sources of truth.

BEFORE proceeding, you MUST:
1. Read the presence-safety skill:
   - Claude: .claude/skills/presence-safety/SKILL.md
   - Codex/Copilot/shared: .agents/skills/presence-safety/SKILL.md
2. Verify your change follows all 5 critical rules
3. Run the checklist at the bottom of the skill

Key rules:
- NEVER clear current_space_id in cleanup/disconnect paths
- Only ONE updateLocation call per user action
- Filter offline users from usersInSpaces (except current user)
- manualChangeRef guard must be preserved in useLastSpace
- Use query-derived values, NOT CompanyContext, for reactive guards

Re-attempt your edit after reviewing the rules.

Blocked path: $BLOCKED_PATH
EOF
)"

case "$HOST" in
  codex)
    node -e 'process.stdout.write(JSON.stringify({ decision: "block", reason: process.argv[1] }));' "$MESSAGE"
    exit 2
    ;;
  copilot)
    node -e 'process.stdout.write(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: process.argv[1] }));' "$MESSAGE"
    exit 0
    ;;
  *)
    printf '%s\n' "$MESSAGE" >&2
    exit 2
    ;;
esac
