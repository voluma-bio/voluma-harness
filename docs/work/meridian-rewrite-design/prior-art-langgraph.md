# Prior art: LangGraph

Source studied at `~/.meridian/ref/langgraph` (monorepo, Python-first; LangGraph.js exists separately).

LangGraph is a **low-level orchestration framework** for stateful, long-running agent workflows. It is explicitly inspired by Google Pregel and Apache Beam: execution proceeds in **supersteps**, nodes read/write **channels**, and a **Pregel runtime** schedules parallel tasks within each step.

For the meridian-cli rewrite (local-first coding-agent platform, process-based subagent spawning, SQLite authority, CRDT editing), LangGraph is most relevant as a reference for **durable execution**, **checkpoint design**, and **multi-agent fan-out** — not as a model to adopt wholesale.

---

## Architecture summary

### Layering

| Layer | Package | Role |
|-------|---------|------|
| Graph builder | `langgraph` (`StateGraph`, `MessageGraph`) | Declarative nodes, edges, conditional routing; compiles to `Pregel` |
| Runtime | `langgraph.pregel` | Superstep loop, task scheduling, checkpoint I/O, streaming |
| Channels | `langgraph.channels` | Typed state keys with merge semantics (reducers) |
| Checkpoint contract | `langgraph-checkpoint` | `BaseCheckpointSaver`, serde, `Checkpoint` schema |
| Persistence adapters | `checkpoint-sqlite`, `checkpoint-postgres` | Pluggable savers |
| Prebuilt patterns | `langgraph-prebuilt` | `ToolNode`, `create_react_agent` ReAct loop |
| Long-term memory | `langgraph.store` | Cross-thread KV store (separate from checkpoints) |
| Cloud API | `langgraph-sdk-py` | Threads, runs, streaming against LangSmith Deployment |

### Graph-based orchestration model

1. **Build phase**: `StateGraph(schema)` → `add_node` / `add_edge` / `add_conditional_edges` → `compile(checkpointer=..., store=...)`.
2. **Execution**: Compiled graph is a `Pregel` instance. Each **node** is a `PregelNode` wrapping a LangChain `Runnable`. Nodes return partial state updates (`dict` / TypedDict / Pydantic).
3. **Supersteps**: One iteration of the Pregel loop:
   - `prepare_next_tasks()` builds the task set (PULL tasks from edge triggers + PUSH tasks from `Send`).
   - Tasks run (possibly in parallel).
   - `apply_writes()` merges node outputs into channels via reducers.
   - Checkpoint saved (depending on durability mode).
4. **Routing**: Static edges, conditional edges (callable returns next node name or `END`), and dynamic `Send(node, arg)` for map-reduce / fan-out.

Node signature is effectively `State → Partial<State>`. State keys map to **channels** with semantics chosen at schema definition time:

- `Annotated[list, operator.add]` → `BinaryOperatorAggregate` (append/merge)
- `add_messages` → message list with ID-based upsert (not blind append)
- `LastValue`, `Topic`, `EphemeralValue`, `DeltaChannel` (beta, delta+log snapshots)

### State management

State is **not a single blob**. It is a set of named channels, each with:

- A **value type** and **update type**
- A **reducer** (for aggregating concurrent writes in one superstep)
- **Version counters** per channel, tracked in the checkpoint

The checkpoint stores:

```text
Checkpoint {
  channel_values:   snapshot of channel state at this point
  channel_versions: monotonic version per channel
  versions_seen:    per-node map of which channel versions each node has read
  updated_channels: which channels changed this step
}
```

`versions_seen` enables an optimization: only nodes triggered by updated channels are scheduled in the next superstep (`trigger_to_nodes` map).

**Managed values** (e.g. `RemainingSteps`) are framework-controlled fields, not user-writable channels.

**Context** (`context_schema`) is immutable runtime data (user_id, db handle) injected separately from mutable state.

