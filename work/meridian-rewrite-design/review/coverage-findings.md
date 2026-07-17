# Voluma v1 requirement-coverage review

## Verdict

**Request changes. Section 13 is not honest or complete yet.** It correctly
declares several large architectural breaks (database authority, the reduced
harness roster, control transport, and the six-level task-dir cascade), but it
also labels contracts as carried when the build target contains only their name
or a registry sentence. The most consequential silent breaks are the replacement
of the exact `meridian` command/environment contract with `voluma`/`VOLUMA_*`, the
absence of the two MCP coordination surfaces committed in the surface notes, and
the lack of a durable/concurrent human-edit path into the Yjs journal.

The registry should not be used as an implementation checklist until every
“Carry” entry points to a normative flow, schema, or output contract in §§2–12.
At present several behaviors exist only in §13, which makes the registry a list
of aspirations rather than verified coverage.

## Scope and classification

This review treated the five `invariants-*` reports as inherited requirements,
and `v1-architecture.md`, `surface-architecture-notes.md`, and the two referenced
foundation documents as the proposed design. A registry assertion was not
counted as coverage unless an earlier section specified how the behavior is
represented or enforced.

- **Carried** — the user-visible contract and a delivery mechanism are specified.
- **Redesigned** — the behavior remains with a concrete replacement.
- **Broken (stated)** — v1 explicitly declares the break.
- **Partial** — some of the contract has a delivery mechanism; named parts do not.
- **Drift — claimed Carry** — §13 says Carry, but the design drops, renames, or
  contradicts the inherited contract.
- **UNADDRESSED** — no v1 decision or surface covers the invariant.

## Coverage matrix

### meridian-cli spawn, persistence, environment, and CLI

