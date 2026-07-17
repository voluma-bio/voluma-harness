# Prior Art: Claude Agent SDK (TypeScript)

**Studied:** `@anthropic-ai/claude-agent-sdk@0.3.202` (npm package) + GitHub repo `anthropics/claude-agent-sdk-typescript` (examples/changelog only)  
**Date:** 2026-07-06

## Executive summary

The Claude Agent SDK is **not a self-contained agent runtime**. It is a TypeScript façade over a **bundled Claude Code CLI subprocess** (platform-specific native binaries shipped as optional npm deps). The SDK's job is transport, permission bridging, MCP in-process hosting, and typed stream parsing. All agent logic — tool dispatch, compaction, subagent orchestration, settings merge — lives inside the CLI.

For our rewrite this is high-signal prior art on **stream protocol design**, **permission interception**, **session persistence seams**, and **multi-agent event shapes**. It is **not** a model for owning the harness: we want the inverse — one TS runtime we control, with Claude Code as an optional external harness.

---

## Architecture summary

### Layering

```
┌─────────────────────────────────────────────────────────────┐
│  Consumer app (your product UI / automation)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ query({ prompt, options })
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  @anthropic-ai/claude-agent-sdk (sdk.mjs, ~930KB bundled)    │
│  - Spawns / manages CLI subprocess                           │
│  - Parses NDJSON stdout → SDKMessage stream                  │
│  - Bridges canUseTool / onUserDialog control requests        │
│  - Hosts in-process MCP tools (createSdkMcpServer)           │
│  - Optional SessionStore dual-write adapter                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ stdin/stdout NDJSON + control frames
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude Code CLI (native binary, version-locked to SDK)      │
│  - Model calls, builtin tools, hooks, compaction             │
│  - JSONL session files under ~/.claude/projects/             │
│  - Subagent transcripts, task system, plugin/skill loading   │
└─────────────────────────────────────────────────────────────┘
```

**Surprise:** the GitHub repo at `~/.meridian/ref/claude-agent-sdk-typescript` contains **no SDK implementation** — only CHANGELOG, session-store reference adapters, and CI. The real API surface is the published npm tarball (`sdk.d.ts` is 6,700+ lines of types; `sdk.mjs` is minified runtime). Source study required extracting the npm package.

### Primary API

| Entry | Role |
|-------|------|
| `query({ prompt, options })` | Main API. Returns `Query` = `AsyncGenerator<SDKMessage>` + control methods. |
| `startup({ options })` | Pre-spawns CLI, returns `WarmQuery` for zero-latency first turn. |
| `resolveSettings()` | Inspect merged settings without spawning (alpha). |
| Session helpers | `listSessions`, `getSessionInfo`, `forkSession`, `deleteSession`, `importSessionToStore`, etc. |

The unstable v2 session API (`unstable_v2_*`) was **removed in 0.3.142**. Multi-turn is now: pass `AsyncIterable<SDKUserMessage>` as `prompt`, or use `Query.streamInput()`.

### Agent model

Agents are **declarative data**, not classes:

```typescript
type AgentDefinition = {
  description: string;
  prompt: string;                    // system prompt
  tools?: string[];                  // allowlist (omit = inherit all)
  disallowedTools?: string[];        // denylist; supports mcp__* patterns
  model?: string;                    // alias or full ID; default inherit
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  maxTurns?: number;
  background?: boolean;              // fire-and-forget when invoked
  permissionMode?: PermissionMode;
  effort?: EffortLevel | number;
  observer?: string;                 // read-only digest agent
  memory?: 'user' | 'project' | 'local';
  initialPrompt?: string;
};
```

Registration:

- `options.agents: Record<string, AgentDefinition>` — subagents invokable via the builtin **Agent** tool
- `options.agent: string` — apply an agent definition to the **main thread** (equivalent to `--agent`)

Invocation is always through the harness's **Agent** tool (`AgentInput` in `sdk-tools.d.ts`): `description`, `prompt`, `subagent_type`, `model`, `run_in_background`. The SDK does not expose "spawn this agent programmatically" outside the model's tool-use loop (except background task control: `stopTask`, `backgroundTasks`).

**Observer pattern:** an agent can name another agent as `observer` — a read-only background digest reporter that never participates in the task.

### Tool registration

Three distinct mechanisms:

1. **Builtin tools (CLI-owned)**  
   - `options.tools`: `string[]` or `{ type: 'preset', preset: 'claude_code' }`  
   - `allowedTools` / `disallowedTools` for permission vs availability  
   - `toolConfig` for per-builtin customization (e.g. `askUserQuestion.previewFormat`)  
   - Schemas exported as generated JSON Schema types in `@anthropic-ai/claude-agent-sdk/sdk-tools`

