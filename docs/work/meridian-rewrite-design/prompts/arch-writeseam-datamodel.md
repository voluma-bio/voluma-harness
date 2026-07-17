# Architect review — CRDT write seam & data model correctness

You are an architect adversarially reviewing the product's core differentiator
— the shared `write` capability landing every agent edit in the same Yjs
authority — and the data model beneath it. Use the `architecture` skill. This
is the seam the whole product bets on; find where it breaks.

## Read

- `../codebase-audit-rewrite/design/crdt-write-seam.md`
- `v1-architecture.md` §4 (CRDT write seam), §6 (data model — full), §7
  (capability/security), §8 (thread model)
- `../codebase-audit-rewrite/design/data-model-analysis.md` (~1666 lines —
  the deep data-model reasoning)
- `invariants-flow-collab.md` (what the current collab layer guarantees)

Paths relative to
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/`.

## Attack these

1. **Three bindings, one authority.** MCP `write` tool (Claude primary), bash
   `write` CLI (subagents, possibly in a remote sandbox), in-process API
   agents. Do all three land identical CRDT semantics? Find the divergence:
   ordering, atomicity of multi-file edits, partial-failure, a write from a
   sandbox with network latency vs an in-process write racing the human editor.
2. **File↔CRDT projection.** §4.7 / §6.6. What happens on: external non-CRDT
   edits (git checkout, formatter, another tool touching the file on disk),
   binary files, large files, rename/delete, merge conflicts the CRDT can't
   auto-resolve? Where's the truth when disk and Yjs disagree?
3. **Agent-edit journal & reversal (§6.7).** Can every agent edit actually be
   reversed given CRDT merge semantics? Reversal + concurrent human edit =
   what? Is "undo an agent's turn" well-defined here?
4. **Data model correctness.** Threads/turns/spawns/work-items/documents. Look
   for: missing indexes on hot paths, integrity constraints the flows assume
   but the schema doesn't enforce, SQLite↔Postgres semantic gaps (WAL,
   serialization, JSON columns), the events/journal table as the monitor
   substrate — does it scale and stay consistent?

## Deliverable

Write `review/arch-writeseam-datamodel.md`. Structure: (a) write-seam findings
with concrete race/failure scenarios and the invariant each violates; (b) a
data-model defect list ranked by severity; (c) alternative approaches for the
1-2 weakest points (e.g. how OTHER CRDT-over-files systems handle disk
divergence — name them). End with a verdict: is the write seam a sound product
foundation, or does it need a redesign before build? Be concrete and cite
sections.