| ID | Inherited invariant | v1 status | Evidence or gap |
|---:|---|---|---|
| C1 | Seven spawn statuses, transition graph, active/terminal sets, completion evidence over late cancel (`invariants-cli.md:18-39`) | **Carried** | Statuses and graph are repeated at `v1-architecture.md:452-488`; the terminal authority lattice is explicit at line 488. |
| C2 | `p<N>`/`c<N>` monotonic IDs (`invariants-cli.md:69-79`) | **Carried** | Counters and CLI-visible shapes are specified at `v1-architecture.md:579-601`. |
| C3 | Parent ID, zero-based depth, fail-closed malformed depth, max-depth blocking, inherited chat tree (`invariants-cli.md:52-67,301-306`) | **Carried** | Capability constraint and depth rule are at `v1-architecture.md:884-911`; stored-parent behavior and malformed-depth rule are at `1013-1021`. |
| C4 | Work attachment precedence: explicit `--work`, ambient session work, then `--from` (`invariants-cli.md:81-86`) | **Drift — claimed Carry** | §13 repeats the precedence (`v1-architecture.md:1254`), but the spawn reserve/thread flows never resolve it and the CLI syntax omits primary-launch options. No normative work-attachment algorithm exists. |
| C5 | Directory existence is work-item authority; active/archive roots and `__status.json` drive artifact placement (`invariants-cli.md:88-92`) | **Partial** | Artifact directories remain visible (`v1-architecture.md:714-740`), but the DB is described as an index while work-status co-authority is left open at `1334`. The source contract cannot be implemented until that authority question is closed. |
| C6 | Post-write, non-blocking lifecycle hooks with deterministic/idempotent event identity (`invariants-cli.md:102-107`) | **Partial** | Non-rollback failure behavior is specified (`v1-architecture.md:1076`) and §13 promises event-bus replacement (`1283`), but hook registration, dispatch timing, event identity/idempotency, and git-autosync triggers are absent. |
| C7 | Repo-local stable project identity plus user runtime root; moving a repo must not orphan history; reads must not initialize (`invariants-cli.md:113-118,175-180`) | **Partial** | `projects.id` is stable and read/write initialization is asserted only in §13 (`v1-architecture.md:581-587,1256`). DB location, root relocation, duplicate/moved-root reconciliation, and rootless read flow are unspecified. |
| C8 | Per-spawn artifact tree and v2 `state.json`/prompt sidecar (`invariants-cli.md:120-152`) | **Broken (stated)** | DB state and prompt snapshots replace it (`v1-architecture.md:603-706,1298-1303`). Migration/debug exports are optional rather than compatibility guarantees. |
| C9 | `history.jsonl` causal envelope includes sequence, offsets, interrupt epoch/staleness, IDs, payload/raw text, with truncation-tolerant reads (`invariants-cli.md:154-159`) | **Partial** | DB events carry sequence and common IDs (`v1-architecture.md:852-878`), but `byte_offset`, `interrupt_epoch`, `stale_after_interrupt`, replay/gap semantics, and a replacement for partial-tail tolerance are not mapped. |
| C10 | Event-sourced session start/stop/update, leases, repair, continuation, and active-work state (`invariants-cli.md:161-166`) | **Partial** | Session/thread/turn tables exist (`v1-architecture.md:603-646`) and `session repair` is named (`103`), but no lease, repair, resume/continue, crash transition, or event materialization flow is specified. |
| C11 | Crash-only atomicity and truncation tolerance (`invariants-cli.md:168-173`) | **Redesigned** | Transactions, WAL, append-only ordered journals, and idempotent startup recovery replace tmp+rename/JSONL (`v1-architecture.md:560-577`). Recovery detail remains a separate gap (C27). |
| C12 | Reaper runs only from safe root processes, treats malformed depth as non-root, and uses heartbeat/managed-primary strategies (`invariants-cli.md:182-187`) | **Drift — claimed Carry** | §13 says the old gating is carried (`v1-architecture.md:1257`), while the architecture makes one daemon the authority (`277`) and gives only a heartbeat column/dashboard statement (`692,1106,1188`). There is no reconciliation state machine or managed-primary strategy, so the old gating neither maps cleanly nor has a replacement. |
| C13 | Full config precedence and `None` versus empty-string semantics (`invariants-cli.md:189-211`) | **Partial** | Package ownership and a condensed precedence sentence exist (`v1-architecture.md:220-221,1258`), but profile/model-policy/agent ordering, hook precedence, per-field provenance, empty-string handling, and mutation/read surfaces are not specified. |
| C14 | Exact `MERIDIAN_*` child environment contract, including `MERIDIAN_TASK_DIR`, bind-time variables, state/home overrides, and no mid-session updates (`invariants-cli.md:224-306`; `invariants-prompts.md:101-112`) | **Drift — claimed Carry** | v1 defines only renamed `VOLUMA_*` variables and replaces task dir with `VOLUMA_WORKSPACE` (`v1-architecture.md:115,369-370,734-740,1259-1271`). No `MERIDIAN_*` aliases, deprecation bridge, or explicit break is listed. `MERIDIAN_CHAT_ID` is stated by the prompt report to require exact preservation (`invariants-prompts.md:103-110`). |
| C15 | Work IDs/dirs and runtime dir are rebound, not blindly inherited (`invariants-cli.md:242-255`) | **Carried, renamed** | §13 specifies bind-from-launch-scope and runtime-dir stripping for the `VOLUMA_*` equivalents (`v1-architecture.md:1259-1260`). Compatibility with existing names is not carried (C14). |
| C16 | Runtime policy/config ENV overrides, state-root overrides, guardrail flags, hooks enable flag (`invariants-cli.md:257-284`) | **UNADDRESSED** | Apart from `VOLUMA_SECRET_*`, daemon URL/token, and broad config precedence, the design has no variable inventory or replacement for these operational controls. |
| C17 | Allowlisted child env; strip ambient secrets (`invariants-cli.md:285-289`) | **Carried** | Stored grants, token/key/secret stripping, and unknown-prefix stripping are specified at `v1-architecture.md:913-967`. |
| C18 | Agent-critical CLI paths and exact executable contract (`meridian ...`) (`invariants-cli.md:318-357`; `invariants-prompts.md:28-99`) | **Drift — claimed Carry** | v1 exposes `voluma ...`, not `meridian ...` (`v1-architecture.md:94-111`), while §13 calls these paths preserved (`1261`). No alias or intentional break is documented. Config, ext, hooks, task-dir, sync, workspace, telemetry, streaming, test, serve, init/bootstrap, migrate, and completion groups from `invariants-cli.md:328-345` are also absent. |
| C19 | Spawn output: report/transcript hint, metadata, no-report, JSON, background wait instructions (`invariants-cli.md:358-369`) | **Drift — claimed Carry** | The only specification is the §13 assertion (`v1-architecture.md:1262`); §§2 and 5 define neither output schema nor foreground/background waiting behavior. |
| C20 | Spawn refs include latest/failed/completed, `p`, `c`, and raw harness session ID (`invariants-cli.md:371-373`) | **Partial** | `p`, `c`, and three aliases are accepted (`v1-architecture.md:597-601`); raw harness IDs are only asserted in §13 (`1263`) with no resolver or ambiguity rules. |
| C21 | Rootless/read-runtime/write-runtime/primary invocation classes control bootstrap side effects (`invariants-cli.md:375-384`) | **UNADDRESSED** | A sentence permits rootless direct config reads (`v1-architecture.md:96`), but command classification and auto-init/reaper side effects are not designed. |
| C22 | `--fork` identity lock, `--fork-fresh` mutability, `--from` reference-only, `--continue` behavior (`invariants-cli.md:386-390`) | **Drift — claimed Carry** | §13 repeats only the fork policy (`v1-architecture.md:1264`). The CLI inventory omits these options and the thread model has no fork/continue materialization flow. |
| C23 | Harness translation has an extensible adapter/bundle registration seam and total field accounting (`invariants-cli.md:398-406`; `overview.md:53-58`) | **Drift** | `AgentHarness.id` is a closed two-value union (`v1-architecture.md:514-526`), not a self-contained bundle registration seam. This contradicts the supporting design’s “bundle owns everything” decision. |
| C24 | Claude parent-only terminal result semantics, once-only session observation, TUI reconciliation, large prompt files, and generic Agent denial (`invariants-cli.md:420-443`) | **Partial** | Large prompt files and Agent denial are covered (`v1-architecture.md:503-508`). The Claude stream parser, parent/child result discrimination, once-only session-ID observation, and TUI reconciliation are absent. |
| C25 | Persist → observe → fan-out, with failure after ten consecutive persistence errors (`invariants-cli.md:454-458`) | **Partial** | Ordering is explicit (`v1-architecture.md:500,878,1266`); persistence-failure threshold, backpressure, retry, and “do not observe if persist failed” behavior are not. |
| C26 | Launch composition: one composition path, observe session once, materialize fork only after row, warnings through one channel, resolve-before-persist (`invariants-cli.md:460-479`) | **Partial** | Resolve-before-persist is concrete (`v1-architecture.md:492-501,988-993,1285`); fork/session-observation/warning invariants have no flow. |
| C27 | Recovery converges crashed active spawns without corrupting terminal authority; daemon/process crashes and partial writes are explicit failure cases (`invariants-cli.md:95-100,168-187`) | **UNADDRESSED** | “Idempotent recovery,” a heartbeat column, and indexed reaper query are all the design says (`v1-architecture.md:562,692,1106,1188`). It does not say how `queued`/`running`/`finalizing` rows are reconciled, how a surviving process is adopted or killed, or how completion evidence is recovered. |
| C28 | Control supports inject, interrupt, permission replies, and user-input replies with correlated responses (`invariants-cli.md:571-588`) | **Drift — claimed Carry** | §13 claims semantic preservation (`v1-architecture.md:1265`), but `HarnessRunHandle` only has interrupt, inject, and stop (`520-526`). There is no pending-request store or permission/user-input reply API. |
| C29 | Cross-platform process-scope termination, Windows Job Objects, POSIX groups, capture-before-stop (`invariants-cli.md:553-570`) | **Drift — claimed Carry** | §13 promises all platforms (`v1-architecture.md:1267`), but sandbox coverage names bwrap/seatbelt only (`65,924-951`) and Windows depth is left open (`1329`). The supporting foundation says Job handles are currently broken and must be Phase 0 (`harness-agnostic-foundation.md:95-128`). No process-handle contract or cancellation ordering closes that gap. |
| C30 | Public plugin/extension API remains the only stable external import seam (`invariants-cli.md:601-605`) | **UNADDRESSED** | v1 has no plugin/extension surface and omits `ext`; neither a break nor a migration is recorded. |
| C31 | Files are runtime authority (`invariants-cli.md:607-611`; `overview.md:45-51`) | **Broken (stated), cross-doc contradiction** | v1 explicitly chooses DB/Yjs authority (`v1-architecture.md:560-562,1287,1311`). That is honestly registered, but `overview.md` still says local state remains file-authoritative; the supporting design needs supersession labeling. |

