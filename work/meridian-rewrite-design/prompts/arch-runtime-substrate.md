# Architect review — runtime, substrate & surface future-paths

You are an architect stress-testing the two biggest structural bets in the
Voluma v1 rewrite and proposing the directions the team is NOT yet considering.
Use the `architecture` skill. Produce disciplined tradeoff comparisons, not
opinions — every claim gets an alternative and a cost.

## Read

- `../codebase-audit-rewrite/design/harness-agnostic-foundation.md` (the two
  orthogonal axes: execution-boundary vs architecture; the Codex-vs-Pi decision)
- `v1-architecture.md` §2, §3, §5, §11, §12 (surfaces, system arch, harness
  arch, performance, sync/hosted)
- `surface-architecture-notes.md` (two-MCP-module split, mars-as-compiler,
  SDK deferral)
- `../codebase-audit-rewrite/design/sdk-connections.md`
- `../codebase-audit-rewrite/design/bundle-contract.md`
- `../codebase-audit-rewrite/design/local-first-architecture.md`

Paths relative to
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/`.

## Attack these decisions

1. **"Stay the coordinator, own the canonical model" (Axis 2).** The design
   rejected forking Pi. Re-litigate adversarially: under what growth scenario
   does owning `HarnessEvent` + `SessionProvider` become the more expensive
   path than adopting a runtime? Is there a third option the two-axis framing
   hides (e.g. own the runtime for API providers, coordinate only for
   subscription-auth harnesses)?
2. **Substrate-first as the cross-platform answer (Axis 1).** Vercel Sandbox
   leads. Where does substrate-first quietly change the product (latency,
   offline/local-first promise, cost model, data-sovereignty story for
   researchers)? Does it contradict the local-first differentiator? Map the
   tension explicitly.
3. **Language boundary.** Python coordinator + TypeScript v1 daemon + Rust mars
   + WASM resolver. That's four languages in one system. Where are the drift
   and ownership seams? Is the deferred `mars-core`→WASM plan the right call or
   a future rewrite trap?
4. **Surface architecture future paths.** Given two MCP modules + CLI, what's
   the natural next surface (A2A remote edge? webhook/event push? a public
   query API)? Which future direction should shape the contracts NOW so we
   don't repaint later?

## Deliverable

Write `review/arch-runtime-substrate.md`. For each decision: a compact
options table (option / what it buys / what it costs / when it wins), your
adversarial finding, and a recommendation with the trigger condition that would
flip it. Close with **"Directions to consider now"** — 3-5 concrete future
paths ranked by leverage, each with the cheap thing to do today that keeps it
open. Be concrete; cite doc sections.