2. **In-process custom tools (SDK-owned)**  
   ```typescript
   createSdkMcpServer({
     name: 'my-server',
     tools: [tool('name', 'desc', zodSchema, async (args) => ({ content: [...] }))],
   })
   ```
   - Zod 3/4 input schemas, handler returns MCP `CallToolResult`  
   - Registered via `mcpServers` with `McpSdkServerConfigWithInstance`  
   - `alwaysLoad` / per-tool `alwaysLoad` bypass tool-search deferral

3. **External MCP servers (CLI subprocess-owned)**  
   - `stdio`, `SSE`, `HTTP` configs in `options.mcpServers`  
   - Tool names exposed as `mcp__{server}__{tool}`  
   - `options.toolAliases` — single-hop redirect (e.g. `{ Bash: 'mcp__sandbox__bash' }`)

**Permission gate:** `canUseTool(toolName, input, { signal, toolUseID, requestId, ... })` → `PermissionResult`. This is the host's interception point for every tool call. Returning `null` means "I already sent control_response out-of-band" — documented as fail-closed footgun.

### Streaming architecture

**Transport:** `Transport` interface abstracts subprocess stdout, WebSocket, and SSE. Messages are NDJSON frames parsed into `StdoutMessage` (SDK messages + control request/response pairs).

**Consumer-facing stream:** `for await (const msg of query(...))` yields `SDKMessage`, a large discriminated union (~30 variants), including:

| Category | Examples |
|----------|----------|
| Conversation | `assistant`, `user`, `stream_event` (partial) |
| Turn boundary | `result` (success / error subtypes) |
| System | `api_retry`, `compact_boundary`, `task_*`, `hook_*`, `mirror_error` |
| Control | permission progress, auth status, rate limits |

Key options:

- `includePartialMessages` → `SDKPartialAssistantMessage` (`type: 'stream_event'`, raw Anthropic stream events)
- `includeHookEvents` → lifecycle visibility for hooks
- `forwardSubagentText` → full subagent transcript vs tool_use/tool_result only

**Mid-stream control** (streaming input mode only): `Query` exposes `interrupt()`, `setModel()`, `setPermissionMode()`, `setMcpServers()`, `applyFlagSettings()`, `mcpServerStatus()`, etc. These send control requests to the running CLI.

**Turn result:** every turn ends with `SDKResultMessage`:
- `subtype: 'success'` — `result` string, cost/usage, `stop_reason`, optional `structured_output`
- Error subtypes: `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`

### MCP integration

| Concern | Design |
|---------|--------|
| Startup | `mcpServers` map at `query()` time; **non-blocking connect by default** since 0.3.142 (`status: 'pending'` until ready) |
| Runtime | `Query.setMcpServers()` — reconcile add/remove; SDK servers in-process, stdio/SSE/HTTP in subprocess |
| Status | `mcpServerStatus()` → `connected \| failed \| needs-auth \| pending \| disabled` |
| Recovery | `reconnectMcpServer()`, `toggleMcpServer()` |
| Elicitation | MCP servers can request user input; `onElicitation` callback or `Elicitation` hook |
| Permissions | `setMcpPermissionModeOverride(server, 'default' \| 'auto' \| null)` — tighten-only |
| Tool search | Tools deferred by default; `alwaysLoad` forces prompt inclusion (+ blocks startup up to 5s) |

In-process SDK MCP and external MCP are **split across process boundaries** deliberately: custom tools run in the host Node process; remote servers run in the CLI child.

### Session / conversation management

**Authority:** JSONL transcript files under `~/.claude/projects/<projectKey>/<sessionId>/`, plus subagent subpaths `subagents/agent-<id>.jsonl`.

**Resume:**

```typescript
query({
  prompt: 'Continue',
  options: { resume: sessionId, resumeSessionAt?: messageUuid, forkSession?: true }
})
```

- `continue: true` — resume most recent session in cwd (mutually exclusive with `resume`)
- `persistSession: false` — ephemeral, no disk write
- `sessionId` — force new session UUID

**External persistence (alpha):** `SessionStore` adapter protocol:

```typescript
interface SessionStore {
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>;
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>;
  listSessions?(projectKey): Promise<{ sessionId, mtime }[]>;
  delete?(key): Promise<void>;
  listSubkeys?(key): Promise<string[]>;  // subagent paths
}
```

- Dual-write: CLI writes local JSONL first; SDK mirrors to store after local success
- `sessionStoreFlush`: `'batched'` (default) vs `'eager'`
- Reference adapters (S3, Redis, Postgres) + 13-contract conformance suite in the GitHub examples
- `append` failures: 3 retries with backoff → `mirror_error` system message; conversation continues

Subagent isolation: `SessionKey.subpath` (e.g. `subagents/x`) stored independently; delete main cascades to subkeys.

### Multi-agent patterns