### Flow collaboration and shared-package contracts

| ID | Inherited invariant | v1 status | Evidence or gap |
|---:|---|---|---|
| F1 | One mutator at a time per document; one live Y.Doc owner; idempotent journal replay (`invariants-flow-collab.md:54-79`) | **UNADDRESSED** | The design names an LRU Y.Doc cache and a shared authority (`v1-architecture.md:279-302,1187`) but no keyed mutex/transaction, coordinator contract, or replay algorithm. Browser, agent, external-file, and projection paths can therefore race without a defined serializing boundary. |
| F2 | `ensureDocument` is idempotent, checks per-document schema before upsert, initializes seq-0 checkpoint, and never clobbers content (`invariants-flow-collab.md:94-110`) | **Partial** | Tables carry schema versions and cold open checkpoints a new journal (`v1-architecture.md:430-439,742-805`), but the stale-schema fence, idempotent lifecycle contract, and no-clobber transaction are absent. |
| F3 | Ordered journal and reversal invariants: monotonic seq, `w<N>`, scoped writes, reserved client IDs, compaction/cold reconstruction (`invariants-flow-collab.md:123-145`; `invariants-flow-packages.md:150-169,356-368`) | **Partial** | Seq-keyed updates, checkpoints, counters, mutations, and reversals are modeled (`v1-architecture.md:772-850`). Reserved client band `[0,999]`, undo client `999`, compaction boundary/retention, scope/branch generation, and transaction semantics are missing. |
| F4 | Human WebSocket updates are tracked, persisted asynchronously, drained before checkpoint, and reserved client IDs are rejected (`invariants-flow-collab.md:175-186`) | **UNADDRESSED** | v1 reuses `/ws/yjs` and says the web editor shares Yjs (`v1-architecture.md:125-136,1221-1227`), but specifies no WS-to-journal persistence flow. The only write sequence is the agent `WriteService` path (`279-302`). |
| F5 | Actor/session binding or an explicit thread-ID substitute supplies stable identity (`invariants-flow-collab.md:149-157`; `invariants-flow-packages.md:187-189`) | **Partial** | ActorRef has thread/session IDs (`v1-architecture.md:317-332`), but no bind/resolve/evict behavior is defined for external MCP/CLI callers. Capability-token binding may replace it, but that redesign is not stated. |
| F6 | Cold undo/redo reconstructs from journal; undo/reversal persistence is atomic; turn reversal spans all touched docs (`invariants-flow-collab.md:161-171`) | **Partial** | Reversal tables and service methods exist (`v1-architecture.md:304-315,815-847`), but the reconstruct/read-retention guarantee, atomic status flip + update append, multi-document turn orchestration, and partial-failure behavior are unspecified. |
| F7 | Model-response lifecycle stages writes, commits after a successful tool batch, rolls back on failure, and cleans staged creates (`invariants-flow-collab.md:193-209`; `invariants-flow-packages.md:549-559`) | **Partial** | `commitResponse`/`rollbackResponse`, response IDs, and turn grouping exist (`v1-architecture.md:304-315,394-403,1004-1011`), but the API harness orchestration order and staged-create cleanup are not specified. |
| F8 | `tool_use_id` makes retries idempotent; on the successor it is scoped by response/turn (`invariants-flow-packages.md:127-132,251-273`) | **UNADDRESSED** | The field is accepted (`v1-architecture.md:356-403`) but no uniqueness key, cached outcome, or replay behavior exists in the schema or flow. A retry can therefore create a second mutation. |
| F9 | Exact `WriteCommand` and `WriteOutcome` contract, including stable status text and structured content (`invariants-flow-packages.md:94-146`) | **Carried** | v1 imports the command schema and common output, prohibits binding-specific paraphrase, and carries text/content fields (`v1-architecture.md:378-427`). |
| F10 | `SyncStateStore` post-restart baselines or successor `interactionContext` must be chosen (`invariants-flow-packages.md:181-185,251-275`) | **UNADDRESSED (open)** | v1 leaves the package pin open and makes the table conditional (`v1-architecture.md:850,1326`). This blocks a complete adapter contract and concurrent-edit attribution. |
| F11 | ContextPort schemes (`manuscript`, `kb`, `user`, `work`, `uploads`), tracked-document registration, and projection-as-cache (`invariants-flow-collab.md:212-218`) | **Partial** | Project-relative documents and projection-as-cache are covered (`v1-architecture.md:430-439,742-770`), but URI schemes, uploads/user/manuscript roots, `stat`/`ensureTrackedDocument`, and safe cross-context resolution are absent. |
| F12 | Write/list/search/ask-user are wired through one context and error boundary (`invariants-flow-collab.md:203-209`; `invariants-flow-packages.md:549-561`) | **Partial** | `capabilities` names future write/read/search/ask bindings (`v1-architecture.md:217`), but only write has a public contract. List/search/ask-user definitions, interrupts, and outputs are not designed. |
| F13 | Projection/hook failures do not roll back a committed journal write (`invariants-flow-collab.md:222-234`) | **Carried** | Explicit at `v1-architecture.md:1076`. |
| F14 | External file changes merge safely with live CRDT state; inactive disk state refreshes only after safety checks (`v1-architecture.md:430-439`, inheriting ContextPort/projection behavior) | **Partial** | The policy is stated, but “safety checks,” watcher echo suppression, projection-loop prevention, conflict attribution, and crash ordering are not specified. |

