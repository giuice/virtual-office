#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PRESENCE_GUARD_HOST=claude bash "$ROOT/.agents/hooks/presence-guard.sh"
