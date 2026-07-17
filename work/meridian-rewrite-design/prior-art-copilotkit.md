# Prior Art: CopilotKit Architecture

**Source:** `~/.meridian/ref/CopilotKit` (cloned May 2026, main branch)  
**Studied:** 2026-07-06  
**Purpose:** Inform meridian-cli rewrite webapp ↔ agent runtime integration

---

## Architecture Summary

CopilotKit is a pnpm/Nx monorepo that embeds AI agents into web UIs. The current
implementation (v2) is built around the **AG-UI protocol** — a typed,
SSE-streamed event vocabulary shared between agent backends and browser clients.
v1 packages (`@copilotkit/react-core`, `@copilotkit/runtime`) are thin public
APIs that delegate to v2 internally; new work lands in v2 (`@copilotkit/core`,
`@copilotkit/react` subpath `/v2`, `@copilotkit/runtime`).

### Layer diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  React (or Angular/Vue)                                                  │
│  CopilotKitProvider → hooks (useAgent, useFrontendTool, useAgentContext) │
│  Thin framework bindings over CopilotKitCore                               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ register tools/context; subscribe to agent
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CopilotKitCore (framework-agnostic, packages/core)                      │
│  AgentRegistry · ContextStore · RunHandler · StateManager · Suggestions  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTP + SSE (AG-UI events)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ProxiedCopilotRuntimeAgent (extends HttpAgent from @ag-ui/client)       │
│  POST /agent/:id/run  ·  POST /agent/:id/connect  ·  GET /info           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CopilotRuntime (packages/runtime)                                       │
│  CopilotSseRuntime (default) or CopilotIntelligenceRuntime (cloud)       │
│  AgentRunner: InMemory | SQLite | Intelligence WebSocket                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Agent implementation (BuiltInAgent / LangGraph / CrewAI / custom)       │
│  Implements AbstractAgent; emits AG-UI events as Observable<BaseEvent>   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Runtime ↔ web UI connection

1. **Bootstrap:** `CopilotKitProvider` creates `CopilotKitCore`, fetches `GET
   /info` from the runtime URL, and registers `ProxiedCopilotRuntimeAgent`
   instances per named agent.
2. **Connect:** On mount, chat components call `connectAgent`, which POSTs to
   `/agent/:agentId/connect` with `tools` (frontend tool schemas), `context`
   (app state snippets), and `forwardedProps` (provider `properties`).
3. **Run:** User message triggers `runAgent` → POST `/agent/:agentId/run` →
   runtime delegates to `AgentRunner` → agent emits events → SSE stream back
   to client.
4. **Reconnect:** `connect` replays thread history from the runner store. Core
   distinguishes fresh thread restore (clear local state, full replay) from
   same-thread churn reconnect (preserve local messages, resume from
   `lastSeenEventId`).

**Deployment modes:**

| Mode | Thread storage | Transport |
|------|----------------|-----------|
| SSE (default) | `InMemoryAgentRunner` (global `Map`, survives hot reload via `Symbol.for`) | HTTP SSE |
| SQLite | `SqliteAgentRunner` | HTTP SSE, durable local threads |
| Intelligence | `IntelligenceAgentRunner` | WebSocket to CopilotKit cloud platform |

Endpoint factories exist for Hono and Express, multi-route and single-route
(single POST with `method` field in body).

### Frontend tool registration

Tools are **declared in the browser, executed in the browser**, but their
**schemas are sent to the agent** on every run so the LLM can invoke them.

```tsx
useFrontendTool({
  name: "addItem",
  description: "...",
  parameters: z.object({ id: z.string() }),
  handler: async ({ id }, { signal }) => { /* mutate React state */ },
  render: ({ status, result }) => <Card>...</Card>,  // optional UI in chat
  followUp: false,  // IMPORTANT: default is true → agent re-runs after tool
}, [deps]);
```

**Registration lifecycle** (`use-frontend-tool.tsx`):

