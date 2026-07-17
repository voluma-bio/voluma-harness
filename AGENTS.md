# voluma-harness

A **local-first AI agent runtime**. It owns its agent loop (context → model →
tool → repeat), runs directly against local and hosted models, and lands every
agent edit through a shared CRDT `write` authority — the write seam is the
reason this product exists. Successor to meridian-cli (Python coordinator) and
voluma v0 (cloud). It **is** a harness, not a coordinator of harnesses; the
cloud/sync backend is a separate repo (`voluma`).

MIT (open-core — the moat is the cloud, not the harness). May be forked into
`meridian-flow`, a writing-focused vertical.

## Status: build gate closed (2026-07-16), build-prep next

**D1, D2, D3 and the §13 honesty pass are all ratified** — decided models in
`meridian-rewrite-design/review/root-cause-decisions.md`. `v1-architecture.md`
is buildable **through the decided models**: it predates ratification and
carries a supersession banner — where its text conflicts with the decided
models, the decided models win. Folding them in is the first build-prep task.
See `.context/TODO`.

## Mental model

- **Runtime, not orchestrator.** This process owns the loop and runs its own
  tools. "Coordinate agents, don't control them" was v0/meridian-cli — gone.
- **One word, two senses.** *voluma-harness* is the product (the harness you run
  agents in). A *harness adapter* is an optional internal bridge to an external
  harness (Claude Code/Codex) run as a subprocess — a fallback, not the spine.
- **Model access is tiered by sanction.** Sanctioned foundation: API keys +
  local models. Everything else (subscription OAuth, subprocess bridges) is
  opt-in and degrades to that foundation. Details in `.context/CONTEXT.md`.
- **Docs live elsewhere.** work/kb/strategy externalize to `voluma-bio/docs`;
  this repo is code-only.

## Key rules

- **Build gate closed:** implement against the ratified decided models
  (`review/root-cause-decisions.md`); `v1-architecture.md` text yields to them
  wherever they conflict, until the fold-in lands.
- **Identity is daemon-constructed, never surface-inferred.** A caller's
  channel, token, or cwd is not authorization (the C1 confused deputy). Honor
  this in every seam — it is D1.
- **Never ride a Claude Pro/Max subscription in-process** — Anthropic prohibits
  third-party OAuth and enforces without notice. Subprocess Claude Code, or API.
- **Never edit generated target dirs** (`.claude/`, `.codex/`, `.opencode/`,
  `.pi/`, `.cursor/`) — owned by `mars sync`.
- **Dependency direction is one-way:** voluma-harness → published `voluma`
  contracts, never the reverse.

## Anti-patterns

- Rebuilding a coordinator-of-harnesses. The native loop is the product.
- Depending on subscription routes. They are gray-area and revocable; design
  for failover to the sanctioned API+local foundation, not for reliance on them.
- Silent model/cost swaps on failover — route changes need consent + a budget
  check + a domain event.

## Downlinks

- `.context/CONTEXT.md` — architecture frame, rationale, dependency contracts.
- `.context/TODO` — the build gate (D1, D3, honesty pass).
- Design corpus: `meridian context work` → `meridian-rewrite-design/review/`
  (SYNTHESIS → root-cause-decisions → execution-decisions).
