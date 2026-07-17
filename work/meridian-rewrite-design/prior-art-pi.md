# Prior Art: Pi Agent Runtime Architecture

Source: `~/.meridian/ref/pi` (pi-mono, v0.78.x). Studied 2026-07-06 for meridian-cli TS rewrite.

## Architecture Summary

Pi is a **layered TypeScript monorepo** for a local-first coding agent. Four published packages with lockstep versioning:

| Package | Role |
|---------|------|
| `@earendil-works/pi-ai` | Unified multi-provider LLM API — wire-protocol adapters, model catalog, streaming |
| `@earendil-works/pi-agent-core` | Harness-agnostic agent loop — tool dispatch, queues, state, optional `AgentHarness` |
| `@earendil-works/pi-coding-agent` | Product layer — CLI, sessions, extensions, tools, SDK |
| `@earendil-works/pi-tui` | Terminal UI — differential rendering, components |

Dependency flow is strict and one-directional:

```
pi-tui  pi-ai
          ↑
       pi-agent-core
          ↑
    pi-coding-agent (also depends on pi-tui)
```

**Product surfaces share one core.** `AgentSession` + `AgentSessionRuntime` sit between the agent loop and I/O modes (`interactive`, `print`, `json`, `rpc`). Each mode is a thin adapter; session persistence, extensions, compaction, and model resolution are mode-agnostic.

### Provider model (two-level seam)

Pi separates **wire protocol** from **vendor identity**:

- **`api`** — how to talk on the wire (`anthropic-messages`, `openai-completions`, `openai-responses`, `google-generative-ai`, …). Registered in `pi-ai` via `registerApiProvider()`.
- **`provider`** — who bills you / what OAuth flow applies (`anthropic`, `openrouter`, `ollama-custom`, …). Models carry both fields.
- **`Model`** — immutable metadata: `id`, `provider`, `api`, `baseUrl`, `compat`, `thinkingLevelMap`, costs, context window.

Built-in models live in generated `models.generated.ts` (from `scripts/generate-models.ts`). User overrides land in `~/.pi/agent/models.json`. Extensions can register at runtime via `pi.registerProvider()`.

`streamSimple()` is the default agent entry point. It resolves `model.api` → `getApiProvider()` → provider's `streamSimple`, with env-var API key fallback.

### Agent loop

The loop in `packages/agent/src/agent-loop.ts` is **pure and event-driven**:

1. **Outer loop** — drains follow-up message queue after the agent would otherwise stop.
2. **Inner loop** — per turn: inject steering messages → stream assistant → execute tools → `prepareNextTurn` / `shouldStopAfterTurn` → repeat if more tool calls or steering.
3. **Message model** — `AgentMessage[]` is the runtime transcript. Conversion to provider `Message[]` happens only at the LLM boundary (`convertToLlm`).
4. **Tool dispatch** — parallel by default; sequential if `toolExecution === "sequential"` or any tool declares `executionMode: "sequential"`. Hooks: `beforeToolCall` (can block/modify), `afterToolCall`.
5. **Streaming** — partial assistant message pushed into context immediately; `message_update` events carry deltas.

`Agent` (stateful wrapper) adds steering/follow-up queues (`steer()`, `followUp()`), listener subscription, abort, and `waitForIdle()`.

### Extension system

Extensions are **TypeScript modules** loaded via `jiti` from `~/.pi/agent/extensions/`, `.pi/extensions/`, CLI `-e`, or `settings.json` package refs.

- **Registration phase** (during load): `pi.on(event)`, `pi.registerTool()`, `pi.registerCommand()`, `pi.registerProvider()` (queued until runtime binds).
- **Runtime phase** (after bind): `ctx.sendMessage()`, `ctx.setModel()`, `ctx.appendEntry()`, UI prompts, session fork/switch.
- **ExtensionRunner** fans out ~25 event types across all loaded extensions; results merge (e.g. `tool_call` can `{ block: true }`, `before_agent_start` can inject messages/system prompt).