### mars-agents and prompt-package contracts

| ID | Inherited invariant | v1 status | Evidence or gap |
|---:|---|---|---|
| M1 | Mars stays a subprocess/compiler; Voluma does not reimplement resolution, lowering, lock ownership, or launch policy (`invariants-mars.md:7-25,142-158`) | **Carried** | Explicit at `v1-architecture.md:1108-1134`. |
| M2 | Root discovery uses explicit/control root from nested task dirs and never mistakes managed output dirs for roots (`invariants-mars.md:31-42`) | **Partial** | `--root <VOLUMA_PROJECT_DIR>` injection is covered (`v1-architecture.md:1127-1131`), but walk-up behavior, managed-dir rejection, and compatibility with `MERIDIAN_PROJECT_DIR` are not. |
| M3 | Canonical `.mars` inputs/outputs, `mars.toml`/local/lock, target dirs, and compiled-agent catalog ownership (`invariants-mars.md:44-126`) | **Carried** | v1 preserves the named files, reads `.mars/agents`, and repeats lock identity (`v1-architecture.md:1114-1134,1269`). Mars remains the implementing authority. |
| M4 | Mars deletion/collision safety and resolve-before-mutate are preserved by delegation (`invariants-mars.md:128-136`) | **Carried by dependency** | v1 says Mars retains lock ownership and package resolution (`v1-architecture.md:1110,1134`). The registry should reference this safety contract explicitly rather than reducing it to “filesystem.” |
| M5 | Passthrough streams output, maps global `--format json` to `--json`, injects root, sets managed mode, and propagates exit 0/1/2/3 (`invariants-mars.md:160-169,218-235`) | **Partial** | Root injection, renamed managed env, and exit codes are explicit (`v1-architecture.md:1125-1132`). JSON-mode injection, streaming/capture behavior, and the original `MERIDIAN_MANAGED` compatibility are absent. |
| M6 | `init --add/--link` sequencing and the full user-facing Mars/prompt command set remain available (`invariants-mars.md:171-202`; `invariants-prompts.md:82-99`) | **UNADDRESSED** | Generic passthrough makes raw Mars commands possible, but Voluma-owned init/config/link sequencing and aliases are not designed. `sync conflict`, config mutation, KG/Mermaid/QI outputs, and exit-code contracts are only named or omitted. |
| M7 | Optional catalog/outdated calls degrade gracefully; model resolve and launch-bundle failures are hard (`invariants-mars.md:204-216`) | **Carried** | v1 explicitly keeps optional-call degradation and hard launch-bundle failure with stderr (`v1-architecture.md:1175`). |
| M8 | `MARS_OFFLINE`, probe timeouts, and “sync does not require installed harnesses” separate offline materialization from live routing (`invariants-mars.md:237-245,358-365`) | **UNADDRESSED** | No offline/probe contract appears in any v1 design. Local-first is not sufficient: a missing binary or network must not turn sync into a launch probe failure. |
| M9 | Source package/profile/skill formats and launch-time skill-body authority remain Mars-owned (`invariants-mars.md:249-317,403-430`) | **Carried** | The launch-bundle schema carries agent body, skill body, tool and provenance surfaces (`v1-architecture.md:1140-1175`); package resolution remains in Mars. |
| M10 | Partial sync writes the lock even when some target sync fails; unmanaged collisions are preserved; no silent auto-sync on spawn (`invariants-mars.md:323-399`) | **UNADDRESSED** | These failure/trigger semantics are absent. Delegating to Mars preserves Mars internals, but Voluma still must specify how it reports partial success and must not add an implicit sync trigger. |
| M11 | Managed agent emission and `agent_copy`/fanout exceptions preserve the generic-Agent delegation boundary (`invariants-mars.md:367-386`; `invariants-cli.md:518-522`) | **Partial** | Generic Agent denial is preserved (`v1-architecture.md:503-508`), but managed-mode rename plus no `agent_copy`/fanout template contract can change which native agents Mars emits. |
| M12 | Worktree guard writes `mars.local.toml` with `targets=[]` to avoid polluting another checkout (`invariants-mars.md:388-399`) | **UNADDRESSED** | v1 removes managed-worktree flags (`v1-architecture.md:1305`) but does not replace the safety invariant for user-owned multi-checkout workspaces. |
| M13 | Mars routing output and Meridian's supported harness roster must agree; changing the roster is a joint migration (`invariants-mars.md:434-476`) | **UNADDRESSED** | Mars can return Claude/Codex/Pi/OpenCode/Cursor, while v1 accepts only `claude-code` or `api` (`v1-architecture.md:443-450,514-540`). There is no mapping, rejection, config migration, or Mars schema change. |
| M14 | Config remains two surfaces: package/routing in Mars, runtime/work/hooks in Meridian (`invariants-mars.md:480-493`) | **Partial** | Package ownership is sketched (`v1-architecture.md:220-221,238,1108-1135`), but no Voluma config schema/file names or exact boundary exists; `surface-architecture-notes.md:35-54` additionally proposes DB-ingested catalogs not represented in the build schema. |
| P1 | Prompt packages call exact `meridian spawn --prompt-file --bg`, `spawn wait`, `--from`, `-f`, `--task-dir`, sandbox/approval/model/harness flags, and parse `spawn subagents` output (`invariants-prompts.md:30-45,134-140`) | **Drift — claimed Carry** | v1 lists a renamed spawn group but defines none of these options or `wait` barrier/output semantics (`v1-architecture.md:94-123`). This is a silent breaking change to executable prompts and the deny-generic-agent hook. |
| P2 | Primary launch accepts agent/work/task-dir/prompt/from and `-C` (`invariants-prompts.md:47-53`) | **UNADDRESSED** | `voluma` is listed without an option contract (`v1-architecture.md:101`). Thread creation does not define primary CLI argument mapping. |
| P3 | Work command lifecycle, session-scoped attachment, orchestrator update ownership, free-form status, and task-dir behavior (`invariants-prompts.md:54-64,142-152`) | **Drift** | Most command names appear (`v1-architecture.md:104`), but `task-dir` becomes `workspace`, environment compatibility is dropped, status/ownership/session-scope semantics are absent, and authority is open (`714-740,1334`). |
| P4 | Session mining is segment-local; log options and search emit runnable `Open:` commands (`invariants-prompts.md:66-77`) | **Drift — claimed Carry** | §13 asserts preservation (`v1-architecture.md:1272`), but there is no segment field, segmentation algorithm, option/output contract, or `Open:` formatting anywhere else in v1. |
| P5 | Context commands expose work/KB/strategy/archive paths and preserve local/git-backed context layouts (`invariants-prompts.md:78-80,116-130`) | **Partial** | Context names and dynamic env dirs are listed (`v1-architecture.md:105,1259-1271`), but context storage, clone/ref resolution, fallback behavior, and command outputs are missing. |
| P6 | Generic harness Agent tool is denied; delegation goes through the coordinator CLI (`invariants-prompts.md:136-140,160-162`) | **Carried, renamed** | Explicit for Claude managed prompts (`v1-architecture.md:503-508`). Existing prompt compatibility still fails without a `meridian` alias (C18/P1). |
| P7 | Prompt env values are fixed for a running session; callers re-query current work after changes (`invariants-prompts.md:101-112`) | **Partial** | The immutability sentence is repeated in §13 (`v1-architecture.md:1271`), but the renamed query surface and work-current output are not specified. |
| P8 | Active agent profile frontmatter (mode/model/harness/effort/model-policies/subagents/skills/tools/sandbox/approval) survives compilation and launch (`invariants-prompts.md:180-206`) | **Partial** | Launch bundle contains most execution fields (`v1-architecture.md:1140-1172`), but `mode`, `subagents` allowlist/output, and unsupported-harness routing are not mapped. |

