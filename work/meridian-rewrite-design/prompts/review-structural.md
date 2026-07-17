# Adversarial structural review — Voluma v1 rewrite architecture

You are reviewing a large design corpus for a local-first agent-execution
rewrite (Voluma v1, née meridian-cli). Your job: **find structural and
maintainability failure modes the authors are blind to.** Be adversarial. The
authors are confident; assume that confidence hides load-bearing assumptions.

## Read these (in order)

Framing + build target:
- `../codebase-audit-rewrite/design/harness-agnostic-foundation.md` (framing)
- `v1-architecture.md` (the build target — read fully, ~1350 lines)
- `surface-architecture-notes.md` (proposed two-MCP-module surface split)

Contracts:
- `../codebase-audit-rewrite/design/bundle-contract.md`
- `../codebase-audit-rewrite/design/capability-caps.md`
- `../codebase-audit-rewrite/design/sdk-connections.md`
- `../codebase-audit-rewrite/design/overview.md`

All paths are relative to
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/`.

## Lens

Apply the `thermo-nuclear-review` and `architecture` skills. Hunt specifically
for:

1. **Abstraction leaks.** The "thin surfaces over one `lib/ops/`" claim and
   "mars is a compiler not a runtime" claim — where do they break? Find the
   concrete verb or flow where a surface MUST grow its own logic. The design
   asserts these seams hold; prove where they don't.
2. **The three-client / one-policy-layer bet.** CLI + spawn MCP + query MCP over
   one ops layer. Where does privilege enforcement actually get duplicated or
   diverge? Is channel-as-identity robust, or is there a confused-deputy path?
3. **Coordinator-owns-canonical-model risk.** `HarnessEvent` as the single
   envelope replacing 4 bespoke parsers — what harness reality does one envelope
   fail to capture? What forces per-harness special-casing back in?
4. **Layering violations that will emerge under load.** Where will a future
   feature force a 10-file edit (the AGENTS.md smell for wrong abstraction)?
5. **Local↔hosted symmetry claim.** "Same interfaces, different adapters"
   (SQLite/Postgres, OS-sandbox/Daytona). Where does that symmetry actually
   leak — transactions, Yjs persistence, sandbox lifecycle?

## Deliverable

Write `review/structural-findings.md`. For each finding: severity
(blocker/major/minor), the specific doc+claim it attacks, the concrete failure
scenario (inputs/state → bad outcome), and a suggested structural fix or the
alternative that avoids it. Rank most-severe first. Separate **confirmed
structural defects** from **speculative risks worth flagging**. Do not pad —
five sharp findings beat twenty soft ones. End with a one-paragraph verdict:
is the surface/layering architecture sound enough to build on?
