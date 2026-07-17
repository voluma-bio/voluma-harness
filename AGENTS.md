# voluma-harness

A **local-first AI agent runtime**. Owns its own agent loop (context assembly →
model call → tool dispatch), runs directly against local + hosted models, and
lands all agent edits through a shared CRDT `write` authority. Successor to
meridian-cli (Python coordinator) and voluma v0 (cloud) — not a coordinator of
other harnesses; a harness in its own right.

- **License:** MIT (open-core; protective/cloud sync is a separate concern).
- **References** `voluma` for optional online sync; runs fully offline without it.
- **Downstream:** may be forked into `meridian-flow` (writing-focused vertical).

## Status

Pre-build. The architecture is **not yet a build target** — three root-cause
decisions (D1 auth/RequestContext, D2 identity, D3 event/outcome/catalog split)
must be ratified first. See the design corpus.

## Design corpus (read before building)

`work/meridian-rewrite-design/` — carried forward from the meridian-cli rewrite
design. Start here:

- `review/SYNTHESIS.md` — adversarial-review synthesis; what survives, what fails.
- `review/root-cause-decisions.md` — **D1–D3, the gate.** D2 (identity) is decided;
  D1 and D3 are not.
- `review/execution-decisions.md` — repo topology, name, MIT license, model access
  (sanction tiers), routing/failover, local hosting, catalog, observability.
- `review/local-model-hosting.md`, `review/subscription-auth-reality.md` — verified
  research (endpoint-first local hosting; how subscriptions actually auth).

## Conventions

- Docs: `work/` (design/work items) and `kb/` live in-repo; `strategy/`
  externalizes to `voluma-bio/docs`.
- Never edit generated target dirs (`.claude/`, `.codex/`, `.opencode/`, `.pi/`,
  `.cursor/`) — owned by `mars sync`.