| Pattern | Mechanism |
|---------|-----------|
| Delegation | Model calls **Agent** tool → subprocess spawns subagent with `AgentDefinition` |
| Background work | `run_in_background: true` / `AgentDefinition.background` → `task_notification` on completion |
| Task tracking | Task tools (`TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`) replaced `TodoWrite` |
| Nesting visibility | `parent_tool_use_id` on messages; `getSubagentMessages(sessionId, agentId)` |
| Lifecycle hooks | `SubagentStart`, `SubagentStop` with `additionalContext` continuation |
| Process control | `stopTask(taskId)`, `backgroundTasks(toolUseId?)` |
| Provenance | `SDKMessageOrigin` — `human`, `peer`, `task-notification`, `observer`, `coordinator`, etc. |

There is **no first-class handoff API** (pass session to another agent outside the tool loop). Handoffs are modeled as tool calls + transcript continuity via `resume` / peer messaging origins.

### Error handling and retry

| Layer | Behavior |
|-------|----------|
| API retries | `SDKAPIRetryMessage` — `attempt`, `max_retries`, `retry_delay_ms`, `error_status`, typed `error` (`rate_limit`, `overloaded`, `model_not_found`, …) |
| Model fallback | `fallbackModel` — comma-separated list; primary retried each user turn |
| Turn limits | `maxTurns`, `maxBudgetUsd`, `taskBudget` (alpha) → typed result error subtypes |
| Tool permission | `canUseTool` deny → `permission_denials` on result; hooks can block/modify |
| Refusals | `stop_reason: "refusal"` + `stop_details`; optional `onUserDialog` for fallback prompt |
| Session store | 3-attempt append retry; timeouts not retried |
| Abort | `abortController` on options; `Query.close()` force-kills subprocess + MCP transports |

Hooks (30+ events) provide a second interception layer: `PreToolUse` can deny/ask; `Stop`/`SubagentStop` can inject `additionalContext` to continue the turn; `PostToolUseFailure` for error paths.

### Hook system (cross-cutting)

`options.hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>` with pattern matchers and per-matcher timeout.

Notable events for platform design: `SessionStart` (can set title, reload skills), `PreCompact`/`PostCompact`, `PermissionRequest`/`PermissionDenied`, `MessageDisplay` (stream transform), `ConfigChange`, `TeammateIdle`, `TaskCreated`/`TaskCompleted`.

Hook output is JSON (`HookJSONOutput`) with `continue`, `hookSpecificOutput`, `permissionDecision`, etc.

### Bridge export (`/bridge`)

Separate alpha surface for **remote claude.ai workers**: `BridgeSessionHandle` with SSE sequence numbers, JWT-scoped ingress, `reportState('idle' | 'running' | 'requires_action')`, permission forwarding. Relevant if we ever bridge to a hosted worker; not the local-first path.

---

## Patterns to steal

1. **Rich typed event stream** — One discriminated union (`SDKMessage`) covering conversation, system, tasks, hooks, retries. Consumers pattern-match on `type`/`subtype`. Worth emulating for observability and multi-surface UIs (CLI + webapp).

2. **SessionStore adapter + conformance suite** — Minimal protocol (`append`/`load`/`listSessions`/`listSubkeys`/`delete`) with a vendored 13-test behavioral contract. Directly applicable to our SQLite-backed session mirror and cloud sync.

3. **`canUseTool` as the permission seam** — Single async callback with `AbortSignal`, structured `PermissionResult`, and `updatedPermissions` for "always allow" persistence. Maps well to our capability model.

4. **Declarative agent registry** — `Record<string, AgentDefinition>` loaded at session start; invocation via tool, not direct SDK calls. Keeps orchestration in the model loop where it belongs.

5. **`parent_tool_use_id` + subpath transcripts** — Clean way to nest subagent output without flattening the main thread. Our spawn/coord layer should emit equivalent linkage.

6. **`toolAliases` for harness redirection** — Lets hosts remap builtin tool names (e.g. route `Bash` to sandbox MCP) without changing model-facing names. Useful for CRDT `write` replacing `Edit`/`Write`.

7. **`startup()` / warm pool** — Pre-spawn + initialize handshake to hide cold-start latency. Relevant for interactive webapp threads.

8. **Task notification protocol** — Background work reports via `task_started` / `task_progress` / `task_notification` instead of blocking the turn. Aligns with our detached spawn model.

9. **Origin metadata on messages** — `SDKMessageOrigin` distinguishes human, peer, task-notification, observer. Helps multi-agent UIs attribute messages correctly.

10. **Generated tool schemas package** — `sdk-tools.d.ts` from JSON Schema gives consumers typed I/O for every builtin. We should generate similar types from our tool definitions.

---

## Patterns to avoid

