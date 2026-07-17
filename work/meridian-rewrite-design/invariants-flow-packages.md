# Meridian Flow shared packages — API surface for meridian-cli rewrite

Exploration of `/home/jimyao/gitrepos/meridian-flow` on branch `h/v3` (current checkout), with `h/draft-simplify` delta noted where it changes public contracts. Read-only; no code changes.

**Target path:** `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-flow-packages.md` (copy from workspace if needed)

---

## Cross-cutting architecture

Meridian Flow packages follow **ports & adapters**: domain logic in packages depends on port interfaces; hosts (server, CLI, MCP) provide concrete adapters at the composition root. `AGENTS.md` at repo root and per-package frames this consistently.

**Rewrite implication:** meridian-cli can consume `@meridian/agent-edit`, `@meridian/markup`, `@meridian/prosemirror-schema`, and selectively `@meridian/contracts` as npm deps. It must **reimplement** server adapters for local/SQLite: `UpdateJournal` + `ReversalStore`, `DocumentCoordinator`, `DocumentLifecycle`, optional `ActorSessionStore`, and (on `h/v3`) `SyncStateStore`. Pattern reference: `apps/server/server/domains/collab/composition.ts` + `wired-core-tools.ts`.

---

## 1. `@meridian/agent-edit` (`packages/agent-edit`)

### Public exports (`src/index.ts`)

**Factory & core interface**

| Export | Purpose |
|--------|---------|
| `createAgentEditCore(options)` | Builds `AgentEditCore` from ports |
| `AgentEditCore` | Public mutation surface (see below) |
| `AgentEditCoreOptions` | Alias of `CreateWriteToolOptions` |

**`AgentEditCore` methods** (from `src/index.ts`, implemented in `src/tool/write.ts`):

| Method | Purpose |
|--------|---------|
| `write(command, context?)` | Main `write(command=...)` tool dispatch |
| `recover(docId)` | Replay journal into live doc via coordinator |
| `commitResponse(responseId)` | Flush staged response writes to journal + live sync |
| `rollbackResponse(responseId)` | Discard staged buffers; restore runtime from live |
| `getAvailability(docId, threadId)` | Whether undo/redo will attempt work |
| `undo(docId, threadId)` | Reverse latest write (or selector via write command) |
| `redo(docId, threadId)` | Redo last reversed write group |
| `reverse(input)` | Host-level undo/redo with selection, actor, `requireEffect` |
| `undoTurn` / `redoTurn` | Host-compatible aliases (default to latest write) |
| `invalidateThread(docId, threadId)` | Evict runtime + staged buffers for thread |

**Codec & model**

| Export | Purpose |
|--------|---------|
| `createAgentEditCodec(markup)` | Wraps `@meridian/markup` `MarkupCodec` with hash-prefixed block lines |
| `AgentEditCodec` | `parse`, `serialize`, `serializeBlockBodies`, `serializeBlock(s)` |
| `yProsemirrorModel(schema)` | v1 `AgentEditModel` implementation |
| `YProsemirrorDocumentModel` | Concrete model type |
| `fragmentOf` | Y.XmlFragment accessor for prosemirror fragment |

**Handles & addressing**

| Export | Purpose |
|--------|---------|
| `BlockRef`, `DocHandle` | Opaque CRDT handles |
| `toDocHandle`, `toRef`, `unwrapBlock`, `unwrapDoc` | Handle helpers |
| `parseDocumentAddress`, `formatDocumentFile`, `splitDocumentFile` | `file` / `filePath` ↔ internal id |
| `DocumentAddress`, `ParseDocumentAddressResult` | Address types |

**Command schema**

| Export | Purpose |
|--------|---------|
| `WriteCommandSchema` | Zod discriminated union for all commands |
| `MUTATING_WRITE_COMMANDS`, `writeCommandCategory` | Command classification |
| `WriteCommand`, `WriteContext`, `WriteOutcome`, `WriteStatus`, etc. | Tool contract types |
| `parseWriteHandle`, `writeHandle` | `w<N>` handle helpers |

**Ports (types only — consumer implements)**