### Cross-design commitments

| ID | Inherited/proposed commitment | v1 status | Evidence or gap |
|---:|---|---|---|
| X1 | Three clients over one ops layer: CLI, per-spawn spawn MCP, and shared query MCP (`surface-architecture-notes.md:7-33`) | **Drift** | v1 has only CLI and `apps/mcp-write`; neither coordination MCP is in the package/process diagrams (`v1-architecture.md:138-225`). This drops tool-first spawn, long-poll wait/notifications, unmanaged query access, escalation, and completion acceptance. |
| X2 | Query MCP exposes catalog/config reads; Mars batch publish is ingested into normalized agent/skill DB rows (`surface-architecture-notes.md:35-67`) | **Drift** | v1 reads `.mars/agents` at runtime and has no `agent_definitions`, `skills`, or package-version tables (`v1-architecture.md:1108-1135`). The two designs choose different runtime catalog authorities. |
| X3 | Canonical `HarnessEvent` remains the common event envelope (`overview.md:38-43`; `harness-agnostic-foundation.md:57-65`) | **Carried** | v1 specifies the common envelope and DB event sink (`v1-architecture.md:529-545,1027-1076`). |
| X4 | Unified `SessionProvider` deletes per-harness scraping and owns continuation/session identity (`harness-agnostic-foundation.md:95-123`) | **UNADDRESSED** | v1 has a `harness_session_id` column but no provider port or lifecycle. This is especially visible in the missing Claude observation/continue flow (C24). |
| X5 | Windows Job-handle containment is a prerequisite Phase 0 (`harness-agnostic-foundation.md:95-128`) | **Drift — claimed Carry** | v1 claims cross-platform containment in §13 but leaves Windows sandbox depth open and supplies no Job/process-scope design (`v1-architecture.md:924-951,1267,1329`). |
| X6 | Foundation keeps Pi first-class and Codex app-server structured transport (`harness-agnostic-foundation.md:30-70`) | **Broken (stated), cross-doc contradiction** | v1 explicitly drops native Pi/Codex (`v1-architecture.md:443-450,1298-1301`). The break is honest in v1, but the supporting foundation must be marked superseded to avoid two incompatible build targets. |

