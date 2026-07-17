# Root-cause decisions — answer these before v1 is a build target

The adversarial review (see `SYNTHESIS.md`) collapsed 8 convergent findings into
**three root-cause decisions**. Everything downstream inherits them, so they're
worth deciding deliberately rather than discovering during implementation. Each
below is framed as a decision with options + a recommendation. Answer async;
these are yours (or a `@architect` panel's) to ratify, not kb-maintainer's.

Sequencing: **D1 → D2 → D3.** D1 (identity/auth) is the root of write
attribution, query trust, and escalation authority — four lanes hit it. D2
(portable identity) unblocks sync and the remote lease. D3 (event split) resolves
the mars boundary too.

---

## D1 — The authentication & authorization model

**Problem (Blocker ×4).** The design uses *the surface you called from* as your
identity: the spawn MCP channel "IS the identity," the query module "needs no
auth beyond read," and `WriteService`/`HostWriteInput` accept caller-authored
`actor`/`cwd`. A worker with shell can re-open the spawn MCP as a fresh
top-level caller with default caps (privilege escalation); an unmanaged agent
reads transcripts/config "from anywhere" (data exposure). A verb allowlist is
not caller authorization.

| Option | Buys | Costs |
|---|---|---|
| **A. Daemon-constructed `RequestContext` (recommended)** | Surfaces authenticate; `lib/ops` authorizes a `{principal, project, capability, channel, requestId}` the daemon built. Worker credentials bound to one spawn/project/verb-set/expiry. Never infer root from missing token/env/cwd. Standalone spawn MCP requires an explicit control-plane credential workers don't get. | One auth/credential subsystem to build before surfaces harden; every op signature carries context |
| B. Keep channel-as-identity, add a bearer token for writes only | Smaller near-term change | Leaves query side open; two half-models; the confused-deputy path survives on the spawn side |
| C. Trust the harness to self-report identity | Zero infra | Explicitly the thing the daemon must never do (AGENTS.md: "does not trust agent-reported authority") |

**Recommendation: A.** It's the single highest-confidence finding and the root of
C4 (write attribution) and C8 (query trust). Also decides: how the two MCP
modules actually bind identity, and whether "hand-wired human = top-level caller"
survives (it does — *with* an explicit interactive credential, not by default).

**Open sub-questions:** credential format (bearer token vs per-turn lease);
where secrets live (broker-mediated so raw provider keys never enter worker env);
`enforcement_assurance: cooperative | sandboxed | remote-authoritative` on every
spawn so the UI doesn't show all runs as equivalently "capped."

---

## D2 — Identity: portable vs display vs workspace/mount

**Problem (Blocker ×2 + lease).** `p<N>`/`c<N>` are per-project counters used as
global primary keys — two offline devices both allocate `p41`/`c12`/`seq=900`
and collide on sync. Documents keyed `(project_id, relative_path)` + one
`absolute_path (NOT NULL, local-only)` merge two git worktrees into one Y.Doc and
can't be copied across devices. Remote sandboxes have no durable resource ID to
reattach/destroy after a crash.

| Option | Buys | Costs |
|---|---|---|
| **A. Three-layer identity split (recommended)** | (1) globally-unique immutable IDs (or `{replicaId, localSeq}`) as PKs for every synced entity/event/update; (2) `(project, ordinal)`/slug as a *display alias* under unique constraint; (3) `workspace`/`workspace_mount` identity separate from portable document identity; host absolute paths in a local mount table; durable resource IDs + lease state for remote sandboxes. | Schema is bigger; display handles never usable as cross-project FKs; causal/replica-aware ordering instead of a global counter |
| B. Keep ordinals, add a sync-remap layer later | Ships local-only sooner | The remap can't renumber `update_from_seq`/`update_to_seq` without rewriting dependent history; "hybrid/multi-device" promises become vapor; worktree collapse still corrupts edits *locally* today |
| C. Drop the multi-device/sync promise from v1 | Simplest schema | Contradicts the stated deployment modes; still doesn't fix worktree collapse (that's a local bug) |

**Recommendation: A — decided.** Note worktree collapse is a *local* correctness
bug, not just a sync issue — it bites the developer persona on day one. This
decision also carries the remote-lease contract (idempotency key, serialized
resource ID, provisioning state, attach/reconcile, idempotent release) that C5
needs.

### Decided model (folded in 2026-07-16)

**Portable identity = compound `{replica_id, local_seq}`.** The `p<N>`/`c<N>`
ordinal is a *label, not an identity*. Every synced entity/event/update is keyed
by the compound pair (Yjs `clientID`+clock / Automerge `actorId`+counter as prior
art). `local_seq` is the per-replica monotonic counter (ergonomic, survives
moves); `replica_id` disambiguates globally. Two offline devices allocating
`p41` no longer collide — they are `{A,41}` and `{B,41}`.

**`replica_id` = the real identity.** A UUID, **auto-minted at first run**, never
shown, never user-chosen, never changed. It is the final tiebreaker for ordering.

**Ordering = Hybrid Logical Clock**, with `replica_id` as the deterministic final
tiebreaker. Not a global counter.

