# meridian-cli rewrite — Architecture

A full TS rewrite of meridian-cli as a local-first coding-agent product with
CRDT collaborative editing as the differentiator.

Not a fork of meridian-flow. A rewrite that shares flow's packages as library
dependencies. meridian-flow stays the cloud writing app; this is the local
coding product.

## Product definition

**What it is:** a local-first agent coordination platform where human and agent
co-edit files live via CRDTs.

**Three surfaces, one process:**

1. **CLI** — Claude Code calls meridian-cli as today. Agents use the `write`
   command (MCP tool or bash CLI) instead of native Edit/Write.
2. **Subagent spawning** — meridian-cli spawns other meridian-cli instances.
   Each subagent gets its own thread, its own process, the `write` CLI on PATH.
3. **Webapp** — local web UI served by the same process. Hostable remotely via
   tailscale. Live co-editing, agent threads, workspace management. Same data,
   same Yjs docs as the CLI surface.

**The differentiator:** CRDT collaborative editing replaces the Edit tool. Human
watches the agent draft and edits alongside it, merge-by-construction. Nobody
else in the field does this.

**Cloud sync (optional):** Yjs peer sync pushes local data to the cloud
(meridian-flow) for remote access, backup, cross-device collaboration.

## System architecture

```
┌─────────────────────────────────────────────────────────┐
│  Shared packages (npm, from meridian-flow repo)          │
│  @meridian/agent-edit     — CRDT write engine            │
│  @meridian/contracts      — protocol, wire types         │
│  @meridian/prosemirror-schema — document schema          │
│  @meridian/markup         — codecs (MDX + code)          │
└──────────────────────┬──────────────────────────────────┘
                       │ npm dependency
                       ▼
┌─────────────────────────────────────────────────────────┐
│  meridian-cli (rewritten, TS monorepo)                   │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ CRDT engine  │  │ Unified      │  │ Webapp         │  │
│  │ (Yjs, agent- │  │ harness      │  │ (TipTap editor │  │
│  │  edit core)  │  │ + Claude Code│  │  thread UI,    │  │
│  │              │  │  native      │  │  file tree,    │  │
│  │              │  │              │  │  observability)│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
│  ┌──────┴─────────────────┴───────────────────┴────────┐ │
│  │  Core layer                                          │ │
│  │  SQLite (Drizzle) · Capability model · Spawn/coord  │ │
│  │  Session/thread · Observability (OTel) · mars-agents │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                                                 │
│         │ optional Yjs peer sync                          │
│         ▼                                                 │
│  ┌──────────────┐                                        │
│  │ Cloud sync   │ → meridian-flow (cloud)                │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

## CRDT write seam (validated — from prior design session)

See `../codebase-audit-rewrite/design/crdt-write-seam.md` for full detail.

**Three bindings, one authority:**

| Path | Binding | Transport |
|------|---------|-----------|
| Claude Code (primary) | MCP tool (`write`) | stdio MCP server → in-process |
| Subagent processes | bash CLI (`write`) | CLI → HTTP → daemon |
| Webapp embedded agents | in-process call | direct `AgentEditCore.write()` |

**Claude Code bash-only: confirmed feasible.** Bare deny rules in
`.claude/settings.json` remove Edit/Write from Claude's context. MCP tool
provides structured schema. Behavioral probe needed in Phase 0.

**Write command schema is stable.** Zero diff between `h/v3` and
`h/draft-simplify` (149 commits). The CLI/MCP surface is not moving.

## Unified harness

**The current state:** 5 fragile per-harness adapters (Claude, Codex, Cursor,
Pi, OpenCode) with stdout-scraping, filesystem-scraping, undocumented APIs.
See `../codebase-audit-rewrite/artifacts/harness-fragility-map.md`.

**The rewrite:**

- **Claude Code** stays native (subscription auth, TUI, full tool ecosystem).
  Irreducible special case. Spawned as a subprocess, communicates via existing
  `stream-json` stdout + the new MCP write tool.
- **Claude API** (not subscription) unifies with other API providers under one
  harness entity. Uses Anthropic SDK / AI SDK.
- **All other providers** (OpenAI, Gemini, etc.) — one unified harness using
  AI SDK or direct provider SDKs. Same spawn contract, same tool bindings,
  same capability model.
- **Cursor/Pi/OpenCode** — drop as native harness adapters. If users want them,
  they run through the unified harness (API mode) or stay as-is in the legacy
  CLI.

**Net:** 2 harness types instead of 5. Claude Code native + unified API.

## Capability & security model

Carry forward D8 from the audit:

```typescript
interface SpawnCapability {
  own: PermissionSet;        // what this spawn may exercise
  delegation: PermissionSet; // what it may grant to children
  max_depth: number;         // spawning depth ceiling
}
```

**Invariant:** `own ≤ parent.delegation` AND `delegation ≤ parent.delegation`.
Ceiling monotonically shrinks down the tree.

**Build into the rewrite from the start:**
- Capability attached to every spawn record in SQLite
- Enforced at the coordinator (not trusted from env vars)
- Sandbox modes: none (local dev), bwrap (Linux), seatbelt (macOS), Job Objects
  (Windows) — as execution modes, not bolted on
- Secret grants as part of the capability contract (env_grants, secret_grants)

## Database

**SQLite (via Drizzle ORM).** Local-first, single-file, fast, no daemon.

Tables (initial sketch):
- `spawns` — spawn records with capability, status, parent_id, thread_id
- `threads` — agent conversation threads, linked to Yjs docs
- `documents` — tracked files ↔ document IDs, CRDT metadata
- `journal` — Yjs update journal (the agent-edit persistence layer)
- `sessions` — agent sessions, turn history
- `events` — structured event log (observability)

Drizzle supports both Postgres (flow) and SQLite (local) — same schema
definitions, different adapters. Enables shared schema packages if needed.

## Observability

**Structured from day one.** Not bolted on.

- **OpenTelemetry spans** for agent turns, tool calls, CRDT operations, spawn
  lifecycle. Traces flow through parent→child spawn chains.
- **The webapp IS the observability surface.** Live view of agent work: what
  each agent is doing, token usage, cost, latency, errors. Not a separate
  dashboard — integrated into the workspace view.
- **Structured event log** in SQLite. Queryable. The current ad-hoc
  `history.jsonl` approach dies.
- **Metrics:** tokens/cost per turn, CRDT ops/sec, spawn latency, concurrent
  edit frequency. Exportable via OTel for external dashboards if needed.

## Performance

**Targets:**
- Write CLI round-trip (bash → HTTP → CRDT → response): < 50ms
- Webapp time-to-interactive: < 1s
- Spawn creation: < 100ms
- SQLite query for spawn list (1000 spawns): < 10ms

**Design decisions for performance:**
- SQLite with WAL mode — concurrent reads, sequential writes
- Indexed queries replace the current full-file-scan patterns
- Yjs docs loaded on demand, LRU eviction for large workspaces
- The 188MB history.jsonl problem dies — structured events in indexed SQLite
- Connection pooling for the webapp
- `write` CLI compiled to single binary (bun build --compile) for fast startup

## mars-agents integration

mars-agents (Rust) stays as-is. It manages prompt packages — skills, agents,
prompt bundles.

**What changes with unified harness:**
- Target directories simplify. Instead of syncing to `.claude/`, `.cursor/`,
  `.codex/`, `.opencode/`, `.pi/` separately, there's one canonical target
  plus Claude Code's `.claude/` for the native path.
- `mars.toml` / `mars.lock` continue to work. The package format doesn't change.
- mars-agents CLI commands (`meridian mars sync`, `meridian mars version`) stay
  the same.

**Integration contract:** mars-agents outputs files to a target directory.
meridian-cli reads them. The contract is filesystem layout, not API. This
doesn't change in the rewrite.

## What carries forward from the audit

| From audit | Status | In rewrite |
|---|---|---|
| Fragility map | Reference | Informs what NOT to repeat |
| D8 capability model | Designed, unbuilt | Built from day one |
| Windows Job-handle fix | Designed (Phase 0) | Part of sandbox modes |
| Canonical HarnessEvent envelope | Designed | Simplified — 2 harness types, not 5 |
| Unified SessionProvider | Designed | SQLite replaces file scraping |
| History.jsonl growth (#359) | Issue filed | Dies — SQLite events |
| Filtered spawn list (#360) | Issue filed | Dies — indexed queries |
| macOS orphan containment (D12) | Deferred to sandbox | Part of sandbox modes |

## Thread/spawn cache invariant (from user)

**Main thread system prompt is immutable mid-session.** Changing it breaks the
provider's prompt cache (Anthropic 5-min TTL). The main thread reads updated
context only through explicit re-read tools, not system prompt mutation.

**New threads (spawns) are hot-swappable.** Each new spawn gets a fresh system
prompt with the latest context, skills, and instructions. This is free — new
threads start fresh, so there's no cache to break.

**Implication for the rewrite:**
- Thread creation assembles the system prompt once, freezes it for the session
- Context updates (file changes, CRDT state, work status) flow through tool
  results and user-turn injections, NOT system prompt rewrites
- When context has drifted enough that the main thread is stale, the right move
  is to spawn a new thread (hot-swap), not mutate the old one
- The webapp can show "context drift" and offer to spawn a fresh thread

This is the same pattern Claude Code uses today: the system prompt is set at
session start, and `<system-reminder>` injections carry updates without
invalidating the cache prefix.

## Open questions (collect as we go)

1. **TS monorepo structure** — Nx? Turborepo? pnpm workspaces only? What's
   the package split?
2. **Webapp stack** — TanStack Start (like flow)? Vite + React? SvelteKit?
   Needs to be hostable via tailscale, fast, lightweight.
3. **Unified harness framework** — AI SDK? Direct provider SDKs? Omnigent
   reference?
4. **Code file codec** — how to map source code ↔ ProseMirror blocks. Line-per-
   block? Tree-sitter-aware? Start simple or invest upfront?
5. **Yjs peer sync protocol** — what does the cloud sync look like? Is it just
   y-websocket to a meridian-flow instance?
6. **Migration path from current CLI** — big bang or gradual? Can the rewrite
   run alongside the current CLI during transition?
7. **Where do shared packages live?** Stay in meridian-flow repo and published
   to npm? Move to a shared packages repo? Monorepo that contains both?
