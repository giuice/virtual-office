# Delegation — OpenAI orchestrator

Read this file when the orchestrating model is from the OpenAI family (Codex CLI
or another GPT-based agent) and it needs to hand work to a Claude model. If a
Claude-family model is orchestrating, read `delegation-anthropic.md` instead.

The asymmetry that matters: Claude Code has a Codex plugin, but Codex has no
equivalent Claude plugin. So this side drives Claude through the `claude` CLI
inside a WezTerm pane. WezTerm's mux behaves like tmux and keeps the pane alive
after the calling turn ends, which is what makes a long review survivable.

## What gets delegated

- **Adversarial review: delegate to Claude Opus 5.** Every diff that is about to
  be handed to the user gets reviewed by Opus 5 as a second, hostile pair of
  eyes. Model id: `claude-opus-5`, or `--model opus`.
- **Implementation, debugging, and research stay local.** Do not round-trip
  ordinary coding work to Claude; only the adversarial pass crosses the boundary.
- Never downgrade the review model to a cheaper Claude tier to save tokens.
  Correctness and regression prevention take priority over cost.

## The review prompt

Give the reviewer the diff and the claims, not just the files. A useful
adversarial prompt states:

1. what the change is supposed to do, in one paragraph;
2. the exact diff range (`git diff <base>...HEAD`, or the branch name);
3. that spec conformance plus green tests is not acceptance — the reviewer must
   attack the diff and independently verify every claim made in the code
   comments, commit messages, and summary;
4. the repository traps that matter here: `users.id` versus `users.supabase_uid`,
   server versus browser Supabase client, `getUser` versus `getSession`, RLS
   coverage, service-role exposure, and Realtime or presence regressions;
5. the required output shape: findings ranked by severity, each with a concrete
   failure scenario, plus an explicit verdict of approve or revision required.

## WezTerm mechanics — verified on this machine

WezTerm lives at `C:\Program Files\WezTerm\wezterm.exe`. Quote the path; it
contains a space.

- `wezterm cli` with **no mux or GUI already running will block** while it tries
  to auto-start one. Always pass `--no-auto-start`, and expect a non-zero exit if
  nothing is running rather than a hang.
- `wezterm cli --no-auto-start list` prints the `WINID TABID PANEID` table. Use
  it to find an existing pane id before spawning.
- `wezterm cli spawn` needs a reference pane to resolve the domain and window.
  From a non-interactive shell `$WEZTERM_PANE` is unset, so pass
  `--pane-id <existing>` explicitly or the command fails with
  `--pane-id was not specified`. On success it prints only the new pane id.
- `wezterm cli --no-auto-start get-text --pane-id <id>` reads the pane's visible
  scrollback. Panes default to 80x24, so **do not treat `get-text` as the source
  of truth** — long review output gets clipped and wrapped. Use it only for
  liveness checks.
- `wezterm cli --no-auto-start kill-pane --pane-id <id>` cleans up. Kill the
  panes you spawned; do not leave a stray mux server behind.

## The delegation recipe

Redirect the reviewer's output to a file and read the file. That is the only
reliable capture path.

```bash
WT="/c/Program Files/WezTerm/wezterm.exe"
REPO="E:/projects/virtual-office"
OUT="$REPO/docs/<topic-folder>/opus-review.md"

# 1. Find a reference pane (spawn a mux first if the table is empty).
"$WT" cli --no-auto-start list

# 2. Spawn the review in its own pane; capture the printed pane id.
PANE=$("$WT" cli --no-auto-start spawn --pane-id 0 --cwd "$REPO" -- \
  bash -lc "claude -p \"\$(cat $REPO/review-prompt.txt)\" \
    --model opus --permission-mode plan > \"$OUT\" 2>&1")

# 3. Poll for completion by watching the output file, not the pane text.
# 4. Read $OUT, then clean up:
"$WT" cli --no-auto-start kill-pane --pane-id "$PANE"
```

Notes on the `claude` invocation:

- `-p` / `--print` runs one shot and exits — the right mode for a review.
- `--model opus` selects Opus 5.
- Keep the reviewer read-only. `--permission-mode plan` or an `--allowedTools`
  list restricted to read and search tools prevents it from editing the diff it
  is supposed to be judging.
- Put the prompt in a file rather than inlining it. Long prompts through nested
  shell quoting on Windows are a reliable source of silent truncation.
- A pane that exits immediately with no output usually means the CLI never
  started. Check the pane text before assuming the review found nothing.

## Reporting back

Delegation does not change the reporting contract in `CLAUDE.md`. Pane ids,
model names, and prompt files are internal machinery: keep them out of the
user's report unless one is genuinely needed, and then confine it to the single
`Technical note:` line. Report an unresolved review finding as a remaining risk;
never present a diff as accepted when the reviewer asked for revision.