| Export | Purpose |
|--------|---------|
| `UpdateJournal`, `ReversalStore` | Ordered Yjs log + reversal metadata |
| `DocumentCoordinator`, `DocumentLifecycle` | Live doc exclusive access + creation |
| `ActorSessionStore`, `ActorSession` | External session identity |
| `SyncStateStore`, `SyncState` | **h/v3 only** — durable per-thread sync baseline |
| `AgentEditModel`, `DocumentModel`, `BlockLookup`, `TextRun` | Structural document model port |
| `UndoNotificationPort` | Optional user-undo notification callback |

**Undo / echo utilities**

| Export | Purpose |
|--------|---------|
| `touchedBlockHashesBetween` | Block diff helper |
| `ConcurrentEditInfo` | Human vs agent concurrent edit summary |
| `reconstructUndoUpdateFromSnapshot` | Cold reconstruction helper |
| `ReversalSelection`, `UndoAvailability`, `ReconstructionOptions` | Reversal planning types |

**Test support** (`@meridian/agent-edit/test-support`): `InMemoryAgentEditJournal`, `createWriteToolHarness`, assertion helpers.

### `WriteCommand` schema (`src/tool/command-schema.ts`)

All commands share base fields: `file` (required), `documentId?`, `tool_use_id?`.

| Command | Params |
|---------|--------|
| `create` | `content?`, `overwrite?` |
| `read` | `in?` (hash \| index \| `[from,to]`), `around?`, `format?` (`auto` \| `full` \| `outline`) |
| `insert` | `content`, `after?`, `before?`, `find?`, `in?`, `around?`, `all?` |
| `replace` | `content`, `in?`, `find?`, `around?`, `all?` |
| `undo` / `redo` | `to?`, `from?`, `last?`, `all?` (write-handle selectors) |

Scope target: `string | number | [string|number, string|number]`.

### `WriteOutcome` (`src/tool/types.ts`)

```ts
interface WriteOutcome {
  command: WriteCommandName;
  status: WriteStatus;      // "success" | WriteErrorStatus | UndoRedoOutcome
  isError: boolean;
  writeId?: string;         // e.g. "w3" on successful mutating writes
  text: string;             // LLM-facing plain text (status + echo + content)
  content?: WriteResultBlock[];  // Structured blocks; hosts prefer over text
}
```

**WriteStatus values:**

- Success: `"success"`
- Errors: `not_found`, `ambiguous_match`, `invalid_write`, `document_not_found`, `partial_failure`, `cant_undo_dependent`, `internal_error`
- Undo/redo: `reversed`, `reconciled`, `partial`, `nothing_to_undo`, `nothing_to_redo`, `expired`

**Text format** (`src/tool/response-format.ts`, `internal-result.ts`):

- Status line: `status: <code>` optionally followed by message
- Successful mutating writes: two content blocks — metadata (status, write id, concurrent edits) + echo `hash|body` lines
- `formatConcurrent()` adds `concurrent edits:` with `human:` / `agent:` hash lists
- Idempotency: `WriteContext.tool_use_id` replays cached `text`

### `WriteContext` (`src/tool/types.ts`)

Host-only context (not in LLM command params):

| Field | Purpose |
|-------|---------|
| `session?` | Direct `ActorSession` for embedded callers |
| `externalId?` | Resolved via `ActorSessionStore` |
| `sessionId?`, `threadId?` | Convenience for server-local callers |
| `turnId?` | Durable undo metadata grouping |
| `tool_use_id?` | Idempotency key |
| `responseId?` | Enables response staging (defer journal commit) |
| `createdDocument?` | Host signals fresh create for lifecycle cleanup |

### Port interfaces (adapter contracts)

#### `UpdateJournal` + `ReversalStore` (`src/ports/update-journal.ts`)

Split persistence seam:

**UpdateJournal** — ordered Yjs update log:
- `append(docId, update, meta)` → seq
- `appendBatch(entries)` → `JournalBatchAppendResult[]`
- `read(docId, opts?)` → `JournalSnapshot` (checkpoint + updates)
- `checkpoint(docId, state, upToSeq)`
- `compact(docId, before)` → `CompactionResult`

