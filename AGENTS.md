# AGENTS.md

Repository-wide instructions are maintained in the following file; domain-specific rules live in the skills it references:

@CLAUDE.md

## Agent-Specific Notes

- All agents (Claude, Codex, Gemini, Copilot, Cursor, etc.) must follow the rules in CLAUDE.md.
- If your agent does not support `@import` syntax, read `CLAUDE.md` at the project root for the full reference.
- Delegation mechanics depend on which model family you are. If you are an OpenAI/GPT/Codex model, read `delegation-openai.md`. If you are a Claude-family model, read `delegation-anthropic.md`.
