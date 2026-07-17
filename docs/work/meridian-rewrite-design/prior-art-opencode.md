# Prior Art: OpenCode Architecture

Source: `~/.meridian/ref/opencode` (anomalyco/opencode, Bun monorepo, Effect-TS).
Context: meridian-cli TS rewrite as a local-first coding-agent platform with HTTP+SSE,
SQLite, and unified harness. OpenCode is the closest local-first peer with a mature
`opencode serve` surface.

Cross-reference: `../codebase-audit-rewrite/artifacts/harness-fragility-map.md` (Meridian's
integration pain points as an external consumer).

---

## Architecture Summary

### Monorepo layout

| Package | Role |
|---------|------|
| `packages/opencode` | Main app: CLI, server, session runner, tools, project/instance lifecycle |
| `packages/core` | Shared primitives: Global paths, Database, EventV2, Location, filesystem watcher, Drizzle schema |
| `packages/server` | Typed HttpApi route definitions + OpenAPI annotations (consumed by opencode handlers) |
| `packages/sdk/js` | Generated TypeScript client from OpenAPI; header/query rewriting for directory routing |
| `packages/tui` | Terminal UI (separate client of the same event/API model) |
| `packages/llm` | Provider protocol adapters (AI SDK integration) |

Runtime stack: **Bun**, **Effect-TS** (Layer/Context DI, HttpApi, Streams), **Drizzle ORM**
on **SQLite WAL**.

### `opencode serve` — HTTP+SSE server

Entry: `packages/opencode/src/cli/cmd/serve.ts` → `Server.listen()` in `server/server.ts`.

Key design choices:

1. **No ambient project at startup.** `instance: false` on the serve command. Each HTTP
   request loads (or reuses cached) a project **instance** keyed by workspace directory.

2. **Per-request instance routing** via:
   - `x-opencode-directory` header (SDK rewrites to `?directory=` on GET/HEAD)
   - `?directory=` / `?workspace=` query params
   - `InstanceStore.load()` bootstraps project context (git root, worktree, VCS metadata)

3. **Effect HttpApi** composes route groups: session, event, permission, file, MCP, PTY,
   sync, control-plane, etc. OpenAPI is generated from the same schemas the server enforces.

4. **SSE event stream** at `GET /event` (`handlers/event.ts`):
   - Registers listener **before** streaming body (no event loss during connect)
   - Emits `server.connected`, then filtered `EventV2` payloads as `{ id, type, properties }`
   - Filters by instance `directory` and optional `workspaceID`
   - 10s `server.heartbeat` keepalive
   - Terminates on `server.instance.disposed`
   - Content-Type: `text/event-stream`

5. **Port binding**: when `port=0`, tries **4096 first**, then OS-assigned ephemeral port
   (`startWithPortFallback`). Explicit collision handling for managed backends.

6. **Auth**: optional HTTP Basic via `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME`.
   Warns if password unset.

7. **Embedded web UI** served from the same process (can be disabled). mDNS publish optional
   for LAN discovery (skipped on loopback).

### Session and storage

**Dual persistence model (migration in progress):**

| Layer | Location | Status |
|-------|----------|--------|
| **SQLite (primary)** | `$XDG_DATA_HOME/opencode/opencode.db` (or channel-specific DB name) | Sessions, messages, parts, projects — Drizzle schema in `core/src/session/sql.ts` |
| **JSON file storage (legacy)** | `$XDG_DATA_HOME/opencode/storage/` | Key-value JSON files with per-file reentrant locks; migration steps in `storage/storage.ts`; still used for some paths (e.g. `session_diff` in revert) |

Database setup (`core/src/database/database.ts`):

- WAL mode, `busy_timeout=5000`, foreign keys ON
- Override via `OPENCODE_DB` (`:memory:`, absolute path, or relative under data dir)
- Channel installs can use `opencode-{channel}.db` instead of `opencode.db`

Session service (`session/session.ts`) reads/writes **SQLite exclusively** for CRUD.
Events (`session.created`, `session.updated`, `session.status`, `session.error`) flow
through `EventV2Bridge` → SSE.

**Session status model** (`session/status.ts`):

- Canonical: `session.status` with `{ type: idle | busy | retry, ... }`
- **Deprecated compat**: `session.idle` still emitted when status transitions to idle
- Meridian's fragility map correctly notes coupling to `session.idle` — upstream is
  migrating to `session.status`

**Child sessions**: `task` tool creates subagent sessions with `parentID` set. Background
tasks run as separate session IDs on the same event stream — validates Meridian's
`PrimaryEventScope` requirement (parent completion must not fire on child `session.idle`).