**ReversalStore** — write ordinals + undo/redo:
- `reserveWriteOrdinal(documentId, threadId)` → wId number
- `readForReconstruction(docId)` → retained log for cold undo
- `documentsForTurn`, `latestActiveWrite`, `activeWriteSummary`
- `mutationsForWrite` / `mutationsForWrites` (batched)
- `persistUndo`, `persistRedo`, `readReversals`
- `reversalOpSeqsForHandles`

Journal types in `src/ports/types.ts`: `UpdateMeta`, `PersistedUpdate`, `JournalSnapshot`, `ReversalRecord`, `ReversalStatus`, `ReversalActor`.

#### `DocumentCoordinator` (`src/ports/document-coordinator.ts`)

- `withDocument(docId, fn)` — exclusive live `Y.Doc` access; throws `DocumentNotFoundError`
- `recover(docId)` — replay missing journal updates into live doc

#### `DocumentLifecycle` (`src/ports/document-lifecycle.ts`)

- `ensureDocument(docId)` — idempotent create; must not clobber existing content
- Required for `write(command="create")`; without it → `invalid_write`

#### `SyncStateStore` (`src/ports/sync-state-store.ts`) — **h/v3 only**

- `load/save/delete(documentId, threadId)` for `{ stateVector, syncedSnapshot, committedSnapshot }`
- Used for post-restart runtime reconcile and concurrent-detection baseline
- **Removed on `h/draft-simplify`** — replaced by host-provided `WriteContext.interactionContext`

#### `ActorSessionStore` (`src/ports/actor-session-store.ts`)

Optional. `resolve(externalId)`, `bind(externalId, sessionId)`, `evict(olderThan)`.

#### `AgentEditModel` (`src/ports/model.ts`)

Full structural port: block identity, lookup, Tier 1/2/3 mutations, batch projection/serialization (`projectBlocks`, `serializeBlockLines`, `serializeBlockBodies`), `applyInlineReplacement`, `inlineRuns`, `isPlainTextReplacement`. v1 impl: `yProsemirrorModel(schema)`.

### Codec adapter (`src/codec-adapter.ts`)

Thin wrapper over `@meridian/markup`:

- `parse` / `serialize` delegate to markup codec
- Adds agent-edit display: `hash|body` (multiline: `hash|\nbody`)
- Hash = Y.XmlElement CRDT item id (stable across content edits, lost on delete/type change)

### Demo harness (`demo/harness.ts`, `demo/fakes.ts`)

**Stand up in-memory instance:**

```ts
const schema = buildDocumentSchema();
const codec = createAgentEditCodec(mdxCodec({ schema }));
const model = yProsemirrorModel(schema);
const journal = new InMemoryJournal();           // extends InMemoryAgentEditJournal
const coordinator = new InMemoryCoordinator(journal);  // DocumentCoordinator + DocumentLifecycle

const core = createAgentEditCore({
  journal,
  coordinator,
  lifecycle: coordinator,
  codec,
  model,
  defaultSessionId: "demo-session",
  defaultThreadId: "demo-thread",
});
```

`InMemoryCoordinator`: per-doc `Y.Doc` map, keyed mutex, `recover()` replays journal, `ensureDocument()` creates empty doc, `applyHumanUpdate()` for concurrent-edit demos.

### Dependencies

| Package | Role |
|---------|------|
| `@meridian/markup` | MDX/markdown ↔ ProseMirror |
| `yjs` 13.6.31 | CRDT |
| `y-prosemirror` | v1 document model |
| `prosemirror-model` | PM nodes |
| `zod` | Command schema |

`@meridian/prosemirror-schema` is devDependency only (hosts inject schema).

### Reuse vs adapt (CLI rewrite)

| Reuse as-is | New adapters needed |
|-------------|---------------------|
| `createAgentEditCore`, write tool, undo/redo, staging | `UpdateJournal` + `ReversalStore` → SQLite |
| `createAgentEditCodec` + markup | `DocumentCoordinator` → in-process Y.Doc + file lock |
| `yProsemirrorModel` + fiction schema (or code schema later) | `DocumentLifecycle` → create doc row + empty Yjs head |
| Command schema, outcome formatting | Path resolution (`file` ↔ `documentId`) — host-owned |
| Demo fakes as starting point | Optional `ActorSessionStore` for MCP session binding |
| | On h/v3: `SyncStateStore` or omit and always `read` before write |
| | On draft-simplify: `interactionContext` baseline per write |