Extensions can persist state in session via `custom` entries (not in LLM context) or `custom_message` entries (in LLM context).

### Session / conversation model

Sessions are **append-only JSONL files** with a **tree** of entries (`id`, `parentId`):

| Entry type | Purpose |
|------------|---------|
| `message` | Agent/user/assistant/toolResult messages |
| `compaction` | Summary + `firstKeptEntryId` — truncates history for LLM |
| `branch_summary` | Summary when navigating session tree branches |
| `model_change` / `thinking_level_change` | Settings along the path |
| `custom` / `custom_message` | Extension state / injected context |
| `label` / `session_info` | Bookmarks, display name |

`buildSessionContext()` walks from `leafId` to root, applies compaction (summary + kept tail), resolves current model/thinking level. `SessionManager` handles persistence; `Agent.state.messages` is rebuilt from session context on load.

Tree navigation enables **fork**, **branch**, and **time-travel** without copying full transcripts.

### Multi-provider under one interface

All providers converge on:

```typescript
streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream
```

`Context` = `{ systemPrompt, messages, tools }`. Provider-specific quirks are handled inside each adapter via `model.compat` (OpenAI completions vs responses vs Anthropic messages). Custom providers supply `streamSimple` directly through `registerProvider({ api, streamSimple, models })`.

Auth is layered: env vars → `models.json` apiKey/command → `auth.json` OAuth tokens. `ModelRegistry.getApiKeyForModel()` resolves per request (important for expiring tokens).

---

## Patterns to Steal

### 1. Layered packages with a thin product shell

Split **LLM adapters**, **agent loop**, **product/CLI**, and **UI** into separate packages. Meridian's rewrite already sketches `@meridian/contracts` + core + surfaces; Pi validates that the agent loop should not know about TUI, SQLite, or spawn coordination.

**Concrete seam:** `@meridian/harness` (or reuse AI SDK wrapper) ← `@meridian/agent-core` ← `meridian-cli` product.

### 2. `api` vs `provider` vs `Model` triple

Don't conflate vendor name with wire format. One Anthropic-compatible proxy and one native Anthropic endpoint can share `api: "anthropic-messages"` with different `provider` strings and `baseUrl` overrides. Maps cleanly to meridian's "unified API harness + Claude Code native" split.

### 3. Runtime message type ≠ LLM message type

Keep a rich internal transcript (`AgentMessage` with custom roles, display metadata, bash execution records) and convert at the provider boundary. Essential once CRDT write events, human co-edits, and compaction summaries enter the transcript.

### 4. Event-sourced agent loop

The loop emits a small vocabulary of events (`turn_start`, `message_update`, `tool_execution_*`, `turn_end`, `agent_end`). Product layers subscribe rather than monkey-patching the loop. Meridian's OTel/event log can subscribe to the same stream.

### 5. Steering vs follow-up queues

Two queue semantics:
- **Steering** — inject before the next assistant response (user interrupts mid-run).
- **Follow-up** — run only after the agent would stop (batch automation).

Directly applicable to webapp "send while agent is thinking" and subagent result handoff.

### 6. `models.json` + dynamic `registerProvider()`

Declarative user config (TypeBox-validated JSON) for custom endpoints **plus** runtime registration for extensions. Meridian could use YAML profiles + programmatic registration for mars-agents sync.

Key behaviors to copy:
- Full replacement when `models[]` provided; override-only when just `baseUrl`/`headers`.
- `unregisterProvider()` restores built-ins.
- `thinkingLevelMap` per model (hide unsupported levels).

### 7. Session tree with compaction entries

Tree-structured history with explicit compaction nodes beats flat "truncate and pray." `firstKeptEntryId` preserves recent context while summarizing the rest. Branch summaries enable fork/resume without duplicating files.

Meridian's SQLite `sessions` + `threads` tables should store the same conceptual model even if the storage format differs.

