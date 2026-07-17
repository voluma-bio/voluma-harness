Build a static HTML page at `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/integration.html`.

Read these for patterns:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.css`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.js`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/index.html`

Standard HTML5, shared.css, shared.js, CDN mermaid. Topbar nav (integration.html active). Theme toggle.

## Content: "Integration & Roadmap"

### Section 1: Mars Integration
mars-agents stays Rust, stays the prompt package manager. v1 does not reimplement package resolution, lock ownership, target lowering, model aliases, or launch-bundle construction.

Contract (bullet list):
- `meridian mars <args>` passthrough with `--root` injection and `MERIDIAN_MANAGED=1`
- Bundled/sibling `mars` binary resolution before PATH
- `mars build launch-bundle --json` schema v3 as launch policy authority
- Agent catalog from `.mars/agents/`, not harness-native target dirs
- Mars exit codes 0-3 propagated

What simplifies: v1 only needs Claude Code native target materialization + canonical `.mars/`. Five harness targets stay until mars changes.

### Section 2: Cloud Sync (optional)
Local SQLite/Yjs remains authoritative when offline. Cloud sync is a peer, not a controller.

Sync scope table:
| Syncable | Local-only |
|---|---|
| Yjs document updates/checkpoints, document metadata, thread/turn events, optional event summaries | Secrets, raw env snapshots, absolute paths, sandbox/process details, private prompt paths |

Protocol: meridian-flow's Yjs WebSocket (`/ws/yjs` prefix). Room names map to document IDs. The local daemon acts as a Yjs peer, not a remote database client.

### Section 3: Prior Art Synthesis
Grid of 6 cards (use the `.prior-art-grid` and `.prior-art-card` classes from shared.css):

1. **Pi** — Two-level provider seam (wire protocol vs vendor). Pure event-driven agent loop. I/O mode adapters over shared session.
2. **OpenCode** — Per-request instance routing via header/query. SSE with register-before-stream. Effect-TS + Drizzle on SQLite WAL.
3. **Claude Agent SDK** — NDJSON stream protocol. Permission interception hooks (canUseTool). Session store dual-write. Agent as declarative data.
4. **CopilotKit** — Runtime bridge between web UI and agent. Streaming via server-sent events. Frontend-registered actions as tools.
5. **LangGraph** — Graph-based orchestration with checkpoints. State-machine for control flow. Persistence adapters for multiple backends.
6. **Omnigent** — Meta-harness via executor.harness. Runner/server split. Stateful policy (cost caps, access controls). Child sessions as first-class objects.

Common patterns adopted (bullet list):
- **Authority daemon + thin clients** (Pi, OpenCode, Omnigent) → daemon + CLI/MCP/web model
- **Harness abstraction layer** (Pi, Omnigent, AI SDK) → two-class harness
- **SQLite WAL as local state** (OpenCode) → data model
- **Structured event stream** (OpenCode SSE, Claude SDK NDJSON) → event sink
- **Agent as declarative data** (Claude SDK, Pi) → mars agent catalog
- **Capability/policy enforcement at authority** (Omnigent) → capability model

Unique to v1: "None of the studied systems have CRDT collaborative editing between human and agent."

### Section 4: Invariant Registry
Three collapsible details sections with tags:

**Carry (agent-facing contracts)** — tag-carry class:
- Spawn statuses: queued, running, finalizing, succeeded, failed, cancelled, timed_out
- Spawn transition graph and terminal monotonicity
- Completion report evidence wins over late cancel
- p<N> spawn IDs and c<N> chat IDs — monotonic
- Parent/depth: parent_id, MERIDIAN_PARENT_SPAWN_ID, zero-based depth, fail-closed
- MERIDIAN_CHAT_ID inherited across spawn tree
- Work attachment precedence: explicit > ambient session > --from inheritance
- Config merge: CLI flags > env > YAML/profile > config defaults
- CLI command paths: spawn, session, work, context, mars, doctor
- Spawn refs: @latest, @last-failed, @last-completed, p123
- Fork policy: --fork identity-locked, --fork-fresh allows changes
- Mars passthrough, launch-bundle v3, filesystem contract

**Redesign (internals changing)** — tag-redesign class:
- Runtime persistence: JSON files → SQLite tables
- Harness layer: five adapters → Claude Code native + unified API
- Terminal event extraction: explicit API events replace per-harness classifiers
- Session transcripts: structured events/turns replace raw history.jsonl
- Control socket: per-spawn sockets → daemon RPC
- Observability: structlog → event sink + OTel
- File authority: SQLite/Yjs/daemon replace files-as-authority
- Agent-edit adapters: Postgres/Hocuspocus → local SQLite/in-process
- Capability model: D8 audit → enforced runtime

**Break (intentionally dropped)** — tag-break class:
- Files-as-runtime-state (spawns/<id>/state.json)
- history.jsonl as transcript authority
- Native Cursor/Pi/OpenCode/Codex adapters
- Global spawns.jsonl and legacy telemetry JSONL
- Prompt body sidecar files → system prompt snapshots in SQLite
- Per-harness target sprawl in default templates

### Section 5: Build Order
Ordered list with emphasis:
1. **Prove the write seam** — `write` CLI/MCP → daemon → AgentEditCore → stdout
2. **SQLite journal + Y.Doc coordinator** — UpdateJournal/ReversalStore on SQLite
3. **File tracking + source codec** — Line-oriented with exact round-trip
4. **Core spawn/session/thread/work schema** — SQLite tables, CLI daemon client
5. **Claude Code native launch** — Deny rules, MCP write tool, stream parsing
6. **Webapp** — Live editor + dashboard over same daemon
7. **Unified API harness** — In-process tools, embeddable agents
8. **Cloud Yjs peer sync** — Optional, connect as Yjs peer to flow cloud

### Section 6: Open Questions
Numbered list matching the index page.

Make it polished, well-organized.