### `h/draft-simplify` delta (agent-edit)

**Breaking / API surface changes:**

1. **`SyncStateStore` removed** from public exports and deleted (`sync-state-store.ts`). Runtime sync is memory-only; attribution uses host `WriteContext.interactionContext` (`baselineSnapshot`, `afterJournalId`, `attemptId`, `mode: live | threadPeer` + `branchGeneration`).

2. **New `AgentEditCore` methods:** `bufferedUpdatesForDoc`, `stagedCreatedDocumentIds`.

3. **New public exports:** `applyConcurrentUpdates`, `snapshotBlocks`, `DEFAULT_CONCURRENT_COLLAPSE_THRESHOLD`, `BlockSnapshot`, Yjs helpers (`effectiveYjsUpdate`, `yjsUpdateFromState`, etc.).

4. **`WriteOutcome.error`** — machine-readable `WriteErrorDetail` (e.g. `response_lifecycle` / `response_closed`).

5. **`DocumentCoordinator.concurrentUpdatesSince?`** — optional origin-aware concurrent delta since state vector.

6. **`ReversalStore.persistUndo`** returns `PersistUndoResult` (was `void`); accepts `ReversalCommitGuard`.

7. **`JournalBatchAppendEntry.mutation`** — discriminated `mode: live | threadPeer` with `branchGeneration`; `journalCommitKind` on batch results.

8. **Concurrent attribution** — kernel can pass precomputed `touchedHashes` / `deletedHashes` / `collapsed` on `ConcurrentUpdateInput`; collapse threshold raised to 10.

9. **Idempotency** — `tool_use_id` scoped by `responseId` or `turnId` (not global).

10. **AGENTS.md / CONTEXT.md** rewritten: no `committedSnapshot` durable baseline; cold attribution from journal floor + thread-peer branch state.

**Internal-only (large diffs, same public command shape):** `runtime-store.ts`, `mutation-commit.ts`, `response-staging.ts`, echo LCS concurrent diffing.

---

## 2. `@meridian/contracts` (`packages/contracts`)

### Package exports (`package.json`)

| Subpath | Contents |
|---------|----------|
| `.` | `drafts/`, `enums`, `ids`, `jsonb`, `usage` |
| `./protocol` | Wire protocols (AG-UI, WS, Yjs, HTTP, paths, write-reversal) |
| `./runtime` | Branded IDs, invoke-errors, usage |
| `./threads` | Thread events, projections, block content |
| `./spawn` | Agent tree spawn contracts |
| `./interrupt` | Ask/error interrupts, `MeridianError` |
| `./components` | Interrupt component mapping |
| `./projects`, `./works`, `./preferences`, `./agents`, `./drafts` | Domain DTOs |

**Dependencies:** `@ag-ui/core`, `zod`. No server/DB/React.

### Protocol types (rewrite-relevant)

**`protocol/yjs-ws.ts`**
- `YJS_WS_PATH_PREFIX = "/ws/yjs"`
- `draftRoomName(draftId)`, `parseYjsRoomName(roomName)` → `{ kind: live | draft }`

**`protocol/write-reversal.ts`**
- Mirrors agent-edit `WriteStatus` (comment: keep in sync, packages stay decoupled)
- `ReversalOutcome`, `DocumentReversalResult` for context undo/redo APIs

**`protocol/thread-documents.ts`**
- `ThreadUploadDocumentItem`, `ThreadRecentDocumentItem`, `TurnLiveLineageDocumentItem`
- `scope: "live" | "draft"` on lineage items

**`protocol/ws-protocol.ts`**
- Zod schemas for subscribe/replay/gap/ping/error WS frames
- `SequencedEvent` wrapping `AGUIEvent`

**`protocol/agui.ts`**, **`protocol/http-types.ts`**, **`protocol/paths.ts`**, **`protocol/transport-serializer.ts`**, **`protocol/event-seq.ts`**, **`protocol/billing.ts`**, **`protocol/filetype.ts`**, **`protocol/projects.ts`**

### Spawn (`spawn/index.ts`)