- `useEffect` on mount: `copilotkit.addTool(tool)` + optional `addHookRenderToolCall`
- Duplicate names warn and override (scope with `agentId` for multi-agent)
- Re-registers when `tool.name`, `tool.available`, or `deps` change
- Cleanup removes tool; render hooks intentionally persist for chat history

**Execution flow** (`run-handler.ts`):

1. Agent stream ends with `TOOL_CALL_*` events in an assistant message
2. `processAgentResult` matches tool name against registered `FrontendTool`s
3. Handler runs locally with `AbortSignal` from `stopAgent()`
4. Tool result appended to agent messages
5. If `followUp !== false`, yields to framework scheduler
   (`waitForPendingFrameworkUpdates` in React — flushes `useLayoutEffect` context
   updates), then recursively calls `runAgent`

Wildcard tool (`name: "*"`) catches undefined tool calls.

Server-side tools are defined on the agent (`BuiltInAgent` + `defineTool`, or
LangGraph/CrewAI integration). MCP servers can be attached for dynamic tool
discovery. Frontend and backend tools coexist; frontend execution never hits the
server.

### Streaming patterns

**Wire format:** AG-UI events over SSE. Key event families:

| Family | Events | Purpose |
|--------|--------|---------|
| Lifecycle | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STEP_*` | Run boundaries, progress |
| Text | `TEXT_MESSAGE_START/CONTENT/END` | Token/chunk streaming to chat |
| Tools | `TOOL_CALL_START/ARGS/END` | Progressive arg build + invocation signal |
| State | `STATE_SNAPSHOT`, `STATE_DELTA` | App-visible agent state sync |
| Messages | `MESSAGES_SNAPSHOT` | Bulk message hydration |

**Client-side rendering:**

- `useAgent({ throttleMs })` subscribes to `OnMessagesChanged` and
  `OnStateChanged`; default throttle coalesces high-frequency streaming updates
- Microtask-batched `forceUpdate` prevents scroll jitter from rapid re-renders
- `ProxiedCopilotRuntimeAgent` uses RxJS observables internally; server
  `InMemoryAgentRunner` uses `ReplaySubject` for live + historic event replay

**Predictive/intermediate state** (LangGraph integration): `emitIntermediateState`
forwards partial tool-call arguments into shared state keys as tokens arrive —
e.g. `document` field grows token-by-token in `useAgent().state` before the tool
call completes. This is JSON field streaming, not document CRDT.

### Collaborative editing / CRDT

**CopilotKit does not use CRDTs, Yjs, or operational transforms.**

Shared state between agent and UI is:

- A **mutable JSON object** owned by the agent runtime
- Synced via `STATE_SNAPSHOT` (full replace) and `STATE_DELTA` (RFC 6902 JSON
  Patch via `fast-json-patch`)
- Consumed in React via `useAgent().state`

"Collaborative" in CopilotKit demos means the human and agent both read/write
the same **agent state object** (todo lists, documents as strings in state) —
not simultaneous editing of a shared text CRDT. The LangGraph shared-state-write
demo explicitly puts document content in agent state under a `document` key and
streams it per-token; the UI renders `agent.state.document` live.

**Human-in-the-loop:** `useHumanInTheLoop` is `useFrontendTool` without a
handler — `render` receives `respond()` that resolves a Promise. Agent blocks
until user approves/denies. No persistence layer for pending approvals beyond
the in-flight run.

### React integration model

| Hook / component | Role |
|------------------|------|
| `CopilotKitProvider` | Root context; owns `CopilotKitCore`; requires `"use client"` |
| `useCopilotKit` | Access core instance, `setHeaders`, `runTool` |
| `useAgent` | Agent ref + message/state/run-status subscriptions |
| `useFrontendTool` | Register browser-executed tools |
| `useHumanInTheLoop` | Approval gates with `respond()` |
| `useAgentContext` | Push JSON context into every agent run |
| `useRenderToolCall` | Custom renderers for tool calls in chat history |
| `CopilotChat` / `CopilotPopup` | Pre-built chat UI (v1 react-ui package) |

**Framework seam:** `CopilotKitCoreReact` extends core with
`waitForPendingFrameworkUpdates()` — a `MessageChannel` yield so React
`useLayoutEffect` context writes are visible before follow-up agent runs.

**Connection lifecycle:** While runtime `/info` is fetching, `useAgent` returns
a cached provisional `ProxiedCopilotRuntimeAgent` (stable reference to avoid
effect churn). Missing `onError` leaves UI stuck in "connecting..." on CORS/URL
failures.

**Import path:** v2 hooks require `@copilotkit/react-core/v2`; root imports are
v1 and incompatible.

### Context from the app

Three mechanisms feed app state to agents:

1. **`useAgentContext({ description, value })`** — registers in `ContextStore`;
   values JSON-serialized; sent as `context: Context[]` on every
   `runAgent`/`connectAgent`. Uses `useLayoutEffect` for timing with follow-up
   runs.
2. **`properties` on provider** — forwarded as `forwardedProps` to runtime/agent
   (tenant ID, feature flags, locale).
3. **`forwardedProps` per run** — ad-hoc overrides in `runAgent` calls.

Context is **read-only from the agent's perspective** — descriptive snippets the
LLM sees in the prompt. Mutations flow through tools (frontend or backend), not
by editing context directly.

Agent-emitted **state** (`useAgent().state`) is separate from context: mutable,
structured, UI-bindable, synced via STATE events.

---

## Patterns to Steal

### 1. Framework-agnostic core + thin bindings

`CopilotKitCore` owns registries, run lifecycle, and subscriptions. React/Angular/Vue
only wire lifecycle hooks and scheduler yields. **Directly applicable:** our
webapp and CLI surfaces should share a core orchestrator; React is one consumer.

### 2. Frontend tool split (schema to agent, execution in UI)

Sending tool JSON schemas to the agent while executing handlers locally is the
right model when agents need to manipulate UI state (file tree selection, editor
focus, approval dialogs). Map to our webapp: CRDT write tools stay server-side;
UI affordances (navigate, expand tree, show diff) can be frontend tools.

### 3. AG-UI-style typed event stream

Lifecycle + incremental text + tool-call + state events over SSE is a clean
separation. Our `@meridian/contracts` wire types could adopt similar event
families without adopting CopilotKit. Particularly useful:

- `TEXT_MESSAGE_CONTENT` delta streaming for chat
- `TOOL_CALL_ARGS` progressive arg streaming (preview before execution)
- `RUN_STARTED`/`RUN_FINISHED` for observability and UI run indicators

### 4. Follow-up run loop with framework yield

After tool execution, optionally re-invoke the agent with tool results in
history. The explicit `waitForPendingFrameworkUpdates()` before follow-up
solves a real React timing bug (stale `useAgentContext`). Worth copying the
pattern even if our yield mechanism differs.

### 5. Human-in-the-loop as a tool variant

Promise-based `respond()` with chat-embedded render UI is simple and composable.
Our `ask_user` tool could expose a similar render contract in the webapp thread UI.

### 6. Throttled agent subscriptions

`throttleMs` on message/state updates with leading+trailing coalescing is a
practical fix for streaming re-render storms. Needed for any live agent output
beside a TipTap editor.

### 7. Provisional agent references during connect

Stable placeholder agent objects prevent effect cascades and duplicate HTTP
connects while runtime info loads. Small but high-leverage for React thread UI.

### 8. AgentRunner abstraction for thread persistence

`InMemory` vs `SQLite` vs remote backends behind one `run/connect/stop/isRunning`
interface maps to our SQLite-first local product with optional cloud sync.

### 9. Middleware hooks on runtime

`beforeRequestMiddleware` / `afterRequestMiddleware` for auth, logging, rate
limits — clean extension point for local daemon HTTP surface.

### 10. `connect` vs `run` separation

Long-lived thread subscription (`connect`) distinct from discrete user turns
(`run`) enables replay, stop, and reconnect semantics. Aligns with our thread/turn
model from meridian-flow.

---

## Patterns to Avoid

### 1. JSON Patch shared state as a CRDT substitute

`STATE_SNAPSHOT`/`STATE_DELTA` sync a JSON blob well for dashboards and todo
lists, but they **cannot** replace Yjs for concurrent human+agent text editing.
No merge semantics, no per-character OT, no authoritative document model. We
should not route editor content through agent state — our CRDT engine is the
correct layer (already validated in architecture.md).

### 2. Default `followUp: true` on frontend tools

Omitting `followUp` causes the agent to re-run after every tool invocation,
including side-effect-only tools (analytics, UI toggles). Easy to create infinite
loops. Our tool registry should default `followUp` to false or require explicit
opt-in.

### 3. In-memory thread state as default

`InMemoryAgentRunner` loses all threads on process restart. Fine for dev;
wrong default for a local-first product. Our SQLite authority should be the
only persistence path.

### 4. v1/v2 dual-package indirection

Maintaining public v1 wrappers over v2 implementation adds migration surface and
confusing import paths (`/v2` subpath). We have no backwards-compat constraint —
ship one API surface.

### 5. Cloud Intelligence platform coupling

`CopilotIntelligenceRuntime` routes threads through CopilotKit's hosted service.
Irrelevant to our local-first, self-hosted model. Avoid similar optional-cloud
paths that become de-facto requirements.

### 6. Tool name global namespace with silent override

Duplicate `useFrontendTool` names warn and replace — fragile in large apps.
Prefer agent-scoped or capability-scoped tool namespaces from the start.

### 7. Stale closure pitfalls in tool handlers

Tools only re-register on explicit `deps`; handlers capturing React state without
deps go stale. Document this aggressively or use a ref-based registration
pattern.

### 8. GraphQL transport (v1 legacy)

v1 `runtime-client-gql` uses GraphQL + urql. v2 replaced this with REST+SSE.
Don't resurrect GraphQL for agent streaming — SSE/event streams are simpler for
unidirectional agent output.

### 9. "Collaborative editing" terminology trap

CopilotKit's shared-state demos are not co-editing in the CRDT sense. Don't let
this prior art dilute our differentiator — concurrent Yjs editing is something
CopilotKit explicitly does not solve.

### 10. Chat-centric UI as the only surface

CopilotKit optimizes for chat + tool render cards. Our webapp is editor-first
(file tree, TipTap, thread sidebar). Tool `render` callbacks in chat are
supplementary, not the primary interaction surface.

---

## Relevance to Meridian Rewrite

### Where CopilotKit aligns

| Our need | CopilotKit pattern |
|----------|-------------------|
| Webapp talks to local daemon | `CopilotKitProvider` → HTTP runtime in same process |
| Agent threads with streaming output | AG-UI events, `useAgent` subscriptions |
| UI tools (navigate, approve, select file) | `useFrontendTool` registration model |
| App context in agent prompts | `useAgentContext` / `properties` |
| Human approval gates | `useHumanInTheLoop` |
| Local thread persistence | `SqliteAgentRunner` (concept, not dependency) |
| Multi-agent | Named agents map, `agentId` on tools |

### Where we diverge (intentionally)

| Our design | CopilotKit gap |
|------------|----------------|
| Yjs CRDT co-editing (`@meridian/agent-edit`) | JSON state only; no document CRDT |
| Single TS process (CLI + webapp + daemon) | Assumes separate frontend/backend deploy |
| `write` tool → CRDT engine | Generic frontend/backend tools |
| `@meridian/contracts` wire protocol | AG-UI protocol (different spec) |
| Files-as-authority + SQLite (Drizzle) | In-memory default; optional SQLite package |
| Claude Code subprocess + MCP | BuiltInAgent / LangGraph integrations |
| No backwards compatibility | v1/v2 migration burden |

### Recommended borrowings for webapp surface

1. **Event-stream contract** — adopt AG-UI-like event families in
   `@meridian/contracts` for thread streaming (text deltas, tool lifecycle, run
   boundaries). Don't depend on `@ag-ui/client`.
2. **Core/React split** — `MeridianCore` (or reuse existing coordination layer)
   with React hooks as thin registrars for tools, context, and thread
   subscriptions.
3. **Frontend tool registration API** — `useAgentTool` hook pattern: zod schema,
   handler with abort signal, optional render, explicit `followUp`.
4. **Editor state stays in Yjs** — agent progress in chat stream; document
   mutations only through `write` / CRDT. Optionally stream write preview via
   tool-arg streaming (CopilotKit's `emitIntermediateState` pattern) into a
   sidebar diff, not into shared JSON state.
5. **Connect + run HTTP routes** on the local daemon — mirror CopilotKit's
   multi-route shape for thread replay, stop, and info.

### What not to adopt

- CopilotKit as a dependency (wrong abstraction for CRDT-first product; heavy
  integration surface; cloud telemetry/licensing)
- AG-UI protocol verbatim (we have our own contracts; agent-edit semantics differ)
- CopilotKit chat components as primary UI (editor-first product)
- JSON Patch state sync for document content

### Open questions for architecture phase

1. Do we expose frontend tools over the same WebSocket/SSE as thread events, or
   a separate channel?
2. How do MCP `write` results stream to the webapp — tool result events or Yjs
   observer updates? (Likely Yjs observer is authoritative; events are hints.)
3. Can `ask_user` share the HITL render pattern without blocking the agent
   process (Claude Code runs out-of-process)?
4. Thread locking: CopilotKit emits `AGENT_THREAD_LOCKED` when a thread is
   busy — we need equivalent semantics for concurrent CLI + webapp control.

---

## Key Source Files

| Path | What it shows |
|------|---------------|
| `packages/core/src/core/core.ts` | CopilotKitCore orchestrator |
| `packages/core/src/core/run-handler.ts` | Tool execution, follow-up loop |
| `packages/core/src/core/context-store.ts` | App context registration |
| `packages/core/src/core/state-manager.ts` | STATE_SNAPSHOT/DELTA tracking |
| `packages/core/src/agent.ts` | ProxiedCopilotRuntimeAgent HTTP bridge |
| `packages/react-core/src/v2/hooks/use-frontend-tool.tsx` | Tool registration |
| `packages/react-core/src/v2/hooks/use-agent-context.tsx` | Context hook |
| `packages/react-core/src/v2/hooks/use-agent.tsx` | Agent subscription + throttle |
| `packages/runtime/src/v2/runtime/runner/in-memory.ts` | SSE event store |
| `packages/runtime/src/v2/runtime/core/runtime.ts` | CopilotRuntime options |
| `skills/copilotkit-agui/references/protocol-spec.md` | AG-UI event reference |
| `showcase/integrations/langgraph-typescript/src/agent/shared-state-streaming.ts` | Per-token state streaming demo |

---

## Surprises (docs vs source)

1. **No CRDT anywhere** — marketing language about "collaborative" means shared
   agent JSON state, not co-editing. Confirmed by grep: zero Yjs/CRDT deps.
2. **`followUp` defaults to true** — undocumented footgun; side-effect tools must
   explicitly opt out.
3. **Tool render hooks outlive tool registration** — intentional so chat history
   can render past tool UIs after component unmount.
4. **Connect vs fresh-restore heuristics** — substantial complexity in
   `connectAgent` to avoid duplicate event replay on React effect churn.
5. **v1 GraphQL still in repo** — v2 SSE is the real path; v1 is compatibility
   shim only.
