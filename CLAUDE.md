# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Guidelines
- **AVATAR SYSTEM PRIORITY #1**: Consolidate usage to canonical components only:
  - `EnhancedAvatarV2` (src/components/ui/enhanced-avatar-v2.tsx) - use for display
  - `UploadableAvatar` (src/components/profile/UploadableAvatar.tsx) - use for uploads
  - Never create new avatar components without checking all 11 existing implementations
- **MESSAGING STANDARDIZATION**: Use PascalCase component names (MessageList, ConversationList), not kebab-case
- **DUPLICATION PREVENTION**: Always search these areas before creating:
  - Components: `src/components/*/`
  - Hooks: `src/hooks/*/`
  - Repositories: `src/repositories/*`
  - Utilities: `src/lib/*/` and `src/utils/*/`

## Common Commands
- `npm run dev`: Start development server
- `npm run build`: Production build
- `npm run lint`: Run ESLint
- `npm run test`: Unit tests (excl. Playwright API tests)
- `npm run test:api`: Playwright API tests
- `npm run test:all`: All tests

## Architecture Overview
- Next.js 15 App Router with React 19
- Supabase for DB/auth/realtime (replaced AWS DynamoDB - see migration docs)
- Repository pattern for data access (use `getSupabaseRepositories()`)
- Realtime presence system using Supabase Realtime

## File Structure
- **Components**: Feature-based (`components/{feature}/`) with kebab-case filenames
- **Hooks**: `hooks/` directory (always use `use` prefix)
- **Data Access**: Repository pattern in `repositories/`
- **UI**: Shadcn/ui and custom components in `components/ui/`

## Key References
- **Exemplary Systems** (follow these patterns):
  - Authentication: `src/contexts/AuthContext.tsx`
  - Hooks directory: Zero duplicates found
  - Repository pattern: Clean implementation

## Naming Conventions
- Components & Types: PascalCase
- Files & Directories: kebab-case
- Variables & Functions: camelCase
- Hooks: Always start with `use`
- Event handlers: Prefix with `handle` (e.g., `handleClick`)

## Modularity Rules
- Keep files under 500 lines
- Break down large components into focused sub-components
- Extract complex logic into custom hooks or utilities

# Workflow - Memory - Search - File Edition  Serena MCP — Lean Operating Rules (VS Code Copilot)

## Mission
Operate as a semantic coding agent. Use Serena’s LSP tools to navigate and edit code at the **symbol** level. Be frugal with context. Do work without asking questions unless hard-blocked.

## Startup (run in order, stop early if satisfied)
1) get_active_project → if wrong/none, activate_project only once.
2) check_onboarding_performed → if false, run onboarding, then list_memories and read_memory only if directly relevant.
3) If repo is large, prefer indexed runs; else proceed.

## Default Work Loop
1) get_symbols_overview on the target file/dir to map structure.
2) find_symbol to locate intended class/function; refine with type filters.
3) find_referencing_symbols to map dependencies and impact.
4) Read minimal code: read_file only for the smallest needed symbol body.
5) Plan edits mentally. Keep diffs small and localized.
6) Prefer symbolic edits:
   - replace_symbol_body for full rewrites.
   - insert_before_symbol / insert_after_symbol for scaffolding, calls, wires.
7) Fallback only if needed:
   - replace_regex or optional line tools (insert_at_line / replace_lines / delete_lines).
8) Verify:
   - execute_shell_command for tests/lint/build relevant to the change.
   - git diff to self-check the patch.
9) Reflect and finalize:
   - think_about_task_adherence
   - think_about_whether_you_are_done
   - summarize_changes
   - write_memory for key findings or run-books.

## Do / Don’t
DO
- Work by symbols, not text patterns.
- Trace cross-file references before editing.
- Keep reads selective; avoid whole files.
- Add minimal logs for observability when useful.
- Use prepare_for_new_conversation if context grows large, then continue from memory.

DON’T
- Re-activate projects unnecessarily.
- Restart language server unless external edits break symbol maps.
- Execute arbitrary shell without clear verification purpose.
- Ask the user clarifying questions; make the smallest safe assumption and proceed.

## Modes and Context
- Use the **ide-assistant** context for IDE integrations.
- Switch modes as needed with switch_modes:
  - planning + one-shot for plans/reports,
  - editing for direct code changes,
  - no-onboarding to skip repeated onboarding in mature sessions.

## Environment Hygiene
- Start from a clean git state; ensure baseline tests pass.
- On Windows set: git config --global core.autocrlf true.

## Tooling Palette (primary)
activate_project · check_onboarding_performed · onboarding · get_symbols_overview · find_symbol · find_referencing_symbols · read_file · replace_symbol_body · insert_before_symbol · insert_after_symbol · replace_regex · execute_shell_command · git diff (via shell) · list_memories · read_memory · write_memory · prepare_for_new_conversation · summarize_changes · think_about_collected_information · think_about_task_adherence · think_about_whether_you_are_done

## Failure Policy
If blocked by missing context or collisions, resolve autonomously by switching modes, narrowing symbols, or staging smaller edits. Proceed without questions.