- `AgentReport`, `SpawnResult` (`completed` | `background` | `error`)
- `TreeBudget`, `createDefaultTreeBudget()`, `DEFAULT_MAX_SPAWN_DEPTH = 2`

### Runtime (`runtime/index.ts`)

Branded IDs: `DocumentId`, `ThreadId`, `TurnId`, `UserId`, `WorkId`, `ProjectId`, etc. (`runtime/ids.ts` re-exports from `ids.ts`).

`invoke-errors.ts`, `usage.ts` — runtime accounting DTOs.

### Interrupt (`interrupt/index.ts`)

- `MeridianError`, `AskRequest`, `Interrupt`, `ArtifactRef`
- Builders: `errorInterrupt`, `askInterrupt`, `meridianErrorFromTool`, etc.

### What server depends on vs truly shared

| Truly shared (CLI likely needs) | Server-heavy (optional for CLI) |
|--------------------------------|----------------------------------|
| `runtime/ids` | `protocol/ws-protocol`, `protocol/agui` |
| `interrupt` (ask_user tool) | `threads/*` orchestrator events |
| `protocol/write-reversal` | `drafts/*` review DTOs |
| `spawn` (if CLI spawns subagents) | `protocol/billing`, `projects`, `works` |
| `protocol/yjs-ws` (if CLI syncs Yjs) | `protocol/thread-documents` |

Agent-edit intentionally duplicates `WriteStatus` in both packages with a sync comment — **no import coupling**.

### `h/draft-simplify` delta (contracts)

- `works/index.ts`: `AiWriteMode = "direct" | "draft"`, `AI_WRITE_MODE_VALUES`
- `protocol/thread-documents.ts`: `TurnLiveLineageDocumentItem` + `ListTurnLiveLineageResponse`
- `protocol/yjs-ws.ts`: simplified draft room naming (test file removed)
- `drafts/review.ts`: review DTO changes; `reject-runtime.ts` deleted
- `protocol/http-types.ts`, `paths.ts`: path adjustments

No changes to root `src/index.ts` export list.

---

## 3. `@meridian/prosemirror-schema` (`packages/prosemirror-schema`)

### Public exports (`src/index.ts`)

| Export | Purpose |
|--------|---------|
| `buildDocumentSchema()` | Returns `Schema` with all nodes/marks |
| `documentNodes`, `documentMarks` | Raw structural specs (no parseDOM/toDOM) |
| `PROSEMIRROR_FRAGMENT_NAME` | `"prosemirror"` — shared Y.XmlFragment name |
| `COLLAB_SCHEMA_VERSION` | `4` — bump invalidates caches |
| `RESERVED_CLIENT_ID_MAX` | `999` — server-owned Yjs clientID band |
| `AGENT_EDIT_UNDO_CLIENT_ID` | `999` — reversal writer slot |
| `isReservedClientId`, `createCollabYDoc()` | ClientID policy for collab docs |

### Nodes

From basic: `doc`, `paragraph`, `blockquote`, `heading`, `text`, `hard_break`.

Customized: `code_block` (+ `language`), `image`, `horizontal_rule`.

Custom: `bullet_list`, `ordered_list`, `list_item`, `table`/`table_row`/`table_header`/`table_cell`, `jsx_leaf`, `jsx_container`, `figure`.

### Marks

`strong`, `em`, `code` (excludes `_`), `link`, `strike`.

### Relation to agent-edit block model

- Agent-edit v1 uses **y-prosemirror** with this schema; **block = top-level PM block** in the prosemirror fragment
- Block hash = Y.XmlElement item id
- Fiction-oriented: headings, figures, MDX components, tables, scene breaks
- **Not draggable** on `figure` (reorder policy: delete+insert only)

### Code files vs prose

For code-focused CLI:
- `code_block` already has `language` attr
- Would need: possibly `text` leaf-only doc or single `code_block` root, new markup codec plugin (not MDX), potentially simpler schema (drop `jsx_*`, `figure`, tables)
- `buildDocumentSchema()` is host-injected — CLI can fork schema + register matching markup codecs
- Agent-edit kernel is CRDT-neutral but **content currency is ProseMirror** (`Block = PMNode` in `codec-types.ts`)

