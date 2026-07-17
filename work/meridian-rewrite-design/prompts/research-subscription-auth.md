# Research: how coding-agent harnesses actually use provider subscriptions (verify, don't assume)

## Why
We're deciding whether `voluma-harness` (a local-first agent runtime that owns
its own loop) can ride provider *subscriptions* natively (in-process) or must
subprocess a vendor CLI. Prior reasoning was from memory and is UNVERIFIED.
Confirm or refute each specific claim below with current (2025-2026) primary
sources. Where a claim is wrong or outdated, say so plainly.

## Claims to verify (confirm / refute each, with sources + dates)
1. **OpenCode (SST/opencode)** supports logging in with a **Claude Pro/Max
   subscription** via Anthropic OAuth (in-process, no subprocess).
2. **OpenCode** supports using a **GitHub Copilot subscription** as a model
   provider (multi-model access through Copilot's endpoint).
3. **OpenCode does NOT** use an OpenAI **ChatGPT subscription** — for OpenAI it
   uses API keys.
4. **OpenAI ChatGPT (Plus/Pro) subscription** for coding is usable ONLY through
   OpenAI's own first-party **Codex CLI** (OAuth bound to their client); a
   third-party harness cannot ride it. Verify current Codex sign-in-with-ChatGPT
   mechanics.
5. **Claude Code** supports both Claude subscription (OAuth) and API key.
6. What is the **current ToS / enforcement posture** on THIRD-PARTY tools using
   Anthropic subscription OAuth and GitHub Copilot subscription outside supported
   editors? Has Anthropic or GitHub actively blocked/warned third-party clients?
   Is this a real rug-pull risk or tolerated?

## Also establish
- The full list of provider auth methods OpenCode currently supports (subscription
  vs API key vs local), ideally from its own docs/repo.
- Any OTHER coding agents (Cline, Aider, Zed, etc.) that ride a NON-Claude
  subscription in-process, and which subscription.
- Bottom line: which subscriptions can a third-party runtime use IN-PROCESS
  (natively) vs which REQUIRE running the vendor's official client as a subprocess.

## Rules
- Prefer primary sources: OpenCode docs/GitHub, Anthropic/OpenAI/GitHub official
  docs & ToS, dated announcements. Cite every claim with a URL and date.
- If you cannot confirm something, mark it UNCONFIRMED — do not guess.

## Output
Write findings to: `$MERIDIAN_ACTIVE_WORK_DIR/review/subscription-auth-reality.md`
