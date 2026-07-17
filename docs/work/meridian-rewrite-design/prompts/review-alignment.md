# Adversarial alignment review: v1 architecture vs invariants + design contracts

Your job: verify that the v1 build-target architecture faithfully carries the
invariants and design contracts it claims to unify — find every gap, drift, and
silent drop. Be adversarial: assume the architecture doc is incomplete and hunt
for what it lost.

## Corpus

Build target (the artifact under review):
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/v1-architecture.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/surface-architecture-notes.md` (newest decisions, session notes)

Ground truth it must align with:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-cli.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-mars.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-prompts.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-flow-collab.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-flow-packages.md`
- Design contracts in `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/codebase-audit-rewrite/design/`:
  `overview.md`, `harness-agnostic-foundation.md`, `bundle-contract.md`,
  `capability-caps.md`, `monitor-framework.md`, `sdk-connections.md`,
  `crdt-write-seam.md`, `local-first-architecture.md`

## Check specifically

1. v1-architecture.md §13 has an invariant registry (carry/redesign/break).
   Cross-check it against ALL five invariants docs: which invariants appear in
   neither carry, redesign, nor break — silently dropped?
2. Do the design contracts (bundle, caps, monitors, SDK connections) survive
   the TypeScript rewrite, or does v1-architecture.md contradict them
   (e.g. HarnessEvent envelope, SessionProvider port, capability tiers)?
3. Does surface-architecture-notes.md (two-MCP-module split, mars-as-compiler,
   read-only config on worker surfaces) conflict with anything in
   v1-architecture.md §2 (surfaces), §7 (capability), §10 (mars integration)?
4. Classify every gap: dropped / contradicted / underspecified / deferred-without-trigger.

## Output

Write your full report to
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/review/alignment.md`
— findings ranked by severity, each with: the source claim (doc + section), the
divergence, and what resolving it requires. Your final message: a 10-line
summary of the top findings plus the report path.
