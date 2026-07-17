# Structural review: Voluma v1 surface and layering

**Verdict: request changes before treating this as a build target.** The broad
direction—one authority process, mediated writes, harness adapters, and explicit
capabilities—is viable. The current seams are not. In particular, the design
uses the selected surface as authorization, calls an opaque event bag a
canonical model, models a remote leased resource as a local disposable handle,
and claims one local/hosted persistence model where the proposed keys cannot
survive peer sync. Those are foundation defects: implementation will otherwise
cement them into every route, repository, adapter, and recovery path.

## Review scope and design axes

I reviewed the requested corpus in order and checked its cross-document
contracts against five axes: authority, dependency direction, lifecycle
ownership, portable identity, and change locality. This is a design review;
there is no implementation to build or probe. Findings below distinguish
contradictions already present in the contracts from risks that depend on a
future implementation choice.

## Confirmed structural defects

### 1. **Blocker — the surface is being used as the principal, creating a documented root confused deputy**

**Claim attacked.** The surface proposal says the per-spawn stdio channel “IS
the identity,” the query module needs no identity beyond read access, all three
clients share one policy layer, and a hand-wired spawn module is a top-level
caller with default caps ([surface notes, lines 7–33](../surface-architecture-notes.md#two-mcp-modules-split-by-privilege-and-binding--not-topic)). The build target
simultaneously says agents keep the bash CLI, capability tokens protect
spawn-scoped mutations, and the daemon does not trust agent-reported authority
([v1 architecture, §§2.1–2.2 and 7.1](../v1-architecture.md#21-cli-surface)).
The cap contract has already proven the missing premise: a worker that drops its
ambient identity looks like a fresh human invocation
([capability caps, lines 233–245](../../codebase-audit-rewrite/design/capability-caps.md#tier-1-local-single-user-defense-in-depth)).

**Failure scenario.** Spawn `p7` has read-only `own` and `delegation`. It has
shell access, so it starts the same spawn MCP command that a human may hand-wire,
without `p7`'s injected environment. Per the proposal this new channel is a
top-level caller with default caps; it can now create a broader child. If the
daemon instead requires the worker token, then the channel was never the
identity and the stated hand-wire behavior cannot work without a separate root
credential. The query side has the same category error with lower apparent
severity but wider reach: an unmanaged CI agent can connect “from anywhere” and
read session transcripts, context, and effective configuration simply because
those operations were classified as reads. A verb allowlist is not caller
authorization.

**Structural fix.** Make every operation accept a daemon-created
`RequestContext { principal, project, capability, channel, requestId }`.
Surfaces authenticate and construct that context; `lib/ops` authorizes it.
Bind worker credentials to one spawn, one project, a verb set, and an expiry;
never infer root authority from a missing token, environment, cwd, or a newly
opened channel. A standalone spawn MCP must require an explicit interactive
root/control-plane credential that workers do not receive. Split genuinely
public catalog reads from project-scoped transcripts/config reads. The same
rule should remove caller-authored identity from host APIs: for example,
`WriteService` currently accepts `ActorRef`, `cwd`, and origin from the caller
([v1 architecture, §4.1](../v1-architecture.md#41-shared-authority-interface));
those values should be derived from the authenticated context and stored spawn
record.

### 2. **Blocker — the database keys are local ordinals, but the product promises multi-authority peer sync**

**Claim attacked.** The build target claims SQLite and Postgres use the same
schema behind a Drizzle adapter and offers hybrid and multi-device deployments
([v1 architecture, lines 49–67](../v1-architecture.md#2-product-surfaces)). The
schema makes `p<N>`, `c<N>`, project event sequence, and document update
sequence single-project ordinals; it also stores mandatory absolute paths in
the portable document row
([v1 architecture, §§6.2, 6.6–6.8](../v1-architecture.md#62-core-identity-tables)).
The sync section then says each device has its own authoritative SQLite DB,
Yjs/document metadata syncs, and absolute paths do not
([v1 architecture, §12](../v1-architecture.md#12-sync-and-hosted-deployment)).

**Failure scenario.** Laptop A and workstation B both start offline from the
same project and allocate `p41`, `c12`, event `seq=900`, and Yjs update
`(document D, seq=57)`. Both are valid locally. On relay/backup, the receiving
store hits primary/unique-key collisions; worse, references such as
`agent_edit_mutations.update_from_seq/update_to_seq` cannot be repaired by
renumbering without rewriting dependent history. The document row cannot be
copied as specified because `absolute_path` is `NOT NULL` but explicitly
local-only. Yjs can merge update payloads; this relational envelope cannot.

**Structural fix.** Separate globally portable identity from local display
ordinals and local projection state. Use globally unique IDs for every synced
entity/update/event (or a compound `{replicaId, localSeq}`), keep `p<N>`/`c<N>`
as aliases scoped to one authority, and make ordering causal/replica-aware
rather than a project-global counter. Move `root_path`, `absolute_path`, disk
hash/projection status, process IDs, and sandbox state into a per-replica
location/projection table. Define an explicit sync schema and merge contract;
do not promise that the operational SQLite/Postgres schema is itself the sync
model. SQLite/Postgres repository parity can then be limited to deployment
storage, not conflated with replication semantics.

### 3. **Major — `HarnessEvent` is opaque telemetry, not a canonical model, and it is also being forced to carry lifecycle authority**

**Claim attacked.** The framing claims one `HarnessEvent` deletes four parsers
and the per-harness terminal/activity tables
([foundation, lines 95–107](../../codebase-audit-rewrite/design/harness-agnostic-foundation.md#code-judo-targets--phases)). The actual type has
`eventType: string` and `payload: unknown`, while `HarnessRunHandle` exposes only
an event iterator—no completion/result contract
([v1 architecture, §5.3](../v1-architecture.md#53-unified-api-harness-path)).
The bundle contract confirms that every harness still needs custom terminal,
activity, signal, drain, and request-handler semantics
([bundle contract, §§1 and 4](../../codebase-audit-rewrite/design/bundle-contract.md#1-bundle-interface)).

**Failure scenario.** An API run emits tool output, then its transport drops
before the provider's completion event. The iterator closes. That can mean
successful completion, cancellation acknowledgement, transient disconnect, or
lost execution, yet `SpawnLifecycleService.recordExited` accepts a
`ProcessExit` and the run handle has no typed `completed()` result. An adapter
must guess from opaque event strings, recreating the terminal classifiers the
design says were deleted. Downstream consumers—drain, usage accounting,
monitoring, OTel, web timeline, recovery—must either understand provider event
names or trust lossy adapter guesses. Moving those switches into bundle files
improves locality; it does not eliminate the semantics or the parsers.

**Structural fix.** Split three contracts that change independently:

1. a lossless, versioned raw provider event for diagnostics/replay;
2. a typed discriminated union of canonical domain events (`TurnStarted`,
   `ToolRequested`, `ApprovalRequested`, `UsageRecorded`, etc.); and
3. a separate `RunOutcome` future/channel with explicit completion authority,
   cancellation acknowledgement, retryability, and transport-loss state.

Require adapters to map supported semantics into the typed union and preserve
raw events when no lossless mapping exists. The coordinator should finalize
from `RunOutcome`, not infer truth from observability traffic. Per-harness
parsers remain honest adapter responsibilities rather than being claimed as
deleted.

### 4. **Major — the sandbox port erases the remote resource lifecycle that the framing says is load-bearing**

**Claim attacked.** The foundation correctly says a remote substrate introduces
leases, heartbeats, idle GC, and auth propagation
([foundation, lines 72–93](../../codebase-audit-rewrite/design/harness-agnostic-foundation.md#axis-1-decision-substrate-is-the-by-construction-answer-fix-local-host-first)).
The build target nevertheless presents OS containment and Daytona as two
implementations of `createSandbox`/`destroySandbox`, returning an in-memory
handle with `exec/read/write/dispose`
([v1 architecture, §7.2](../v1-architecture.md#72-sandbox-modes)). No durable
sandbox/lease ID appears in the spawn schema, and no attach, renew, reconcile,
or idempotent provision operation exists.

**Failure scenario.** Daytona creates a container, but the response is lost.
The daemon retries and creates a second container. It then crashes; after
restart the DB says the spawn is active but contains no durable remote resource
identity, so recovery can neither reattach nor destroy either container.
Locally, process-scope death/reaping is the lifecycle; remotely, allocation and
lease ownership survive the coordinator process. Treating both as `dispose()`
pushes distributed failure handling into `packages/core`, daemon recovery,
events, DB, and each hosted route—the exact future 10-file edit this port was
supposed to prevent.

**Structural fix.** Do not force local process containment and remote execution
environments behind the same shallow lifecycle. Keep a common execution
capability only where semantics match, and give remote substrates a durable
resource contract: idempotency key, serialized resource ID, provisioning state,
lease/renewal, attach/reconcile, connectivity state, and idempotent release.
Persist that record transactionally with the spawn before launch. Make startup
recovery call the substrate reconciler, not reconstruct a handle from memory.

### 5. **Major — “mars is a compiler” has no publication boundary; the build target still invokes it as a launch-time authority**

**Claim attacked.** The surface notes say package/config resolution happens at
sync time, Voluma ingests versioned `agent_definitions`/`skills` rows, and the
server never resolves packages per request
([surface notes, lines 35–67](../surface-architecture-notes.md#config-and-mars-in-the-layering)). The build target says the daemon or CLI invokes
the mars subprocess, `mars build launch-bundle --json` is launch-policy
authority, and spawn creation resolves a mars bundle before process launch
([v1 architecture, §§5.2 and 10](../v1-architecture.md#10-mars-agents-integration)).
The proposed ingest tables/job do not exist in the package structure, schema,
or build order.

**Failure scenario.** Catalog version 17 is ingested into DB rows, then a user
changes local config/package state to version 18 while a spawn starts. If the
daemon calls `mars build launch-bundle`, the spawn can combine the v17 agent
body with v18 routing/tools/provenance. If it does not call mars, TypeScript must
reimplement live precedence/delegation or return a stale “effective config.”
The shared query server makes the ambiguity visible: `effective_config` depends
on project, caller overrides, parent cap, and a precise artifact version, so it
cannot be a context-free read over catalog/config files.

**Structural fix.** Choose one boundary and make it atomic. The cleaner compiler
model is an immutable, versioned resolved-catalog/launch-plan artifact emitted by
mars, transactionally ingested by Voluma, and pinned by digest/version on every
thread and spawn. Runtime applies only explicitly named dynamic inputs (for
example parent-cap clamping and workspace selection) to that snapshot. The
query surface can return a stored snapshot plus provenance; a separate
authorized “plan launch” operation resolves dynamic inputs. If launch-time mars
resolution is required, call it a runtime dependency and specify version
negotiation, availability, timeout, caching, and TOCTOU behavior instead of
maintaining both stories.

## Speculative risks worth flagging

### 6. **Major risk — the single `api` harness is likely to become the next central provider switchboard**

**Claim attacked.** v1 collapses Anthropic, OpenAI, Gemini, provider SDKs, and
the AI SDK into one unified API harness with only `harnessId: "api"`
([v1 architecture, §§5 and 5.3](../v1-architecture.md#5-harness-architecture)).
The earlier SDK contract already records divergent event vocabularies, session
stores, cancellation behavior, tool/HITL support, routing, and billing, and
therefore modeled Agents SDK as its own harness rather than a Codex transport
([SDK connections, §§2–5](../../codebase-audit-rewrite/design/sdk-connections.md#2-codex-sdk-connection-codex_sdk)).

**Failure scenario.** The second provider needs a server-side tool with an
approval pause and resumable request ID, while the first only supports local
function calls; the third reports cached usage after completion. A single API
adapter grows `if provider` branches across event mapping, tool execution,
cancellation, session persistence, capability projection, and usage. Adding a
provider then changes the harness package, canonical events, capability/config
schema, mars routing, and UI/observability assumptions instead of one bundle.

**Structural fix.** Keep a shared embedded agent-loop engine only for behavior
that is truly uniform, but register provider/transport adapters with explicit
capability declarations and typed extension events. If provider semantics
affect lifecycle, auth, tools, or persistence, make that provider/runtime a
bundle-level identity rather than hiding it behind `api`. Validate the seam by
designing two materially different providers before freezing it.

## Final verdict

The architecture is **not yet sound enough to build on as written**. It does
not need a wholesale restart: the authority daemon, mediated write service,
capability lattice, and adapter-local harness logic are good foundations. But
the team should first replace surface-as-identity with an authenticated request
context, split portable sync identity from local storage/projection state,
separate run outcome from event telemetry, make remote substrate lifecycle
durable, and choose one mars publication/runtime boundary. Building packages
and routes before those contracts are corrected will turn today’s document
contradictions into cross-cutting migration work.
