# Explore: meridian-flow shared packages — API surface for the rewrite

We are designing a TS rewrite of meridian-cli that will consume meridian-flow's
packages as npm dependencies. Your job: explore the shared packages and extract
their public API surfaces, port interfaces, and contracts.

**Task dir:** `/home/jimyao/gitrepos/meridian-flow`

**Do NOT change any code.** Read-only exploration. Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-flow-packages.md`

## Packages to explore

### 1. @meridian/agent-edit (`packages/agent-edit`)
The CRDT write engine. This is the differentiator.
- Public API surface (everything exported from `src/index.ts`)
- `AgentEditCore` interface — every method, what it does
- `WriteCommand` schema — all commands (create/read/insert/replace/undo/redo), their params
- `WriteOutcome` — the response contract, status codes, text format
- `WriteContext` — session/thread/turn/response context
- Port interfaces: `DocumentCoordinator`, `DocumentLifecycle`, `UpdateJournal`, `ActorSessionStore`, `SyncStateStore`
- The `AgentEditModel` interface — what it requires from the document model
- The codec adapter — how documents are serialized/deserialized
- The demo harness (`demo/harness.ts`, `demo/fakes.ts`) — what it takes to stand up an in-memory instance

### 2. @meridian/contracts (`packages/contracts`)
Protocol and wire types.
- Everything exported from `src/index.ts` and sub-paths
- Protocol types: yjs-ws, thread-documents, AG-UI, ws-protocol
- Spawn contracts
- Runtime types (IDs, usage, invoke-errors)
- Interrupt/component types
- What the server depends on vs what's truly shared

### 3. @meridian/prosemirror-schema (`packages/prosemirror-schema`)
Document schema.
- What nodes/marks are defined
- `buildDocumentSchema()` — what it returns
- How the schema relates to agent-edit's block model
- What would need to change for code files (vs prose/fiction)

### 4. @meridian/markup (`packages/markup`)
Codecs for document serialization.
- The codec interface — what methods, what types
- MDX codec — what it does
- What a code file codec would need to look like (based on the interface)

### 5. Design tokens (`packages/design-tokens`)
- What's here, is it reusable for a code-focused UI?

## Also check

- The `h/draft-simplify` branch: `git diff h/v3..h/draft-simplify -- packages/` to see
  what's changing. Note any API surface changes vs internal-only changes.
- The server's collab domain (`apps/server/server/domains/collab/`) — specifically the
  adapters that implement the agent-edit ports: Hocuspocus coordinator, Drizzle journal,
  document lifecycle. These are what the rewrite needs to reimplement for local/SQLite.
- `apps/server/server/lib/wired-core-tools.ts` — how the write tool is wired to the
  server's agent runtime. This is the pattern the rewrite's MCP/CLI binding follows.

## Output format

For each package, list:
- **Public exports** — types and functions, grouped by purpose
- **Port interfaces** — what adapters the consumer must provide
- **Dependencies** — what each package depends on (yjs, prosemirror, zod, etc.)
- **Reuse vs adapt** — what the rewrite can use as-is vs what needs new adapters
- **draft-simplify delta** — any API surface changes on the active branch
