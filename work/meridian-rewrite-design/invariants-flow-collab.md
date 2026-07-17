# Meridian Flow Collab Domain — Explorer Report

**Task dir:** `/home/jimyao/gitrepos/meridian-flow` (branch `h/v3`)  
**Comparison worktree:** `/home/jimyao/gitrepos/meridian-flow.worktrees/draft-simplify` (branch `h/draft-simplify`)  
**Date:** 2026-07-06  
**Intended destination:** `$MERIDIAN_ACTIVE_WORK_DIR/invariants-flow-collab.md` (write failed: permission denied outside workspace)

This report documents how Meridian Flow's server implements `@meridian/agent-edit` ports, Hocuspocus integration, thread/turn lifecycle, tool wiring, and context architecture — for designing a local CRDT authority in the meridian-cli TS rewrite.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Runtime orchestrator (domains/runtime/loop/orchestrator.ts)            │
│    → ToolExecutor → wired-core-tools.write handler                      │
│    → commitResponse / rollbackResponse at end of model-response batch   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│  wired-core-tools.ts                                                    │
│    resolveThreadContext → contextPortForThread → path → documentId      │
│    documentSync.agentEdit().write(...) with sessionId=threadId          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│  CollabDomain (collab/composition.ts)                                   │
│    draftWriteModeRouter.agentEditCore (live vs draft response routing)  │
│    → createAgentEditCore({ journal, coordinator, syncStateStore, ... }) │
└───────┬───────────────────────────────────────────────┬─────────────────┘
        │                                               │
        ▼                                               ▼