### Dependencies

`prosemirror-model`, `prosemirror-schema-basic`, `yjs`, `lib0`.

### `h/draft-simplify` delta

No changes to this package.

---

## 4. `@meridian/markup` (`packages/markup`)

### Public exports (`src/index.ts`)

**Factories**
- `createMarkupCodec({ schema })` → builder
- `markdownCodec({ schema })`, `mdxCodec({ schema, components })`
- `markdown()`, `mdx({ components })` — plugins

**Types:** `MarkupCodec`, `MarkupCodecBuilder`, `MarkupPlugin`, `BlockCodec`, `MarkCodec`, `ParsedContent`, `ParseContext`, `SerializeContext`, `PMNode`, `BuildOptions`

**Helpers:** `parseBlockAst`, `stringifyBlock`, `rawTextForAst`, etc.

**Components:** `ComponentRegistry`, `ComponentSpec`, `EditorSpec`, `PropSpec`

**Errors:** `CodecParseError`

### `MarkupCodec` interface (`src/types.ts`)

```ts
interface MarkupCodec {
  parse(content: string): ParsedContent;           // { blocks: PMNode[] }
  serialize(blocks: PMNode[]): string;
  serializeBlock(block: PMNode): string;           // hashless body
  serializeBlocks(blocks: readonly PMNode[]): string[];
}
```

**Builder rules:** one codec per node/mark; marks required; blocks opt-in via `requiredBlockNames`; LIFO block parse priority.

### MDX codec

- Canonical Meridian wire format; pure markdown is subset
- `mdx({ components })` registers MDX block codecs with closure-captured component registry
- Pipeline: text → unified/remark → mdast → BlockCodec/MarkCodec → PM nodes (reverse for serialize)

### Code file codec (what it would need)

Implement a `MarkupPlugin` with:
- `blocks`: codec for `code_block` (or a new `source_file` node if schema extended)
- `marks`: at minimum `code` mark codec if inline code needed
- Optional `preprocess` / `remarkPlugins` if not using markdown
- Register via `createMarkupCodec({ schema }).use(codePlugin()).build({ requiredBlockNames: ["code_block"] })`

Then wrap with `createAgentEditCodec()` for agent-edit hash prefixes.

Agent-edit hash formatting stays **outside** markup (by design).

### Dependencies

