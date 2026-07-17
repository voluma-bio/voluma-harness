# Requirement-coverage & gap review — Voluma v1 rewrite

You are verifying that the Voluma v1 design **actually covers the requirements
and invariants it inherits.** Your job: find requirements, invariants, and edge
cases that the design silently drops, under-specifies, or contradicts. Use the
`review-alignment` skill: this is coverage/drift/gap classification, not taste.

## Read

The inherited invariants (what the current system guarantees and must not lose):
- `invariants-cli.md`
- `invariants-flow-collab.md`
- `invariants-flow-packages.md`
- `invariants-mars.md`
- `invariants-prompts.md`

The proposed design (what v1 commits to):
- `v1-architecture.md` (build target — note its §13 invariant registry:
  Carry / Redesign / Break)
- `surface-architecture-notes.md`
- `../codebase-audit-rewrite/design/overview.md`
- `../codebase-audit-rewrite/design/harness-agnostic-foundation.md`

Paths relative to
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/`.

## Method

1. Build a coverage matrix: each significant invariant from the `invariants-*`
   docs → is it Carried / Redesigned / Broken / **UNADDRESSED** in the v1
   design? The design's own §13 registry is a claim to verify, not trust —
   check it against the source invariant docs.
2. Flag every invariant that the design breaks or redesigns **without stating
   it did**. Silent drift is the top-priority finding.
3. Flag capabilities the current system has that no v1 surface provides
   (spawn semantics, session mining, context resolution, work-item flows,
   prompt/mars behaviors).
4. Edge cases and failure modes named as requirements in the invariants but
   absent from the v1 flows (crash recovery, truncation tolerance, offline,
   partial-sync, escalation, drain ownership).

## Deliverable

Write `review/coverage-findings.md`:
- A coverage matrix table (invariant → v1 status → evidence/gap).
- A ranked gap list: for each gap — which invariant, why it matters, the
  concrete scenario where its absence bites, and whether it's a genuine
  omission vs an intentional-but-undocumented break.
- A short verdict: is the design's §13 registry honest and complete?
Most-severe (silent breaks) first. Be specific with doc citations.