## Ranked gaps

### Blocker 1 — Exact CLI and environment compatibility is silently broken

**Invariants:** C14, C18, C19, C22, P1–P5.  
**Why it matters:** the current prompt packages are executable clients, not prose
documentation. They invoke `meridian`, parse its output, and read exact
`MERIDIAN_*` names.  
**Concrete failure:** the shipped `deny-generic-agent` hook suggests `meridian
spawn`; a worker runs it and gets command-not-found. If a wrapper exists but only
exports `VOLUMA_CHAT_ID`, session mining and work attachment silently scope to the
wrong/default session. `meridian spawn --bg` also has no specified compatible
wait output.  
**Classification:** **intentional product rename but undocumented break**, plus
genuine omissions in option/output semantics.  
**Required direction:** either carry an explicit `meridian` compatibility binary
and dual-export environment aliases for v1, or move the entire prompt-package
migration into the Break registry with an atomic rollout plan. Specify the CLI
option and output contracts outside §13.

### Blocker 2 — Human Yjs edits have no durable, serialized journal path

**Invariants:** F1–F4, F13–F14.  
**Why it matters:** live human/agent CRDT collaboration is v1’s stated product
difference (`v1-architecture.md:32-39`), yet only agent writes have a
persist-before-project sequence.  
**Concrete failure:** a browser edit arrives while an agent write reserves the
next sequence. Without a per-document coordinator/transaction and WS pending
drain, both paths can race for the head; the UI sees the edit, then a daemon crash
replays only the agent update and loses the human change. A checkpoint can also
overtake an unpersisted connection update.  
**Classification:** **genuine omission**.  
**Required direction:** make `DocumentCoordinator` a normative port, name the
single per-document serialization boundary, and specify browser/external/agent
update append, acknowledgement, fan-out, checkpoint drain, recovery, and
projection ordering.

