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
    /(^|\/)useModernFloorPlanKnock\.ts$/,
    /(^|\/)useKnockSignaling\.ts$/,
    /(^|\/)useUserCalling\.ts$/,
    /(^|\/)spaces\/knock\/(request|respond)\/route\.ts$/,
    /(^|\/)presence-utils\.ts$/,
    /(^|\/)SupabaseUserRepository\.ts$/,
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
PRESENCE REMEDIATION GUARD (temporary) for: $BASENAME

This subsystem is under active security remediation. The execution
specification is:

  docs/presence-safety-remediation-handoff-2026-07-09.md

That handoff OVERRIDES the presence-safety skill, the pitfalls guide, and
any older guard rules until remediation completes. Do NOT follow superseded
rules (e.g. preserving manualChangeRef, force-including the current user,
last_active-based authorization) merely because an old doc or test expects
them.

BEFORE proceeding, you MUST:
1. Read the handoff's "Required worker behavior", "Stop conditions", and the
   phase you are working on. Work on ONE numbered phase at a time.
2. Never authorize private access from last_active, users.status, Realtime
   payloads, localStorage, or client time.
3. Never add browser INSERT/UPDATE/DELETE on knock_requests, or new direct
   writers of users.current_space_id / space_presence_log outside the
   inventoried allowlist (docs/presence-remediation/phase-0-writer-caller-inventory-2026-07-10.md).
4. Add the required failing regression test with each fix; never weaken an
   assertion without proving it encoded a bug.
5. Completion is user-gated: report "Status: Pending user confirmation".

Re-attempt your edit after reading the handoff sections above.

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
