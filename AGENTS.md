# AGENTS.md

Repository-wide instructions are maintained in the following file; domain-specific rules live in the skills it references:

@CLAUDE.md

## Agent-Specific Notes

- All agents (Claude, Codex, Gemini, Copilot, Cursor, etc.) must follow the rules in CLAUDE.md.
- If your agent does not support `@import` syntax, read `CLAUDE.md` at the project root for the full reference.
- Delegation mechanics depend on which model family you are. If you are an OpenAI/GPT/Codex model, read `delegation-openai.md`. If you are a Claude-family model, read `delegation-anthropic.md`.
- Cross-provider model policy: OpenAI delegates use GPT-6.1 Sol (`gpt-6.1-sol`) at `high`, or `max` for important work such as adversarial reviews. Anthropic delegates use Claude Opus 5.5 (`claude-opus-5-5`) at `high`, or `xhigh` for important work such as adversarial reviews.
- Apply the model and effort policy in CLAUDE.md through the matching delegation file. Do not silently substitute a model or lower the required effort.
- Delivery workflow: use `spec-to-done` for new substantial work. GSD is retired: never invoke or execute GSD skills, workflows, scripts, or automation. GSD skills and `.planning/` files may be read only as historical reference or for clarification; they do not govern execution or establish an approved SPEC.