### Checkpointing

Checkpoints are saved **per superstep** (by default). Primary identity:

- `thread_id` — conversation / tenant isolation (required for persistence)
- `checkpoint_id` — monotonic, sortable UUID6; enables time-travel / fork
- `checkpoint_ns` — namespace for nested subgraphs (hierarchical)

**Checkpoint tuple** = `(config, checkpoint, metadata, parent_config, pending_writes)`.

**Pending writes**: If a node fails mid-superstep, writes from sibling nodes that already completed are persisted so resume does not re-run successful work.

**Metadata** includes `source` (`input` | `loop` | `update` | `fork`), `step`, `parents` (namespace → checkpoint_id), `run_id`.

**Durability modes** (`sync` | `async` | `exit`):

- `sync` — persist before next superstep (safest)
- `async` — persist concurrently with next step
- `exit` — persist only when graph exits (fewer writes; `DeltaChannel` has special handling)

**Time travel**: `invoke` / `stream` with a historical `checkpoint_id`, or `update_state` + fork. Replay re-executes nodes from the chosen checkpoint; interrupts re-fire.

**Human-in-the-loop**: `interrupt(value)` inside a node raises `GraphInterrupt`, surfaces `Interrupt(id, value)` to client. Resume via `Command(resume=...)`. Node **re-executes from the top** on resume (not mid-execution continuation).

### Multi-agent coordination

Three distinct mechanisms:

1. **`Send(node, arg)`** — Dynamic fan-out. Conditional edge returns `list[Send]`; each becomes a PUSH task with its own input (can differ from parent state). Tasks in the same superstep run in parallel. Classic map-reduce pattern.

2. **Subgraphs** — A compiled graph embedded as a node. Checkpointer inheritance:
   - `checkpointer=False` — no persistence even if parent has one
   - `checkpointer=None` (default) — "stateless": inherits parent checkpointer for interrupt/resume only; state resets between invocations (common for agent-in-tool pattern)
   - `checkpointer=True` — stateful subgraph; accumulates on same `thread_id`

3. **`Command`** — Cross-graph control:
   - `update` — patch state (optionally `as_node` for attribution)
   - `resume` — answer interrupts
   - `goto` — jump to node(s) or `Send(...)` targets
   - `graph=Command.PARENT` — bubble control to parent graph

Prebuilt ReAct agent (`create_react_agent`, v2) fans out tool calls via `Send("tools", ToolCallWithContext(...))` — one PUSH task per tool call, enabling parallel tool execution with per-call state context.

There is no first-class "agent handoff" primitive. Multi-agent tutorials compose separate agent nodes, supervisor routing, or subgraph invocation.

### Persistence adapters

**`BaseCheckpointSaver`** interface (sync + async variants):

| Method | Purpose |
|--------|---------|
| `put` | Store checkpoint + metadata + channel versions |
| `put_writes` | Store pending per-task writes |
| `get_tuple` | Load checkpoint tuple |
| `list` | History / time-travel |
| `delete_thread` | GC a thread |
| `copy_thread` | Clone thread history |
| `prune` | Retention (DeltaChannel-aware warnings) |
| `get_delta_channel_history` | Reconstruct delta channels from ancestor chain |

**Serde**: `JsonPlusSerializer` (JSON + msgpack for complex types). Security note: strict msgpack allowlist recommended for untrusted data.

**Shipped adapters**:

- `InMemorySaver` — dev/test only
- `SqliteSaver` / `AsyncSqliteSaver` — lightweight, single-process; documented as not multi-thread scalable
- `PostgresSaver` / `AsyncPostgresSaver` — production default
- `ShallowPostgresSaver` — reduced history retention

**Conformance**: `langgraph-checkpoint-conformance` provides `checkpointer_test` fixture for third-party savers.

**Store** (separate from checkpoints): `BaseStore` for long-term memory across threads — namespaces, KV, optional vector search. Postgres and SQLite store adapters exist alongside checkpoint adapters.