**Sync / event sourcing** (`sync/README.md`): `SyncEvent` layer records ordered events
for multi-device replay (single-writer, monotonic seq). Integrates with existing `Bus`
for backwards compatibility. Relevant if we ever need cross-surface session replay.

### Data paths (no `OPENCODE_HOME`)

OpenCode resolves paths via **xdg-basedir** (`core/src/global.ts`):

```
~/.local/share/opencode/     → data (db, storage, log, repos, worktrees)
~/.config/opencode/          → config (override: OPENCODE_CONFIG_DIR)
~/.local/state/opencode/     → state
```

**`OPENCODE_HOME` does not exist in OpenCode source.** Meridian's
`opencode_storage.py` uses `OPENCODE_HOME` as a Meridian-side convention; OpenCode
itself only honors XDG + `OPENCODE_DB` / `OPENCODE_CONFIG_DIR`. This is a real
integration mismatch on Windows (`LOCALAPPDATA` vs `~/.local/share`).

### Tool registration and dispatch

`tool/registry.ts` — Effect Layer bootstrapped per instance:

1. **Builtins**: shell, read, write, edit, grep, glob, task, webfetch, websearch, skill,
   apply_patch, question, lsp (experimental), plan (experimental)
2. **Filesystem tools**: glob `{tool,tools}/*.{js,ts}` under config directories
3. **Plugin tools**: from loaded plugins with Zod/JSON Schema bridging at registry boundary
4. **Model-aware filtering**: e.g. GPT models get `apply_patch` instead of edit/write

Execution path: `session/processor.ts` drives the LLM stream, dispatches tool calls,
handles permissions, compaction, doom-loop detection. Tool results bounded via
`ToolOutput` / managed output files (see `CONTEXT.md`).

Permission gate (`permission/index.ts`):

- Wildcard rulesets: `permission` + `pattern` → allow | deny | ask
- `OPENCODE_PERMISSION` env var: JSON deep-merged into config at load time
  (`config/config.ts`) — **real, tested**, but not part of the public SDK contract

### Workspace awareness

**File watching** (`core/src/filesystem/watcher.ts`):

- `@parcel/watcher` with platform backends (inotify / fs-events / windows)
- Emits `file.watcher.updated` events
- Disable via `OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER`
- Tools (write, edit, apply_patch) notify watcher after mutations

**Git / VCS** (`project/vcs.ts`, `worktree/index.ts`):

- Git subprocess wrapper for status, diff, worktree lifecycle
- VCS module combines file-watcher events with `git diff` for session diff summaries
- First-class **git worktree** support: create, list, remove, bootstrap scripts
- Projects keyed by git root commit hash (migration from legacy per-directory project IDs)

**LSP**: optional language-server integration per file type (`tool/lsp.ts`).

### Client integration pattern

Official SDK (`packages/sdk/js`):

```typescript
createOpencodeClient({ baseUrl, directory, fetch })
// → sets x-opencode-directory, subscribes to /event, calls typed session/message APIs
```

CLI `opencode run` uses the same transport internally (`cli/cmd/run/stream.transport.ts`):
background watch loop on global event stream, buffers until session ID known, applies
events to TUI state.

---

## Patterns to Steal

### 1. Typed HttpApi + generated SDK as the integration contract

OpenCode's `packages/server` defines routes with Effect schemas; SDK is regenerated from
OpenAPI. **The streaming path is first-class** — not an afterthought scraped from logs.
For our rewrite: own the contract end-to-end; consumers (CLI, webapp, subagents) share
one SDK, not parallel scrape paths.

### 2. Per-request instance routing without startup coupling

`opencode serve` stays directory-agnostic until a request arrives. One process serves
multiple workspaces. Maps cleanly to our "one process, three surfaces" model: webapp and
CLI both hit the same daemon with a `directory` (or project) selector.

### 3. SSE event envelope with location filtering

Events carry `directory` + optional `workspaceID`. Listeners register before stream
starts. Heartbeats + `server.instance.disposed` give clean lifecycle. We should adopt
the same connect → filter → heartbeat → dispose pattern for observability.

### 4. Effect Layer composition for deep modules

Each concern (Session, ToolRegistry, Permission, Watcher, Database) is a `Layer` with
explicit dependencies. Instance-scoped state via `InstanceState.make()`. Good template
for keeping harness logic testable without god-modules — but see "avoid" for cost.

### 5. SQLite WAL + Drizzle as single source of truth

Sessions/messages/parts in one DB with migrations, not scattered JSON. Matches our
architecture.md plan. OpenCode's migration from JSON → SQLite shows the pain of dual
stores — finish the migration, don't maintain both.