### 8. `AgentSession` as shared mode core

One class owns agent lifecycle, extension runner, session persistence, compaction, model changes. Modes (`cli`, `webapp`, `rpc`) are I/O adapters. Matches meridian's "three surfaces, one process."

### 9. Extension hooks at the right choke points

Highest-value interception points Pi exposes:
- `before_agent_start` — inject context, override system prompt
- `tool_call` / `tool_result` — block, rewrite, audit
- `before_provider_request` — headers, payload inspection
- `session_before_compact` / `session_before_fork` — custom compaction/branching

Start with this set; defer the full 25-event surface.

### 10. RPC mode for headless integration

`--mode rpc` exposes JSON-RPC over stdin/stdout for programmatic control. Useful reference for meridian webapp ↔ daemon IPC and subagent coordination without scraping TUI output.

### 11. Lazy provider loading

Pi-ai lazy-imports heavy provider modules (Bedrock, Anthropic SDK) on first use. Keeps CLI startup fast — relevant for a multi-surface binary.

### 12. `AgentHarness` as optional higher-level API

`pi-agent-core` ships a second entry (`AgentHarness`) with built-in session repo, compaction, skills, prompt templates. Lower-level `Agent` + `agentLoop` remain available. Meridian can expose a thin harness for spawn workers while keeping the coordinator on a smaller API.

---

## Patterns to Avoid

### 1. JSONL as sole session authority

Pi's JSONL works for single-user local agent sessions but lacks concurrent write semantics, queryability, and cross-thread indexing. Meridian's SQLite + Drizzle choice is correct; borrow Pi's **entry types and tree semantics**, not the file format.

### 2. No capability / permission model

Pi explicitly documents that extensions run with full user permissions. Meridian's `SpawnCapability` with monotonic delegation is a necessary improvement — don't ship "extensions run as you" without sandbox tiers.

### 3. jiti dynamic extension loading in production

Loading arbitrary TS from disk via `jiti` is flexible but complicates supply-chain review, binary distribution, and WASM/edge targets. Prefer compiled extension packages (Pi is moving this direction with `pi install` npm/git packages) or meridian's mars-agents prompt packages for trusted extension distribution.

### 4. Extension surface area before core is stable

Pi's extension docs are 2500+ lines with 25+ event types. Easy to accrete hooks that ossify internals. Meridian should define a **minimal stable extension protocol** (tool registration, session hooks, provider registration) and add events only when a consumer exists.

### 5. Lockstep versioning of all packages

Pi bumps `ai`, `agent`, `tui`, `coding-agent` together on every release. Simplifies compatibility but couples unrelated changes. Meridian's `@meridian/*` packages should version independently where boundaries are real (e.g. `agent-edit` from flow repo).

### 6. Flat env-var API key discovery

Pi falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. Works for solo dev; insufficient for meridian's capability-scoped `secret_grants`. Keep provider resolution shape, replace auth resolution with capability-bound secret injection.

### 7. Scraping-adjacent spawn model

Pi is not a spawn coordinator — it's a single-agent runtime. Don't adopt its process model for subagents; use meridian's existing spawn/wait/track patterns. Pi's RPC client is a reference for **in-process** control only.

### 8. `compat` blob growth

Provider quirks accumulate in per-model `compat` objects (20+ flags for OpenAI-completions alone). Works but becomes hard to reason about. Meridian should centralize provider normalization in the harness layer with typed adapters rather than per-model JSON flags — or generate compat from provider metadata.

---

## Relevance to Meridian Rewrite

### Direct mapping