**Display = viewer-relative, qualify-at-birth / strip-for-display.** Qualification
is a property of *the viewer's relationship to the entity*, not of being online:
- **Home replica** (entity's origin == viewer) → render **bare**: `p41`.
- **Foreign replica** (origin != viewer) → render **qualified**: `p41@laptop`
  — always, even without collision, for provenance. Git `origin/main` analogy.
- Entities are **qualified at birth** internally; the bare form is a *display
  strip* for the home viewer. Never assign bare then retroactively qualify.
- Uploading online does not change the owner's own view; foreign viewers / the
  shared dashboard show it qualified. Aggregate views privilege the current
  user's replica as home.

**Friendly label (`@laptop`) = cosmetic over the UUID.** Derivation chain (fits
the config precedence): explicit `replica.name` › env hint (CI) › slugified
hostname › short UUID prefix. **Auto-derived silently; never gates setup**
(one-line non-blocking notice + rename anytime). Because references key on the
UUID, renaming breaks nothing — the handle just re-renders. Each replica
**self-names and publishes `{replica_id, label}` to the shared registry**;
foreign viewers render what the origin published. Label collisions are
**non-fatal** — fall back to a short UUID prefix. Uniqueness is the UUID's job,
not the label's, so derivation can be dumb/best-effort.

**Context-source vs source-workspace — opposite authority defaults.** Two
distinct identities the design was conflating:
- **Context** (conversations, threads, spawn history) → **online-canonical**:
  voluma cloud is authority, local is a cache, offline is a fallback. Configurable
  in the voluma-harness config to point at cloud (or local-only copy when
  unavailable).
- **Source-workspace / mount** (the code checkout) → **local-authority**: the
  local working tree is truth; online is a sync mirror. Host absolute paths live
  in a **local mount table**, separate from portable document identity — so two
  git worktrees never collapse into one Y.Doc.
These invert on purpose: context wants a shared canonical timeline; source wants
the developer's local tree to win.

---

## D3 — Split the one "event" into three contracts

**Problem (Major ×3 + mars boundary).** `HarnessEvent` is `eventType:string` /
`payload:unknown` with an iterator-only run handle — a transport drop is
indistinguishable from success/cancel/disconnect, and adapters must re-derive the
terminal classifiers the design claimed it deleted. Public queries/webhooks over
this opaque shape make provider churn a permanent compatibility obligation. The
same collapse appears in mars: the build target invokes `mars build
launch-bundle` at spawn time (live, TOCTOU) while surface-notes say batch-ingested
DB rows.

| Option | Buys | Costs |
|---|---|---|
| **A. Three explicit contracts (recommended)** | (1) private, lossless, versioned raw provider event (diagnostics/replay); (2) versioned typed discriminated-union domain events (`TurnStarted`, `ToolRequested`, `UsageRecorded`, …) — the public surface for queries/webhooks/replay; (3) explicit `RunOutcome` future with completion authority, cancel-ack, retryability, transport-loss state. Coordinator finalizes from `RunOutcome`, never infers truth from telemetry. Same shape for mars: immutable versioned resolved-catalog artifact pinned by digest per spawn. | Adapters must map supported semantics into the typed union; more types up front |
| B. Keep opaque event, add `completed()` to the run handle | Smaller | Public consumers still branch on provider event names; mars TOCTOU unresolved |
| C. Keep as-is | Zero work | Guarantees the per-harness parsers reappear inside adapters and the "next accidental public API" forms |

**Recommendation: A.** This also unblocks the #1 future direction (versioned
domain-event + query API as the base that MCP/webhooks/A2A project from) and the
#2 direction (journal-backed replay). One decision, three payoffs.

**Mars sub-decision:** pin one boundary — mars emits an immutable
resolved-catalog/launch-plan artifact, transactionally ingested, pinned by
version on every thread/spawn; runtime applies only named dynamic inputs (parent-
cap clamp, workspace selection). If launch-time resolution is truly required,
call mars a runtime dependency and specify version negotiation/timeout/TOCTOU —
don't keep both stories. Also resolve: mars' harness enum (Claude/Codex/Pi/
OpenCode/Cursor) is larger than v1's `claude-code`/`api` union — define the
mapping/rejection before persistence.

---

## After D1–D3: the §13 honesty pass (C7)

Independent of the above but required before "build target": re-label every
overclaimed Carry in §13. The load-bearing one is the `meridian`→`voluma` /
`MERIDIAN_*`→`VOLUMA_*` rename — currently registered as Carry, actually a
silent break of every executable prompt package (the `deny-generic-agent` hook
would emit command-not-found). Decide: **dual-export env aliases + a `meridian`
compat shim**, *or* **move the whole prompt-package migration into Break with an
atomic rollout plan.** Not "Carry."

## Status of the other two open threads
- **Repo:** decided — `voluma-bio/voluma`, new `v1` branch. No new repo; not
  `voluma-cli`/`voluma-harness`.
- **Docs migration:** decided in shape — snapshot+reconcile into `voluma-bio/docs`
  (old kb/work → `archive/*-orig-<date>`, live product kb kept primary). **Not yet
  executed** — held for your presence since it's git-mv + cross-ref rewrite across
  repos. Recommend running it *after* D1–D3 so the reconciled corpus reflects the
  corrected contracts, not the superseded ones.