### Blocker 3 — The committed spawn/query MCP architecture is absent

**Invariants:** X1–X2, C28, F12.  
**Why it matters:** the surface notes deliberately make coordination usable from
any harness and put identity/capability clamping on a per-spawn channel. The build
target only has an MCP write facade and reverts spawning/query to bash CLI.  
**Concrete failure:** an unmanaged Cursor/CI agent cannot query transcripts or
resolved context through the promised shared module; a managed worker cannot use
tool-first spawn, long-poll wait, escalation, or completion acceptance. Capability
identity is consequently reconstructed from a bearer token over generic CLI RPC
rather than the per-spawn binding the notes commit to.  
**Classification:** **intentional-or-accidental drift between proposed design
artifacts; not recorded in §13**.  
**Required direction:** add both MCP apps, verb contracts, auth/binding, long-poll
wait and notification fallback to the build target, or explicitly supersede the
surface notes and record the break.

### High 4 — Session mining is asserted but not designed

**Invariants:** C9–C10, P4, X4.  
**Why it matters:** agents use transcripts to recover context and hand work off.
“Segment-local” is a semantic rule, not an implementation detail.  
**Concrete failure:** `session search` finds text from a previous segment but emits
an unscoped log command. The next agent opens the current segment, sees no hit,
and concludes the decision never happened. Continuation also lacks a stable
harness session provider.  
**Classification:** **silent drift — §13 claims Carry**.  
**Required direction:** specify segment representation in the DB, log/search
defaults, every prompt-used option, deterministic `Open:` formatting, replay/gap
behavior, repair, continuation, and the `SessionProvider` seam.

### High 5 — Request/reply control, escalation, and drain ownership are missing

**Invariants:** C19, C28, P1, X1.  
**Why it matters:** interrupt is not enough for interactive agents. Permission and
user-input requests must remain correlated and a parent must know when it owns a
background wait/drain.  
**Concrete failure:** Claude emits a permission request; the daemon persists an
event but offers no reply API, so the spawn hangs. A parent starts two background
spawns, loses its MCP pipe, and no contract says whether the daemon, parent, or a
new caller owns/drains completion.  
**Classification:** **silent drift** for request meanings and **genuine omission**
for escalation/drain ownership.  
**Required direction:** add a pending-request model and correlated reply verbs;
define cancel/escalate/report/accept semantics; define wait idempotency, ownership,
disconnect, reattach, timeout, and notification fallback.

### High 6 — Cross-platform containment is overclaimed

**Invariants:** C29, X5.  
**Why it matters:** cancellation must stop the whole process tree; otherwise an
agent can continue mutating or consuming credentials after its spawn is terminal.
The supporting foundation explicitly says the Windows handle path is not working.  
**Concrete failure:** on Windows, the runner is marked cancelled but its child
compiler/server process survives because the Job handle was not threaded into
termination. Startup recovery later sees a terminal DB row and has no owner for
the live process.  
**Classification:** **silent drift — §13 claims Carry while §15 leaves it open**.  
**Required direction:** make Phase 0 a v1 prerequisite and specify the single
process-scope handle, snapshot-before-stop ordering, per-platform kill escalation,
Daytona disposal, and recovery interaction.

### High 7 — Claude terminal/session semantics were lost in the adapter reduction

**Invariants:** C20, C23–C26, X4.  
**Why it matters:** Claude is the one native subprocess v1 retains; its brittle
parent/child result and session identity rules therefore remain requirements.  
**Concrete failure:** a child tool result is mistaken for the parent result and
the spawn finalizes early, or the parent finishes but no raw session ID is stored,
breaking `--continue`, raw-session references, and transcript recovery.  
**Classification:** **genuine omission concealed by the broad “terminal extraction
redesign” entry**.  
**Required direction:** define the Claude parser’s terminal signal, parent
correlation, error/EOF behavior, once-only session observation, TUI reconciliation,
and continuation/fork materialization through a bundle/SessionProvider seam.

### High 8 — Startup recovery is a slogan, not a recovery protocol