`prosemirror-model`, `unified`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-mdx`.

### `h/draft-simplify` delta

No package changes.

---

## 5. `@meridian/design-tokens` (`packages/design-tokens`)

### What's here

Single export: `@meridian/design-tokens/ink-jade.css`

- Tailwind v4 `@theme` semantic tokens (Ink & Jade palette)
- Warm rice-paper backgrounds, jade primary, cinnabar accent
- Typography: Inter everywhere
- Spacing, radius, shadows, sidebar/chat/editor-specific variables

### Reusable for code-focused UI?

**Partially.** Tokens are product-branded for fiction writing (warm studio surfaces, prose-oriented editor chrome). A code-focused CLI/TUI could:
- Reuse spacing/radius/shadow primitives
- Swap or override color semantics (dark terminal theme)
- Import CSS in a web-based CLI shell

Not useful for pure terminal CLI without a CSS consumer. No TS API — CSS only.

### `h/draft-simplify` delta

Minor `ink-jade.css` token tweaks (18 lines).

---

## Server collab adapters (rewrite reference)

Location: `apps/server/server/domains/collab/`

### Composition (`composition.ts`)

Wires:
```ts
createAgentEditCore({
  journal,           // Drizzle: UpdateJournal + ReversalStore
  coordinator,       // Hocuspocus DocumentCoordinator
  lifecycle,         // Drizzle ensureDocument
  codec: createAgentEditCodec(mdxCodec({ schema: buildDocumentSchema() })),
  model: yProsemirrorModel(schema),
  undoClientId: AGENT_EDIT_UNDO_CLIENT_ID,
  createRuntimeDoc: () => createCollabYDoc({ gc: false }),
  syncStateStore,    // Drizzle SyncStateStore (h/v3)
  undoNotificationPort?,
  onInvariantViolation?,
})
```

Also: draft-mode router, markdown projection engine, Hocuspocus persistence, turn reversal orchestration.

### `hocuspocus-coordinator.ts`

- `withDocument`: KeyedMutex → `openDirectConnection` → fn → disconnect
- `recover`: `loadDocumentState(journal)` → `Y.diffUpdate` apply missing
- Throws `DocumentNotFoundError` if no live or persisted state

### `drizzle-journal.ts`

- Tables: `documentYjsUpdates`, checkpoints, heads, reversals, reversal ops, agent edit mutations, wId counters
- Implements full `UpdateJournal` + `ReversalStore`
- `ensureDocument`: assert readable head, upsert head, checkpoint empty doc if no updates
- Scoped by `LIVE_SCOPE` vs draft ULID (`drizzle-agent-edit-scope.ts`)

### `drizzle-sync-state.ts` (h/v3)

- `agentEditSyncState` table: `stateVector`, `syncedSnapshot`, `committedSnapshot` per (document, thread, scope)

### `in-memory/agent-edit.ts`

Test/app graph: `InMemoryAgentEditJournal` + `createInMemoryCoordinator` + `createInMemoryDocumentLifecycle` — **closest template for CLI SQLite adapters**.

### CLI rewrite mapping

| Server adapter | CLI equivalent |
|----------------|----------------|
| Drizzle journal | SQLite journal tables (same port interface) |
| Hocuspocus coordinator | In-process `Y.Doc` per file + file/process lock |
| Drizzle lifecycle | Create file record + empty checkpoint |
| Drizzle sync state | Omit (draft-simplify) or local KV / skip |
| Context path resolution | CLI workspace root + relative paths |
| `wired-core-tools` pattern | Map `path` → `file`/`documentId`, call `core.write()` |

---

## `wired-core-tools.ts` binding pattern

`apps/server/server/lib/wired-core-tools.ts` — **the pattern meridian-cli MCP/CLI should follow**:

1. **Parse model input:** `path` (required) + command fields → `WriteCommandSchema.safeParse({ ...file: path })`
2. **Resolve document:** `ContextPort.stat` / `ensureTrackedDocument` → `documentId` + `filePath`
3. **Build package command:** `buildAgentWriteCommand` sets `documentId`, `file: formatDocumentFile(address)`, `tool_use_id`
4. **Call core:** `documentSync.agentEdit().write(command, { sessionId, threadId, turnId, responseId, tool_use_id, createdDocument })`
5. **Response lifecycle:** `trackStagedCreate` for staged creates; `commitResponse` / `rollbackResponse` after model response
6. **Projection refresh:** after non-staged mutating writes, `refreshDocumentProjection`
7. **Error mapping:** `WriteOutcome.isError` → `MeridianError` tool error

Also wires `list`, `search`, `ask_user` (interrupt from `@meridian/contracts/interrupt`).

---

## Contradictions noted

1. **`packages/agent-edit/AGENTS.md` on h/v3** still documents `SyncStateStore` / `committedSnapshot` durable baseline; **`h/draft-simplify` AGENTS.md and code** remove `SyncStateStore` and shift to `interactionContext` — docs on current branch lag the active redesign branch.

2. **`WriteStatus` duplication** between `@meridian/agent-edit` and `@meridian/contracts/protocol/write-reversal.ts` — intentional decoupling with manual sync comment.

3. **`composition.ts` on h/v3** has duplicate `BRANCH_AGENT_BROADCAST_ORIGIN` const declarations (lines 93–101) — likely merge artifact; unrelated to package API but worth noting for anyone copying composition.

---

## Summary: rewrite dependency graph

```
meridian-cli
  ├── @meridian/agent-edit     (core — write tool, ports)
  │     └── @meridian/markup   (codec)
  ├── @meridian/prosemirror-schema  (schema injection)
  ├── @meridian/contracts      (optional: ids, interrupt, spawn, write-reversal)
  └── local adapters
        ├── SQLite UpdateJournal + ReversalStore
        ├── In-process DocumentCoordinator + Lifecycle
        └── path resolver (replaces ContextPort)
```

**Pin branch:** If targeting latest design, pin `h/draft-simplify` or merge it first — `SyncStateStore` removal and `interactionContext` are material adapter changes.
