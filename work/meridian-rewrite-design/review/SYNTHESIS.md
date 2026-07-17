# Adversarial review synthesis — Voluma v1 design

Five independent lanes reviewed the v1 corpus (structural, coverage, write-seam
+ data-model, runtime/substrate, future-directions/security). This is the
cross-lane synthesis: the meta-signal is **convergence** — where lanes that
never saw each other's output attacked the same seam.

## Verdict

**The direction is sound; the current contracts are not yet a build target.**
Four of five lanes independently returned "request changes / redesign before
build." What survives unchallenged is the *spine*: one authority daemon, a
mediated `write` capability, an explicit capability model, adapter-local harness
logic, and mars-as-compiler. What fails is the *seam specification* around that
spine — identity, portable IDs, the event/outcome split, the write protocol, and
substrate lifecycle. These are foundation defects: build packages on them and
today's document contradictions become cross-cutting migration work.

This is **not a restart.** It's ~6 contract corrections + a registry honesty
pass, then build.

## Convergent findings — ranked by cross-lane signal

| # | Finding | Lanes that hit it | Severity |
|---|---|---|---|
| **C1** | **Surface-as-identity is a confused deputy.** "The channel IS the identity / query needs no auth beyond read" is unsafe. A worker with shell can re-open the spawn MCP as a fresh top-level caller; an unmanaged agent reads transcripts/config "from anywhere." `HostWriteInput`/`WriteService` accept caller-authored `actor`/`cwd`. | Structural #1, Write-seam WS-2, Coverage X1/Blocker-3, Research #6 | **Blocker ×4** |
| **C2** | **Local ordinals used as global identity → sync/worktree collapse.** `p<N>`/`c<N>` are per-project counters but serve as global PKs (collide on peer-sync); documents keyed `(project_id, relative_path)` + one `absolute_path` merge two worktrees into one Y.Doc and can't be copied across devices. | Structural #2, Write-seam WS-4/DM-2/DM-3 | **Blocker ×2** |
| **C3** | **`HarnessEvent` is opaque telemetry posing as the canonical model, and has no completion contract.** `eventType:string`/`payload:unknown` + iterator-only run handle. Transport drop is indistinguishable from success/cancel. Public queries/webhooks over it make provider churn a compatibility obligation. | Structural #3, Runtime §1 + Direction #1 | **Major ×3** |
| **C4** | **The CRDT write seam is not yet an authority protocol.** CRDT convergence ≠ command equivalence; no idempotency key or planning base; retries double-commit; reconciler has no safe base (git checkout / formatter corrupts); multi-file commit not transactional; "undo turn" is really dependency-refusing selective revert; projection failure reports success against stale disk. | Write-seam (WS-1..9), Coverage Blocker-2/High-10 | **Blocker ×2** |
| **C5** | **Remote substrate contradicts local-first; lease lifecycle erased.** "Nothing leaves the machine" vs "substrate is the OS-agnostic answer" describe different products. `createSandbox`/`dispose` models a leased remote microVM as a local disposable — no durable resource ID, attach, renew, or reconcile. Pause preserves persistent effects (processes, creds, planted hooks). | Runtime §2, Structural #4, Research #5 | **Major ×3** |
| **C6** | **Mars publication boundary is ambiguous — compiler vs launch-time authority.** Build target invokes `mars build launch-bundle` at spawn time (live resolution + TOCTOU) while surface-notes say batch-ingested DB rows. Two designs, two runtime catalog authorities. Mars' harness enum (Claude/Codex/Pi/OpenCode/Cursor) is larger than v1's closed `claude-code`/`api` union with no mapping. | Structural #5, Coverage X2/M13, Runtime §3 | **Major ×3** |
| **C7** | **§13 registry is not honest — CLI/env rename silently breaks executable clients.** `meridian`→`voluma`, `MERIDIAN_*`→`VOLUMA_*` is registered as "Carry." Prompt packages are executable clients that call `meridian spawn` and read `MERIDIAN_CHAT_ID`; the shipped `deny-generic-agent` hook would emit command-not-found. Matrix: 73 items → 14 Carried, **15 Drift, 15 Unaddressed**. | Coverage (Blocker-1 + whole matrix) | **Blocker ×1, high-confidence** |
| **C8** | **Committed two-MCP surface architecture is absent from the build target.** v1 has only CLI + `apps/mcp-write`; neither spawn-MCP nor query-MCP appears in package/process diagrams. Drops tool-first spawn, long-poll wait, escalation, completion acceptance, unmanaged query access. | Coverage X1/Blocker-3, Runtime §4 | **Major ×2** |

**Reading the signal:** C1 (identity) is the single highest-confidence defect —
four independent lanes, and it's the root of several downstream issues (write
attribution, query trust, escalation authority). Fix C1 and C2 first; they're
schema/contract decisions that everything else inherits.

## The shared root causes (three, not eight)

1. **No authenticated `RequestContext`.** C1, and half of C4/C8. The daemon must
   construct `{principal, project, capability, channel, requestId}` from an
   authenticated credential; surfaces authenticate, `lib/ops` authorizes; never
   infer root from a missing token/env/cwd. Removes caller-authored authority
   everywhere (`WriteService`, spawn, query).