**Invariants:** C11–C12, C27.  
**Why it matters:** replacing files with a daemon/DB changes the crash boundary.
Transactions prevent torn rows; they do not decide what a surviving process or a
stale `finalizing` row means.  
**Concrete failure:** the daemon crashes after the harness writes durable
completion but before finalization. On restart, the row is `running`, the process
is gone, and a late cancel races the recovered completion. The design gives no
recovery evidence order, CAS, adoption, or kill rule.  
**Classification:** **under-specified redesign**.  
**Required direction:** provide a state-by-state startup table for process alive/
dead, heartbeat fresh/stale, completion present/absent, and terminal origin;
include managed primary and remote sandbox leases.

### High 9 — Work/task/context flows no longer satisfy prompt clients

**Invariants:** C4–C7, C13–C16, P2–P5, F11.  
**Why it matters:** source checkout, control root, work artifact root, and context
root are deliberately different. Collapsing task dir into a three-level workspace
without mapping the other roots risks editing and syncing the wrong checkout.  
**Concrete failure:** a product lead attaches a work item whose source is a
separate worktree. `work task-dir` no longer exists; spawn falls back to project
root, while Mars correctly targets the control root. The agent edits one checkout
and builds another.  
**Classification:** the six-level simplification is **intentional and documented**,
but prompt/work/context compatibility and authority are **undocumented breaks or
omissions**.  
**Required direction:** specify one vocabulary and mapping for control root,
workspace/task checkout, work artifact dir, and named context dirs; then migrate
commands/env atomically and close work status authority question 9.

### High 10 — Agent-edit retry, schema, reversal, and compaction invariants are incomplete

**Invariants:** F2–F3, F6–F10.  
**Why it matters:** these rules prevent duplicate writes, stale-schema corruption,
and undo history disappearing after restart/compaction.  
**Concrete failure:** an RPC timeout causes the caller to retry the same
`tool_use_id`; both requests receive new `w<N>` values and apply twice. Later
compaction drops the updates needed for cold undo because no retention boundary is
defined. Opening a document from an older collab schema then upserts the head
without fencing.  
**Classification:** **genuine omissions**, amplified by unresolved package pin.  
**Required direction:** resolve the package version before build order step 2;
specify the idempotency key/cache, schema fence, journal/head transaction,
reserved IDs, reversal transaction, compaction floor, and SyncState versus
interactionContext contract.

### High 11 — Mars routing and failure modes do not compose with the new harness surface

**Invariants:** M5–M13.  
**Why it matters:** Mars remains launch-policy authority, but its harness enum is
larger than Voluma’s closed harness union. Local-first also requires offline sync
and predictable partial-sync behavior.  
**Concrete failure:** `launch-bundle` returns `codex`; the DB row has already been
reserved or the adapter rejects an unknown harness with no migration guidance.
Separately, an offline `mars sync` is incorrectly treated as a live harness probe,
or a partially successful sync is surfaced as total failure even though the lock
was updated.  
**Classification:** reduced native adapters are **intentional and documented**;
the routing mapping, offline behavior, init flow, agent-copy policy, worktree
safety, and partial-sync reporting are **genuine omissions**.  
**Required direction:** define accepted bundle harness values and mapping/rejection
before persistence; retain Mars offline/materialize semantics; specify init,
partial-success, no-auto-sync, and multi-checkout target guards.

### Medium 12 — Supporting design documents contain incompatible authorities

**Invariants:** C23, C31, X2, X6.  
**Why it matters:** implementers cannot tell which artifact is normative when all
are in the required read set.  
**Concrete failure:** one lane implements file-authoritative local state and Codex
app-server from the foundation, while another implements DB authority and drops
Codex from v1. A third builds DB-ingested Mars catalogs that do not exist in the
v1 schema.  
**Classification:** the v1 breaks are mostly stated, but **cross-document
supersession is omitted**.  
**Required direction:** add explicit superseded-by notes and update cross-links;
either fold surviving commitments into v1 or remove the older documents from the
build-target read set.

## Registry honesty summary

- **Honest/stated breaks:** runtime file schemas and `history.jsonl` authority,
  the reduced native-harness set, Pi drain authority, prompt sidecars, target
  sprawl, and the old task-dir cascade.
- **Overclaimed carries:** exact CLI/env compatibility, work attachment, spawn
  output modes, fork policy, session mining, control request meanings, reaper
  gating, process containment, and portions of Mars passthrough.
- **Missing from the registry:** browser-update durability, per-document
  serialization/recovery, write idempotency, collab schema fencing/compaction,
  spawn/query MCP surfaces, SessionProvider, permission/user-input reply state,
  drain ownership, offline/partial Mars behavior, Mars-to-harness routing, plugin
  API disposition, and work/context/task migration.

**Matrix totals:** 73 significant items checked — **14 Carried**, **1 Redesigned**,
**3 stated Breaks**, **25 Partial**, **15 Drift**, and **15 Unaddressed**. (Items
whose status includes a cross-document contradiction are counted under their
primary classification.)

The correct short answer is therefore **no**: §13 catches the largest architectural
breaks, but it is neither complete nor sufficiently evidenced to be honest about
agent-facing compatibility and CRDT failure semantics.