### 6. Explicit session status vs terminal inference

`session.status` (`idle` | `busy` | `retry`) is richer than a single terminal event.
Meridian should define a canonical `HarnessEvent` with status transitions, not per-harness
event-type string matching.

### 7. Tool registry as a deep boundary

Builtins + plugins + filesystem discovery behind one `tools(model, agent)` call.
Permission evaluation, truncation, and span instrumentation happen inside the registry.
Our unified harness should own tool dispatch similarly — one port, many providers.

### 8. Child session model with parentID

Task/subagent sessions are first-class rows with `parent_id`. Event scoping can filter
by parent. Directly applicable to meridian spawn/subagent coordination.

### 9. `OPENCODE_PERMISSION`-style env override for headless automation

JSON permission rules merged at config load — simple escape hatch for CI/spawn paths
without UI approval. We need an equivalent for headless subagent spawns.

### 10. Port fallback strategy

Try known port (4096) then ephemeral — predictable for dev, resilient for managed backends.

---

## Patterns to Avoid

### 1. Dual storage (JSON files + SQLite)

OpenCode still carries `storage/storage.ts` alongside Drizzle. Meridian's fragility map
exists partly because we read **both** layers. Lesson: pick one authority early; migration
code is temporary, not a second read path.

### 2. Scraping private on-disk state instead of API

Meridian reads `storage/session/*.json`, `opencode.db` directly, and log lines. OpenCode
provides session list, messages, status, and event APIs — scraping is a self-inflicted
fragility. **Never do this in the rewrite.**

### 3. Coupling to deprecated event types

`session.idle` is marked deprecated in favor of `session.status`. Event-type string
matching (`semantics.py` tables) rots on every upstream rename. Use versioned SDK types
or a stable Meridian envelope, not raw `type` strings.

### 4. Invented env vars (`OPENCODE_HOME`)

Meridian assumes `OPENCODE_HOME`; OpenCode uses XDG. Path mismatches caused real Windows
bugs (P0 audit). Our rewrite must own path resolution in one module with explicit
precedence — don't guess upstream conventions.

### 5. Effect-TS everywhere as a hard requirement

OpenCode's Effect stack is powerful but heavy: steep learning curve, large dependency
surface, debugging indirection. For meridian-cli rewrite, **selective** adoption (HTTP
layer, DB access) may beat full Effect port unless the team commits to Effect idioms.

### 6. Bun-specific assumptions

OpenCode leans on Bun APIs (`Bun.file`, etc.). Our rewrite targets broader Node
distribution — borrow patterns, not runtime lock-in.

### 7. Undocumented permission/env contracts as integration API

`OPENCODE_PERMISSION` works but isn't in OpenAPI. Meridian depends on it for auto-allow.
Treat env overrides as **our** documented spawn contract, not as stable upstream API.

### 8. Log-regex session detection

OpenCode logs structured fields (`service=session id=...`) but session creation is also
available via `session.created` SSE event and DB row. Log scraping is a fallback that
masks API gaps — delete, don't replicate.

### 9. Multi-path session ID detection chains

Meridian chains: SSE → artifacts → storage glob → SQLite → log regex → legacy detectors.
OpenCode itself has one ID (DB primary key). One concept, one source.

### 10. Control-plane complexity before needed

Workspaces, remote proxy routing, session move, sync event sourcing — sophisticated but
premature for our MVP. Steal the instance-routing idea; defer multi-writer sync until
CRDT/cloud sync demands it.

---

## Fragility Map Validation

| Fragility map claim | Source confirms? | Notes |
|---------------------|------------------|-------|
| HTTP+SSE to dynamic localhost port | **Yes** | `Server.listen`, port 0 → 4096 → ephemeral |
| Port-bind races (`PortBindError`) | **Yes** | `startWithPortFallback`; collision possible on 4096 |
| SSE event type scraping | **Yes, but mitigable** | Typed SDK exists; Meridian doesn't use it for completion |
| `session.idle` terminal detection | **Yes, drifting** | Deprecated; `session.status` is canonical |
| Child session multiplexing on parent connection | **Yes** | `task` tool creates `parentID` child sessions |
| `storage/` JSON layout scraping | **Partially obsolete** | Legacy; primary data is SQLite. Scraping still "works" on old layouts |
| Direct SQLite `session` table reads | **Yes** | Private Drizzle schema; no stability guarantee |
| Log-regex `OPENCODE_SESSION_CREATED_RE` | **Fragile but unnecessary** | Structured logging exists; `session.created` event is authoritative |
| `OPENCODE_PERMISSION` env injection | **Yes, legitimate** | `Flag.OPENCODE_PERMISSION` → `config.ts` merge |
| `OPENCODE_HOME` path resolution | **Meridian-only** | OpenCode uses XDG; mismatch is on Meridian side |
| Windows path via XDG vs LOCALAPPDATA | **Yes** | `xdg-basedir` handles platform; Meridian's centralized resolver had regressions |
| Multiple fallback detectors for session ID | **Meridian problem** | OpenCode has single DB ID; fallbacks are integration debt |