┌───────────────────┐                         ┌─────────────────────────┐
│ Drizzle journal   │                         │ Hocuspocus coordinator  │
│ + ReversalStore   │                         │ (live Y.Doc mutex)      │
│ (Postgres)        │                         │ + WS route (ws/yjs.ts)  │
└───────────────────┘                         └─────────────────────────┘
```

Package boundary: `@meridian/agent-edit` owns the write tool, runtime Y.Doc, response staging, cold undo/redo reconstruction. Server adapters implement ports only; package never imports server code.

---

## 1. Port Implementations (Adapters)

### DocumentCoordinator

| | |
|---|---|
| **Production adapter** | `apps/server/server/domains/collab/adapters/hocuspocus-coordinator.ts` |
| **Test/in-memory** | `apps/server/server/domains/collab/adapters/in-memory/agent-edit.ts` (`createInMemoryCoordinator`) |

**What it does**

- Serializes concurrent mutators per `docId` via `KeyedMutex`.
- `withDocument(docId, fn)` opens a **direct Hocuspocus connection** (`openDirectConnection`), runs `fn` on the live `Y.Doc`, then disconnects.
- `recover(docId)` replays journal state onto live doc via `Y.diffUpdate` + `loadDocumentState`.
- Throws `DocumentNotFoundError` when neither live doc nor persisted state exists.

**Infrastructure dependencies**

- `@hocuspocus/server` singleton (bound at WS route startup via `bindHocuspocus`)
- `UpdateJournal` for `loadDocumentState` (checkpoint + updates replay)
- `KeyedMutex` (in-process; no Redis)

**Local/SQLite equivalent**

- Replace Hocuspocus with an in-process `Map<docId, Y.Doc>` + `KeyedMutex` (same pattern as `createInMemoryCoordinator`).
- Still need journal replay on cold open (`document-loader.ts`).

**Complexity:** **Moderate** — mutex + doc map is trivial; Hocuspocus adds WS lifecycle, connection origin tracking, debounced checkpointing.

**Key invariants**

- One mutator at a time per document.
- `recover` is idempotent (applies only missing updates).
- Agent writes go through Hocuspocus live docs, not a second in-memory owner.

**draft-simplify changes**

- Adds `BranchCoordinator` (`domain/branch-coordinator.ts`) — separate mutation surface for branch-peer Y.Docs with CAS generation, pull/push from upstream.
- Live coordinator unchanged; agent writes target **thread-peer branch** via `createBranchAgentEditCoordinator`, not live directly.

---

### DocumentLifecycle

| | |
|---|---|
| **Production adapter** | `createServerDocumentLifecycle` in `adapters/drizzle-journal.ts` (lines ~998–1014) |
| **Test/in-memory** | `createInMemoryDocumentLifecycle` in `adapters/in-memory/agent-edit.ts` |

**What it does**

- `ensureDocument(docId)` is idempotent:
  1. `assertReadableHead` (stale-schema guard — fail loud if `schema_version` behind)
  2. Upsert `document_yjs_heads` row
  3. If journal empty, create empty checkpoint at seq 0
- Does **not** clobber existing content.
- Callers must create `documents` row first (FK constraint).

**Infrastructure dependencies:** Postgres `document_yjs_heads`, checkpoints; `COLLAB_SCHEMA_VERSION`.

**Local/SQLite equivalent:** Same tables in SQLite; logic ports directly.

**Complexity:** **Trivial** for lifecycle; schema-version fencing adds policy.

**Key invariants:** `assertReadableHead` before `upsertHead`; empty doc = checkpoint at seq 0.

**draft-simplify changes:** Branch documents have separate lifecycle; live lifecycle unchanged.

---

### UpdateJournal (+ ReversalStore)

| | |
|---|---|
| **Production** | `createDrizzleCollabPersistence` in `adapters/drizzle-journal.ts` |
| **In-memory** | `InMemoryCollabJournal` in `adapters/in-memory/agent-edit.ts` |
| **Draft-scoped (v3)** | `createDrizzleDraftAgentEditJournal` — `scope_id` ≠ `'live'` |

**UpdateJournal:** append/appendBatch, read (checkpoint+updates), checkpoint, compact.

**ReversalStore:** reserveWriteOrdinal, readForReconstruction, documentsForTurn, persistUndo/Redo, mutationsForWrite(s), activeWriteSummary, readReversals.

**Postgres tables** (`packages/database/src/schema/yjs.ts`):

| Table | Role |
|---|---|
| `document_yjs_updates` | Append-only Yjs update log |
| `document_yjs_checkpoints` | Full-state snapshots |
| `document_yjs_heads` | Latest seq, checkpoint FK, schema_version |
| `agent_edit_mutations` | Per-write metadata |
| `agent_edit_wid_counters` | Write ordinals |
| `document_yjs_reversals` | Undo/redo records |
| `document_yjs_reversal_ops` | System undo/redo seq index |
| `agent_edit_sync_state` | Per-thread runtime baseline |
| `document_yjs_drafts` + draft_updates | Draft subsystem (v3 only) |

**Local port complexity:** **Significant** — largest adapter.

**Key invariants:** Monotonic seq; `w<N>` handles; `scope_id`; reserved clientID band [0,999]; compaction semantics.

**draft-simplify:** Removes draft tables/scope_id; adds branch journal tables + `journal-dependencies.ts`.

---

### ActorSessionStore

**Meridian server:** **Not implemented.**

**Substitute:** `sessionId = threadId` in `wired-core-tools.ts`; durable baselines via `SyncStateStore` (`drizzle-sync-state.ts`, table `agent_edit_sync_state`).

**CLI options:** Implement `ActorSessionStore` for external CLI identity, or mirror server with threadId + SyncStateStore.

**Complexity:** **Trivial** (threadId) / **Moderate** (full ActorSessionStore).

---

### ReversalStore

Implemented in `drizzle-journal.ts` alongside UpdateJournal.

- Cold reconstruction undo/redo (no `Y.UndoManager`).
- `persistUndo`: txn appends undo update + reversal rows + mutation status flip.
- Turn orchestration: `domain/turn-reversal.ts` calls `agentEdit.reverse()` per doc from `documentsForTurn`.

**Complexity:** **Significant**.

**draft-simplify:** Rewritten turn-reversal; adds turn-receipt; removes draft-accept reactivation path.

---

## 2. Hocuspocus Integration

**File:** `apps/server/server/routes/ws/yjs.ts`

- `debounce: 2000`, `maxDebounce: 10000`, `gc: false`
- `onLoadDocument` → `loadDocumentState` or draft projection
- `onChange` (connection only) → `persistConnectionUpdate` (async, tracked)
- `onStoreDocument` → drain pending → `journal.checkpoint`
- `bindHocuspocus` wires singleton into collab domain

**Persistence:** `hocuspocus-persistence.ts` — pending queue, reserved clientID rejection, draft append (no checkpoint on store).

**ws-thread-handler.ts:** Thread event protocol only — not Yjs.

**CLI:** Skip Hocuspocus; use in-memory coordinator + journal — **recommended**.

---

## 3. Thread and Turn Model

- **threads:** Thread → Turns → Blocks; event journal; ThreadEventHub for WS
- **Tool calls:** sequential `write`; context `{ threadId, turnId, responseId, toolCallId }`
- **Commit:** orchestrator calls `responseWrites.commitResponse` after tool batch (~line 1071)
- **Staging:** package `response-staging.ts`; server `draft-write-mode-router.ts` for live vs draft
- **Context:** `resolveThreadContext` → `contextPortForThread` → `stat`/`ensureTrackedDocument`

---

## 4. Tool Registration and Wiring

- **Definitions:** `runtime/tools/core-tools.ts` — write, list, search, ask_user
- **Handlers:** `lib/wired-core-tools.ts`
- **Flow:** parse path → ContextPort → documentId → `agentEdit().write`
- **Lifecycle:** `createAgentEditResponseWriteLifecycle` — staged create cleanup on rollback

---

## 5. Context Port Architecture

- **Interface:** `context/ports/context-port.ts`
- **Schemes:** manuscript, kb, user, work, uploads
- **Tracked docs:** `context-fs` → documents row + `documentSync.ensureDocument`
- **Projections:** `documents.markdownProjection` via post-write hook — cache, not live owner
- **CLI:** filesystem adapter + SQLite doc registry — **moderate**

---

## 6. Observability

`EventSink` + `emitEvent` injected at composition root.

| Source | Event |
|---|---|
| collab.hocuspocus | persistence_append.failed, draft_append.rejected |
| collab.agent_edit | invariant_violation |
| collab.* | post_write_hook.failed, projection_refresh.failed |
| collab.undo_notifications | document_uri_missing |
| lib.wired-core-tools | document_touch.failed |

Hook failures never roll back committed journal writes.

---

## 7. draft-simplify Summary

| v3 (current) | draft-simplify |
|---|---|
| document_yjs_drafts, scope_id | Branch model (live + thread-peer + work-draft) |
| draft-write-mode-router | Agent writes to thread-peer branch |
| Draft Hocuspocus rooms | Branch coordinator only |
| Accept/reactivate lifecycle | branch-push + review closure |

95 files changed in scoped paths (+14k / -19k lines).

---

## 8. Complexity Summary

| Component | Local port | Priority |
|---|---|---|
| UpdateJournal + ReversalStore | Significant | 1 |
| DocumentCoordinator (in-memory) | Trivial–Moderate | 2 |
| DocumentLifecycle | Trivial | 3 |
| SyncStateStore | Moderate | 4 |
| ContextPort (filesystem) | Moderate | 5 |
| wired-core-tools equivalent | Moderate | 6 |
| ActorSessionStore | Trivial (defer) | 7 |
| Draft/branch layer | Significant (defer) | 8 |

---

## 9. Key File Index

| Path | Purpose |
|---|---|
| `packages/agent-edit/src/ports/*.ts` | Port interfaces |
| `packages/agent-edit/src/tool/response-staging.ts` | Deferred commit |
| `collab/composition.ts` | Server composition root |
| `collab/adapters/drizzle-journal.ts` | Journal + reversal |
| `collab/adapters/hocuspocus-coordinator.ts` | Live doc coordinator |
| `collab/adapters/document-loader.ts` | Journal → Y.Doc |
| `collab/hocuspocus-persistence.ts` | WS persistence |
| `routes/ws/yjs.ts` | Hocuspocus route |
| `lib/wired-core-tools.ts` | Tool wiring |
| `runtime/tools/core-tools.ts` | Tool definitions |
| `runtime/loop/orchestrator.ts` | Turn loop |
| `context/ports/context-port.ts` | Context contract |
| `packages/database/src/schema/yjs.ts` | Schema |