**Cache**: `BaseCache` with in-memory and Redis implementations (node output caching, not checkpointing).

### Tool dispatch in the graph model

Tools are **not** graph-native primitives. They are regular nodes (`ToolNode`) in the workflow.

**`ToolNode`**:

- Parses `AIMessage.tool_calls` from state (or direct tool-call list input)
- Dispatches each call — sync: `executor.map`, async: `asyncio.gather`
- Returns `ToolMessage`(s) merged into state via `add_messages` reducer
- Tools can return `Command` for state updates + navigation (control flow escape hatch)
- `InjectedState`, `InjectedStore`, `ToolRuntime` inject graph context into tool signatures
- Interceptors/wrappers for caching, auth, etc.
- Stream integration: `StreamToolCallHandler` + ContextVar `_tool_call_writer` for per-tool output deltas

**ReAct loop** (prebuilt): `agent` → conditional → `tools` → back to `agent`. `tools_condition` routes on pending tool calls. v2 uses `Send` per tool call instead of a single `tools` node invocation.

**Routing**: Conditional edges inspect message state; `return_direct` tools can short-circuit to `END`.

---

## Patterns to steal

1. **Checkpoint adapter seam** — Thin interface (`put`, `get_tuple`, `put_writes`, `list`) with a conformance test suite. Maps cleanly to meridian's "extend through seams" rule and planned Drizzle/SQLite layer.

2. **`thread_id` + `checkpoint_id` + namespace hierarchy** — Proven model for conversation threads, spawn subtrees, and time-travel debugging. `checkpoint_ns` parallels parent/child spawn chains.

3. **Pending writes on partial superstep failure** — Avoid re-running completed sibling work on resume. Relevant when coordinating parallel subagent tool calls or multi-file operations.

4. **`Send`-style dynamic fan-out** — Declarative parallel dispatch with per-task input payloads. Meridian already does `meridian spawn --bg`; the *concept* of PUSH tasks with isolated inputs informs spawn payload design.

5. **`Command` as a unified control primitive** — Resume, state patch, and routing in one type. Useful shape for coordinator → harness messages (resume after approval, inject context, redirect).

6. **Durability modes** — Let callers trade safety vs I/O cost (`sync` for HITL, `exit` for batch). Meridian could offer similar on turn checkpoints.

7. **Channel versioning for incremental scheduling** — If meridian tracks "what changed since last turn," avoid re-querying idle agents. Analogous to `updated_channels` + `trigger_to_nodes`.

8. **Structured streaming modes** — `values`, `updates`, `tasks`, `checkpoints`, `messages`, `custom` as a typed event taxonomy. Informs the rewrite's OTel + webapp observability surface.

9. **Subgraph checkpointer inheritance tri-state** — Explicit `False` / `None` / `True` for "no persistence / interrupt-only / full state" avoids ambiguous nested-agent behavior.

10. **Separation of checkpoint (short-term execution state) vs store (long-term memory)** — Aligns with meridian splitting SQLite session/thread tables from KB/work artifacts.

---

## Patterns to avoid

1. **In-process graph as the unit of agent execution** — LangGraph nodes are function calls in one process. Meridian's model is **process-per-spawn** with files as authority. Adopting a Pregel runtime would fight the architecture.

2. **LangChain `Runnable` coupling** — Graph, nodes, tools, and messages are deeply tied to LangChain types. The rewrite targets a unified TS harness; porting this coupling would recreate adapter fragility.

3. **Re-execute-on-resume semantics** — `interrupt()` re-runs the entire node on resume. Fine for idempotent LLM nodes; dangerous for tools with side effects (file writes, spawns) unless carefully gated. Meridian's CRDT + explicit write seam needs finer-grained resume.

