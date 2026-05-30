---
name: thermos
description: "Launch both thermo-nuclear review subagents in parallel, then synthesize their findings. Use for thermos, double thermo review, when a task complete, or combined bug/security and code-quality branch audits."
disable-model-invocation: true
---

# Thermos

Run the two thermo review passes as async background subagents in parallel, then synthesize their results.

## Worker instruction files

Before launching the review subagents, read these files relative to this skill directory:

- `subagents/bug-security-review.md`
- `subagents/code-quality-review.md`

Use each file's contents as the role-specific instruction block for the corresponding subagent prompt. These files are packaged with the skill as reference instructions; they are not standalone discovered agent definitions.

## Workflow

1. Determine the review scope from the user request, PR, current branch, or relevant changed files.
2. Gather the diff and any file/context excerpts needed for reviewers to evaluate the change without guessing.
3. Read the worker instruction files listed above.
4. Launch both subagents in the same message with `run_in_background: true`:
   - bug/security/correctness pass: include `subagents/bug-security-review.md` instructions.
   - code-quality/maintainability pass: include `subagents/code-quality-review.md` instructions.
5. Pass each subagent the same scoped diff/file context and ask it to return prioritized findings with file references and evidence.
6. After both finish, synthesize the results with findings first, deduplicated across reviewers. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.