1. **Opaque subprocess as the runtime** — The SDK cannot fix harness bugs, add tools, or change compaction without a new CLI binary. Our rewrite goal is the opposite: **we own the runtime**; external harnesses are adapters.

2. **Source not in repo** — Studying/debugging requires npm tarball archaeology. If we publish SDK-like surfaces, keep types and reference implementations in-tree.

3. **Env replace-not-merge** — `options.env` **replaces** the entire subprocess environment. Easy to break `PATH`/`ANTHROPIC_API_KEY`. Default should be merge-with-override.

4. **40+ stream message types without tiers** — Powerful but heavy for simple consumers. Consider a layered API: `MinimalEvent` + opt-in `verbose` channel.

5. **Permission `null` return semantics** — "I already answered out-of-band" is powerful for HTTP bridges but a sharp footgun. Prefer explicit `OutOfBandResponse` variant.

6. **Dual-write session persistence** — Local JSONL required even with `SessionStore`; mirror is best-effort with silent drop after retries. For local-first SQLite authority, pick **one write path** with optional export.

7. **Version lock to CLI** — Every SDK release tracks `claudeCodeVersion`. Coupling our product to an external release train is fragility we already have with 5 harness adapters.

8. **Split MCP process model** — In-process vs subprocess MCP split is necessary for their architecture but adds reconciliation complexity (`mcp_set_servers`, restart bugs in changelog). A unified in-process tool host is simpler if we own the runtime.

9. **Hook explosion** — 30+ hook events mirror CLI internals. Prefer a smaller set of composable middleware for our harness.

10. **Agent invocation only via model tool** — No `spawnAgent({ type, prompt })` SDK method. Fine for their model-in-the-loop design; we need **explicit spawn API** for meridian-cli coordination.

---

## Relevance to meridian rewrite

### Where it aligns

| Our design | Claude SDK evidence |
|------------|---------------------|
| Unified harness with typed stream | `SDKMessage` union + `Transport` abstraction |
| Local-first sessions on disk | JSONL authority + optional `SessionStore` mirror |
| Subagent spawning | Agent tool + `task_*` events + subpath transcripts |
| MCP tool registration | `createSdkMcpServer` + Zod + `mcpServers` map |
| Capability / permissions | `canUseTool` + `PermissionUpdate` destinations |
| Webapp + CLI same process | Bridge export shows they also split local REPL vs remote SSE worker |
| mars-agents / skills | `skills` option, `reloadSkills()`, plugin loading |

### Where we diverge (intentionally)

| Our design | Claude SDK approach |
|------------|-------------------|
| **We own the agent loop** | CLI subprocess owns the loop |
| **Claude Code = one harness adapter** | Claude Code = the only full runtime |
| **CRDT `write` replaces Edit** | Builtin file tools + hooks |
| **SQLite session authority** | JSONL files + optional mirror adapter |
| **Explicit `meridian spawn`** | Model-initiated Agent tool only |
| **Cross-harness (API, Codex, …)** | Claude-only |
| **Yjs / collaborative editing** | Not present |

### Concrete recommendations

1. **Stream protocol:** Adopt a discriminated-union event model similar to `SDKMessage`, with `result` turn boundaries and `parent_tool_use_id` for spawn nesting. Emit `task_notification` analogs for background spawns.

2. **Session layer:** Port the `SessionStore` contract shape (especially `SessionKey` with `subpath`, conformance tests) onto our Drizzle/SQLite store. Skip dual-write — SQLite is authoritative.

3. **Tools:** Use Zod (or JSON Schema → TS) for custom tool defs like `tool()`. Export a `@meridian/sdk-tools` generated from our builtin schemas. Support `toolAliases` for harness-specific routing to CRDT write.

4. **Agents:** Keep `AgentDefinition`-style declarative config compatible with mars-agents frontmatter. Add **programmatic spawn** that the SDK lacks.

5. **Permissions:** Implement `canUseTool`-shaped callback in our harness entity, wired to the capability model. Support `updatedPermissions` persistence to session scope.

6. **Do not wrap this SDK as our runtime** — Use it only as a **reference for Claude Code adapter integration** (if we spawn Claude Code natively for subscription users) and for protocol ideas. The TS rewrite's harness core should look more like a slim LangGraph/OpenCode-style loop we control.

---

## Study artifacts

| Source | Location |
|--------|----------|
| GitHub repo (examples only) | `~/.meridian/ref/claude-agent-sdk-typescript` |
| npm package extracted | `/tmp/claude-agent-sdk-study/package/` (sdk.d.ts, sdk-tools.d.ts, bridge.d.ts) |
| SessionStore conformance | `examples/session-stores/shared/conformance.ts` |
| Changelog (behavioral archaeology) | 1,000+ lines of API evolution notes |

**Version note:** Local clone is stale (v0.3.170 tags); npm latest at study time was **0.3.202** / Claude Code **2.1.202**.