**Verdict:** The fragility map is accurate for Meridian-as-consumer. Roughly half the
surface (HTTP+SSE, port races, child sessions, SQLite schema, permission env) is inherent
to integrating without the SDK. The other half (JSON storage scrape, log regex,
`OPENCODE_HOME`, multi-fallback chains) is **self-inflicted** and confirmed unnecessary
given OpenCode's API and event model.

---

## Relevance to Meridian Rewrite

### What OpenCode validates about our direction

- **Local-first daemon + HTTP+SSE** is a proven architecture for multi-surface agents
  (CLI, TUI, web, SDK clients).
- **SQLite (Drizzle) as session authority** aligns with our architecture.md core layer.
- **Per-directory instance routing** fits workspace-scoped spawns and webapp file trees.
- **Typed event stream** can replace `semantics.py` per-harness tables if we own the
  server (we will) or consume a stable SDK (we won't for OpenCode — dropping native adapter).

### What we should do differently

| OpenCode approach | Our rewrite |
|-------------------|-------------|
| Integrate upstream via scrape + SSE types | **Own the server** — no external harness scrape |
| Dual JSON + SQLite storage | **SQLite only** from day one; files for artifacts/export |
| Effect-TS throughout | Pragmatic TS — Effect or Hono/Fastify where it earns its keep |
| Claude/Codex/OpenCode as peers | **Claude Code native** + unified API harness; drop OpenCode adapter |
| Permission via env JSON hack | First-class capability model in spawn config |
| Session read via filesystem | **HTTP/SDK only** for all surfaces including `meridian session` |

### Concrete imports for architecture.md

1. **Event stream contract**: `{ id, type, properties }` + location filter + heartbeat +
   dispose — adopt for webapp thread UI and spawn observability.
2. **Session status enum** instead of terminal event matching.
3. **Instance store** pattern: lazy boot per workspace directory, cached Layer stack.
4. **Tool registry** as single dispatch with permission + truncation at boundary.
5. **SDK-first integration rule**: if we ever wrap an external agent again, generated
   client is the floor — no direct DB/log reads.

### OpenCode as adapter vs substrate

architecture.md already decides: **drop OpenCode as native harness adapter**. This study
supports that call. OpenCode's value is **architectural prior art**, not a dependency.
The fragility map's OpenCode entries are a case study in what happens when a coordinator
reads private state instead of owning the contract.

### CRDT differentiator

OpenCode has no collaborative editing. Its file watcher + git diff model is
single-writer. Our Yjs/`@meridian/agent-edit` layer is orthogonal — borrow OpenCode's
daemon/session patterns, not its file mutation model.

---

## Source References (high-signal files)

| Topic | Path |
|-------|------|
| Serve command | `packages/opencode/src/cli/cmd/serve.ts` |
| HTTP server | `packages/opencode/src/server/server.ts` |
| SSE handler | `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts` |
| Instance routing | `packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts` |
| Workspace routing | `packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts` |
| Session (SQLite) | `packages/opencode/src/session/session.ts` |
| Session status events | `packages/opencode/src/session/status.ts` |
| Legacy JSON storage | `packages/opencode/src/storage/storage.ts` |
| Database | `packages/core/src/database/database.ts` |
| Drizzle schema | `packages/core/src/session/sql.ts` |
| Tool registry | `packages/opencode/src/tool/registry.ts` |
| Session processor | `packages/opencode/src/session/processor.ts` |
| Permission + env | `packages/opencode/src/permission/index.ts`, `packages/opencode/src/config/config.ts` |
| File watcher | `packages/core/src/filesystem/watcher.ts` |
| Git / worktree | `packages/opencode/src/project/vcs.ts`, `packages/opencode/src/worktree/index.ts` |
| SDK client | `packages/sdk/js/src/v2/client.ts` |
| Global paths | `packages/core/src/global.ts` |
| Sync/event sourcing | `packages/opencode/src/sync/README.md` |
| Domain model doc | `CONTEXT.md` |

---

*Generated by source study, 2026-07-06. Repo snapshot at `~/.meridian/ref/opencode` (Jun 2025 clone; verify against current `dev` branch for API drift).*