4. **Per-superstep checkpointing as default** — Every graph step persists full channel state. For a local coding agent with frequent small turns, this is heavy unless durability modes and delta encoding are used. LangGraph's `DeltaChannel` adds significant pruning/copy complexity.

5. **State-as-channel-reducers for everything** — Powerful but opaque. Message reducers, `Overwrite`, managed values, and delta reconstruction create a high learning curve. Meridian's explicit SQLite schema + file artifacts are simpler for agents to inspect.

6. **Python serialization surface** — `JsonPlusSerializer` + pickle/msgpack paths are a security and portability concern. TS rewrite should use explicit JSON/protobuf schemas, not pickle-equivalent.

7. **Graph-level tool dispatch** — Tools are workflow nodes, not OS/sandbox capabilities. Meridian needs capability-enforced spawn + `write` CLI/MCP, not `ToolNode` wrapping.

8. **Cloud-first deployment assumptions** — LangSmith Deployment, `langgraph-sdk` threads/runs API, managed checkpointers. Meridian is local-first; only steal the data model, not the deployment topology.

9. **Implicit parallelism without isolation** — `Send` parallel tasks share the same process and state reducers. Meridian parallel spawns need worktree/`task-dir` isolation — stronger than LangGraph's shared-state map-reduce.

---

## Relevance to the meridian-cli rewrite

### Where LangGraph aligns

| Meridian concept | LangGraph analog |
|------------------|------------------|
| `threads` table | `thread_id` + checkpoint history |
| Spawn parent/child | `checkpoint_ns`, subgraph nesting |
| Session resume / HITL | `interrupt` + `Command(resume=...)` |
| Structured event log | Stream modes + checkpoint metadata |
| SQLite (Drizzle) | `SqliteSaver` adapter pattern |
| Parallel subagent spawns | `Send` / PUSH tasks (conceptual) |
| OTel observability | `tasks` / `debug` stream parts |

### Where meridian diverges (by design)

| Meridian | LangGraph |
|----------|-----------|
| Files + SQLite as authority | Channel state in checkpointer |
| Process isolation per spawn | In-process nodes |
| CRDT collaborative editing | No CRDT; message list reducers |
| Capability model on spawns | No permission model |
| Harness-agnostic adapters (2 types) | LangChain Runnable everywhere |
| `write` command seam | `ToolNode` + native file tools |
| mars-agents prompt packages | Inline graph definitions |

### Recommended borrow (narrow)

1. **Checkpoint schema sketch** for `threads` / `sessions`: monotonic `checkpoint_id`, parent pointer, `pending_writes`, step metadata, namespace for spawn tree. Implement via Drizzle, not a generic channel serializer.

2. **Coordinator control message** shaped like `Command` — `{ resume?, update?, goto? }` on the spawn/coordinator seam.

3. **Conformance tests** for any persistence adapter (SQLite now, optional Postgres later).

4. **Streaming event taxonomy** for the webapp — turn boundaries, tool lifecycle, checkpoint created, spawn task start/finish.

5. **Durability knob** on turn persistence — full sync during HITL approval flows; lighter journaling during autonomous stretches.

### Not recommended

- Embedding LangGraph (Python) or LangGraph.js as the orchestration core
- Modeling agents as graph nodes rather than spawned processes
- Adopting channel/reducer state in place of explicit tables + Yjs docs
- Per-step full-state checkpointing without delta/journal strategy

### Bottom line

LangGraph is the strongest open-source reference for **durable, interruptible, parallel agent orchestration** with a clean persistence seam. The meridian rewrite should steal its **checkpoint contract**, **thread/namespace identity model**, **pending-write recovery**, and **streaming observability taxonomy** — while keeping **process-based coordination**, **file authority**, and **CRDT editing** as the architectural center. LangGraph solves "how do I run a state machine with amnesia-proof restarts"; meridian solves "how do humans and agents co-edit code locally with isolated subprocess agents." The overlap is persistence and observability patterns, not the execution model.
