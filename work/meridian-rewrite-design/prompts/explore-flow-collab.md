# Explore: meridian-flow collab domain — server-side CRDT implementation

We are designing a TS rewrite of meridian-cli that needs to run the CRDT
authority locally. Your job: explore how the flow server implements the
agent-edit ports and the collab domain, so we know exactly what adapters
the rewrite needs to build.

**Task dir:** `/home/jimyao/gitrepos/meridian-flow`

Focus on:
- `apps/server/server/domains/collab/` — the collab domain
- `apps/server/server/lib/wired-core-tools.ts` — how write tool is wired
- `apps/server/server/domains/runtime/` — the agent runtime
- `apps/server/server/domains/threads/` — thread model

Also check the `h/draft-simplify` worktree at:
`/home/jimyao/gitrepos/meridian-flow.worktrees/draft-simplify`
for any changes to these domains.

**Do NOT change any code.** Read-only exploration. Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-flow-collab.md`

## What to capture

### 1. Port implementations (adapters)
For each agent-edit port, find the concrete adapter:
- `DocumentCoordinator` → Hocuspocus adapter (how it works, what it depends on)
- `DocumentLifecycle` → how documents are created/managed
- `UpdateJournal` → Drizzle journal (what tables, what queries)
- `ActorSessionStore` → how sessions are tracked
- `ReversalStore` → how undo history is persisted

For each adapter, note:
- What infrastructure it depends on (Postgres, Hocuspocus, etc.)
- What the local/SQLite equivalent would need to look like
- Complexity estimate — is it a trivial port or a deep rewrite?

### 2. Hocuspocus integration
- How Hocuspocus is configured and started
- How it manages Y.Docs (loading, storing, syncing)
- The WebSocket handler (`ws-thread-handler.ts`)
- How persistence works (what stores doc state, how often)
- Could we use Hocuspocus locally? Or do we need a simpler Y.Doc manager?

### 3. Thread and turn model
- Thread lifecycle (create, turns, completion)
- How turns relate to agent tool calls
- The response commit/rollback lifecycle
- How thread context is resolved (the context port chain)
- What the rewrite's thread model needs to look like

### 4. Tool registration and wiring
- `createCoreToolRegistrations` — what tools are registered
- How tool calls flow from the agent runtime to the write tool
- The `ToolHandlerContext` — what context is available to tool handlers
- Response lifecycle — how staged writes buffer until commit

### 5. Context port architecture
- The `ContextPort` interface — what operations it supports
- How tracked documents relate to files
- How document projections work (CRDT → file sync)
- What a local filesystem ContextPort adapter needs

### 6. Observability in collab
- What events are emitted
- The EventSink pattern
- What the rewrite should replicate

## Output format

For each adapter/component:
- **What it does**
- **Infrastructure dependencies** (Postgres, Hocuspocus, Redis, etc.)
- **Complexity of local port** — trivial / moderate / significant
- **Key invariants** the rewrite must preserve
- **draft-simplify changes** — anything different on the active branch