2. **Portable identity ≠ storage/display identity.** C2, C5-lease, parts of C6.
   Globally-unique IDs for every synced entity; `(project, ordinal)` as *alias*;
   `workspace`/`mount` identity separate from portable document identity; durable
   resource IDs for remote leases. One rule, many symptoms.
3. **Three contracts are being collapsed into one "event."** C3, C6, and the
   future-API work. Split: (a) private lossless provider events, (b) versioned
   typed domain events (public: queries/webhooks/replay), (c) explicit
   `RunOutcome` completion authority. Same split lets mars emit an immutable
   versioned resolved-catalog artifact pinned per spawn.

## Future directions to reserve now (cheap seams, high option-value)

Both forward-looking lanes converged here independently:

| Rank | Direction | Why now | Cheap move today |
|---|---|---|---|
| 1 | **Versioned domain-event + query/resource API** (MCP, webhooks, A2A are projections over it) | Stops provider events / DB rows / MCP results becoming one accidental public API | Split private `HarnessEvent` from typed domain events; add `version/actor/subject/cursor` + golden serialization fixtures; add an outbox beside the ledger |
| 2 | **Journal-backed eval + replay** (the single most under-invested lever) | v1 already pays for journal, prompt snapshots, launch bundles, caps, spans — today they're only forensic logs | Reserve immutable `run_manifest` + `evaluation_result`; define 3 honest replay modes (trace / simulation / rerun); no bit-for-bit LLM determinism promise |
| 3 | **Asymmetric execution: domain kernel + replaceable `AgentDriver` + native worker adapters** | Prevents the "unified API harness" from becoming a runtime by stealth while keeping Claude/Codex subscription auth intact | Define a small `AgentDriver` (run/inject/interrupt/stop/ingress) with conformance cases; keep runtime session IDs opaque, never DB authority |
| 4 | **Tree-aware budget governance** (spans agents + monitors + tools) | Parallel agents + parallel reviewers make per-thread totals inadequate; monitors can consume the budget they protect | Add a `BudgetGrant` beside `SpawnCapability`: parent reservation, child ceiling, monitor reserve; broker reserves before issuance, settles after |
| 5 | **Placement-first execution + egress manifest** | Preserves the local-first claim while keeping managed isolation available; a remote run is a data-export event | Add `execution_placement` (`local_process`/`local_isolate`/`org_sandbox`/`managed_sandbox`) + machine-readable egress manifest to launch input |
| 6 | **A2A/ACP at the federation edge only** (not the internal model) | Lets remote/subcontracted agents participate without faking local-child semantics | Separate agent-descriptor from harness launch; reserve stable agent/task/artifact IDs; map outward later |

## Monitor-framework security gaps (research lane)

The parallel-reviewer design has four unaddressed holes, each with prior art
that closes it:
- **Operation-risk manifest** — "irreversible actions have sync hooks" is an
  assumption, not a coverage contract. Make launch fail-closed when a
  `preflight-required` op has no interceptor.
- **Reviewer input is untrusted, high-authority.** Journal payload (tool output,
  repo text, web content) can prompt-inject the reviewer into `kill`/`escalate`.
  Split monitors by trust class: deterministic monitors may `block/pause/kill`;
  model-judgment monitors may only `recommend`, translated by a deterministic
  admission policy.
- **Broker gate has no durability/availability semantics.** Make admission a
  durable `(thread, epoch, state, reason, policy_version, expires_at)` state
  machine with one-use model-call leases; per-policy `fail-closed/warn/human-resume`.
- **Monitor budget envelope** — bound concurrent monitors, review window,
  model allowlist, deadline, backlog degradation; attribute monitor spend to
  the parent reservation.

## Recommended next step

**Don't fold these into the docs yet — resolve the three root causes first**, in
this order (each is a decision, not a doc edit):

1. **RequestContext + credential model** (kills C1, unblocks C4/C8 attribution).
2. **Identity split: portable vs display vs workspace/mount** (kills C2, unblocks
   C5-lease and sync).
3. **Event/outcome/catalog split** (kills C3, resolves C6's boundary).

Then a **§13 honesty pass** (C7): re-label every overclaimed Carry, decide the
`meridian`-compat story (dual-export aliases + `meridian` shim, *or* move the
whole prompt-package migration into Break with an atomic rollout).

Only then is v1-architecture.md a build target. The write-seam (C4) can be
designed in parallel using the recommended **branch + durable change-set** model
(see `arch-writeseam-datamodel.md` §C, Alternative 1) — but it depends on
RequestContext and workspace identity landing first.

## Source reviews
- `structural-findings.md` — surface/layering, 5 defects + 1 risk
- `coverage-findings.md` — 73-item invariant matrix, §13 honesty
- `arch-writeseam-datamodel.md` — WS-1..9 + 12 data-model defects + alternatives
- `arch-runtime-substrate.md` — asymmetric execution, placement, WASM, query API
- `research-future-directions.md` — 6 monitor/security gaps + 4 ranked directions