| Pi concept | Meridian rewrite target |
|------------|-------------------------|
| `pi-ai` api registry | Unified harness entity (AI SDK / direct SDKs) with `api` discriminator |
| `ModelRegistry` + `models.json` | Profile YAML + provider registration; mars-agents model metadata |
| `Agent` + `agentLoop` | `@meridian/agent-core` turn loop; OTel events from same hooks |
| `AgentSession` | Thread/session service backed by SQLite, not JSONL |
| `SessionManager` tree + compaction | `threads` + `sessions` tables; compaction as structured rows |
| Extension `tool_call` hook | Capability enforcement at coordinator before tool execution |
| `rpc` mode | Webapp ↔ daemon IPC; internal API for spawn workers |
| `pi-tui` | Optional; webapp is primary UI — don't port TUI unless needed for CLI |

### Where meridian diverges (by design)

1. **CRDT write seam** — Pi uses native `edit`/`write` tools. Meridian replaces these with `@meridian/agent-edit` across MCP, CLI, and in-process bindings. Pi has no equivalent.
2. **Spawn coordination** — Pi is single-session. Meridian adds `spawns` table, capability delegation, `meridian spawn wait`.
3. **Storage** — SQLite + Yjs journal vs JSONL session files.
4. **Harness count** — Pi is its own harness. Meridian keeps Claude Code native + unified API; Pi becomes prior art for the unified API layer, not a harness to adapter-wrap.
5. **Collaborative editing** — Pi sessions are single-user. Meridian threads tie to Yjs documents.

### Recommended adoption order

1. **Phase 0** — Port the `api`/`provider`/`Model` type split and `streamSimple` dispatch pattern into the unified harness design.
2. **Phase 1** — Implement agent loop with `AgentMessage` ≠ LLM message, event vocabulary, steering/follow-up queues.
3. **Phase 2** — Session tree semantics in SQLite (entry types, compaction, branch summaries).
4. **Phase 3** — Minimal extension protocol: `registerTool`, `registerProvider`, `before_tool_call`, `session_start`.
5. **Defer** — Full Pi extension event surface, jiti loading, TUI package, JSONL persistence.

### Key source files (for implementers)

| Area | Path in pi-mono |
|------|-----------------|
| API provider registry | `packages/ai/src/api-registry.ts`, `stream.ts` |
| Built-in provider registration | `packages/ai/src/providers/register-builtins.ts` |
| Agent loop | `packages/agent/src/agent-loop.ts` |
| Stateful agent | `packages/agent/src/agent.ts` |
| Model registry + registerProvider | `packages/coding-agent/src/core/model-registry.ts` |
| Session tree + buildSessionContext | `packages/coding-agent/src/core/session-manager.ts` |
| Product session bridge | `packages/coding-agent/src/core/agent-session.ts` |
| Extension loader/runner | `packages/coding-agent/src/core/extensions/loader.ts`, `runner.ts` |
| Extension types/events | `packages/coding-agent/src/core/extensions/types.ts` |
| SDK entry | `packages/coding-agent/src/core/sdk.ts` |
| RPC mode | `packages/coding-agent/src/modes/rpc/` |
| Higher-level harness | `packages/agent/src/harness/agent-harness.ts` |

---

## Surprises (not obvious from docs)

1. **`registerProvider` has three modes** — full model replacement, baseUrl/header override only, or custom `streamSimple` without models. The override-only path is easy to miss and is how proxy extensions work without redefining model catalogs.

2. **Provider registrations queue during extension load** — `pendingProviderRegistrations` flushes at `bindCore()`. Async extension factories are awaited before flush, so remote model list fetch → registerProvider is safe at startup.

3. **`AgentLoopContinue` exists for retries** — context already has user/toolResult at end; no new prompt added. Separate from follow-up queue.

4. **Session persistence lags streaming** — `AgentSession` notes intentional sync between in-memory streaming state and `SessionManager.appendMessage` on `message_end`. Any meridian webapp showing live tokens must handle the same dual-write pattern.

5. **`resetApiProviders()` on session operations** — dynamic provider registrations are reset and reapplied from registry state to avoid stale overrides when switching sessions. State management for dynamic providers is non-trivial.

6. **Dual package naming** — `@earendil-works/*` and legacy `@mariozechner/*` aliases everywhere. Migration debt to avoid in meridian naming.
