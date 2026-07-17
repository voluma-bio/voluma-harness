Build a static HTML page at `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/data-model.html`.

This is part of a multi-page design site. Read these for patterns:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.css` — shared styles (includes `.schema-group`, `.schema-group-header`, `.schema-table` classes)
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.js` — shared JS
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/index.html` — structure reference

Standard HTML5, link shared.css, shared.js, CDN mermaid. Topbar with nav (data-model.html active). Theme toggle.

## Content: "Data Model (SQLite)"

This page renders the full SQLite schema as proper interactive tables — NOT collapsed `<pre>` blocks. Each table group should use the `.schema-group` class with a `.schema-group-header`, and render columns as a structured table with columns: Name, Type, Constraints/Notes.

### Lede
SQLite WAL replaces runtime files as authoritative state. Drizzle ORM, transactional writes, append-only journals where order matters. Crash-only spirit preserved: idempotent recovery on daemon startup.

### Pragmas (code block)
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

### Schema Groups — render each as a `.schema-group` with a header and a table of columns:

**1. Core Identity**

`projects`:
- id TEXT PRIMARY KEY (stable project UUID)
- root_path TEXT NOT NULL UNIQUE
- created_at TEXT NOT NULL
- last_opened_at TEXT NOT NULL

`id_counters`:
- scope TEXT NOT NULL (project id or global)
- kind TEXT NOT NULL (spawn | chat | thread | turn | event)
- next_int INTEGER NOT NULL
- PRIMARY KEY (scope, kind)

**2. Sessions, Threads, Turns**

`sessions`:
- id TEXT PRIMARY KEY (c<N>)
- project_id TEXT NOT NULL FK→projects
- root_thread_id TEXT
- active_work_id TEXT
- status TEXT NOT NULL CHECK (active|stopped|crashed)
- started_at TEXT NOT NULL
- stopped_at TEXT
- metadata_json TEXT DEFAULT '{}'

`threads`:
- id TEXT PRIMARY KEY
- session_id TEXT NOT NULL FK→sessions
- parent_thread_id TEXT FK→threads
- spawn_id TEXT
- harness TEXT NOT NULL
- model TEXT
- agent_name TEXT
- system_prompt_hash TEXT NOT NULL
- system_prompt_snapshot TEXT NOT NULL
- context_snapshot_json TEXT DEFAULT '{}'
- cache_policy_json TEXT DEFAULT '{}'
- status TEXT NOT NULL CHECK (open|stale|closed)
- created_at TEXT NOT NULL
- closed_at TEXT

`turns`:
- id TEXT PRIMARY KEY
- thread_id TEXT NOT NULL FK→threads
- response_id TEXT
- ordinal INTEGER NOT NULL
- status TEXT NOT NULL CHECK (started|committed|rolled_back|failed)
- started_at TEXT NOT NULL
- finished_at TEXT
- input_summary TEXT
- usage_json TEXT DEFAULT '{}'
- UNIQUE(thread_id, ordinal)

**3. Spawns**

`spawns`:
- id TEXT PRIMARY KEY (p<N>)
- project_id TEXT FK→projects
- session_id TEXT FK→sessions
- thread_id TEXT FK→threads
- parent_id TEXT FK→spawns
- owner_chat_id TEXT NOT NULL
- originating_bash_id TEXT
- depth INTEGER NOT NULL DEFAULT 0
- harness TEXT NOT NULL
- kind TEXT NOT NULL DEFAULT 'subagent'
- model TEXT
- agent_name TEXT
- agent_path TEXT
- skills_json TEXT DEFAULT '[]'
- skill_paths_json TEXT DEFAULT '[]'
- goal TEXT
- description TEXT
- display_label TEXT
- work_id TEXT
- control_root TEXT NOT NULL
- task_cwd TEXT NOT NULL
- execution_cwd TEXT NOT NULL
- launch_mode TEXT NOT NULL
- launch_policy_snapshot_json TEXT DEFAULT '{}'
- capability_json TEXT NOT NULL
- capability_token_hash TEXT NOT NULL
- status TEXT NOT NULL CHECK (queued|running|finalizing|succeeded|failed|cancelled|timed_out)
- terminal_origin TEXT
- cancel_intent TEXT
- error TEXT
- exit_code INTEGER
- worker_pid INTEGER
- runner_pid INTEGER
- runner_created_at_epoch REAL
- harness_session_id TEXT
- last_heartbeat_at TEXT
- started_at TEXT NOT NULL
- running_at TEXT
- finished_at TEXT
- duration_ms INTEGER
- token_input INTEGER DEFAULT 0
- token_output INTEGER DEFAULT 0
- token_total INTEGER DEFAULT 0
- cost_usd REAL DEFAULT 0
- revision INTEGER NOT NULL DEFAULT 0
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL

Indexes: (project_id, status, started_at DESC), parent_id, session_id, work_id

**4. Work Items**

`work_items`:
- id TEXT PRIMARY KEY (slug)
- project_id TEXT FK→projects
- title TEXT
- status TEXT NOT NULL
- active_dir TEXT NOT NULL
- archive_dir TEXT NOT NULL
- task_dir TEXT
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- archived_at TEXT
- metadata_json TEXT DEFAULT '{}'

**5. Documents & File Projection**

`documents`:
- id TEXT PRIMARY KEY
- project_id TEXT FK→projects
- relative_path TEXT NOT NULL
- absolute_path TEXT NOT NULL
- kind TEXT NOT NULL CHECK (source|markdown|text|generated|binary)
- codec TEXT NOT NULL
- schema_version INTEGER NOT NULL
- tracking_status TEXT NOT NULL CHECK (tracked|ignored|deleted)
- disk_hash TEXT
- yjs_head_seq INTEGER NOT NULL DEFAULT 0
- last_projected_at TEXT
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- UNIQUE(project_id, relative_path)

`thread_documents`:
- thread_id TEXT FK→threads
- document_id TEXT FK→documents
- role TEXT NOT NULL CHECK (read|write|mentioned|active)
- first_seen_turn_id TEXT
- last_seen_turn_id TEXT
- PRIMARY KEY (thread_id, document_id)

**6. Agent-Edit Journal**

`document_yjs_heads`:
- document_id TEXT PRIMARY KEY FK→documents
- latest_seq INTEGER NOT NULL DEFAULT 0
- checkpoint_seq INTEGER NOT NULL DEFAULT 0
- schema_version INTEGER NOT NULL
- updated_at TEXT NOT NULL

`document_yjs_updates`:
- document_id TEXT FK→documents
- seq INTEGER NOT NULL
- update_blob BLOB NOT NULL
- origin TEXT NOT NULL (agent|human|external|system)
- actor_id TEXT
- thread_id TEXT
- turn_id TEXT
- write_id TEXT
- meta_json TEXT DEFAULT '{}'
- created_at TEXT NOT NULL
- PRIMARY KEY (document_id, seq)

`document_yjs_checkpoints`:
- document_id TEXT FK→documents
- seq INTEGER NOT NULL
- state_blob BLOB NOT NULL
- state_vector_blob BLOB
- created_at TEXT NOT NULL
- PRIMARY KEY (document_id, seq)

`agent_edit_wid_counters`:
- document_id TEXT FK→documents
- thread_id TEXT FK→threads
- next_wid INTEGER NOT NULL
- PRIMARY KEY (document_id, thread_id)

`agent_edit_mutations`:
- document_id TEXT FK→documents
- thread_id TEXT FK→threads
- write_id TEXT NOT NULL (w<N>)
- turn_id TEXT
- response_id TEXT
- command TEXT NOT NULL
- status TEXT NOT NULL
- update_from_seq INTEGER
- update_to_seq INTEGER
- touched_hashes_json TEXT DEFAULT '[]'
- deleted_hashes_json TEXT DEFAULT '[]'
- created_at TEXT NOT NULL
- PRIMARY KEY (document_id, thread_id, write_id)

`document_yjs_reversals`:
- id TEXT PRIMARY KEY
- document_id TEXT FK→documents
- thread_id TEXT FK→threads
- write_id TEXT NOT NULL
- kind TEXT NOT NULL CHECK (undo|redo)
- status TEXT NOT NULL
- created_at TEXT NOT NULL
- meta_json TEXT DEFAULT '{}'

`document_yjs_reversal_ops`:
- reversal_id TEXT FK→reversals
- document_id TEXT FK→documents
- seq INTEGER NOT NULL
- PRIMARY KEY (reversal_id, seq)

**7. Events**

`events`:
- id TEXT PRIMARY KEY
- project_id TEXT FK→projects
- seq INTEGER NOT NULL
- event_type TEXT NOT NULL
- severity TEXT NOT NULL DEFAULT 'info'
- spawn_id TEXT FK→spawns
- session_id TEXT FK→sessions
- thread_id TEXT FK→threads
- turn_id TEXT
- trace_id TEXT
- span_id TEXT
- payload_json TEXT DEFAULT '{}'
- raw_text TEXT
- created_at TEXT NOT NULL
- UNIQUE(project_id, seq)

Indexes: (spawn_id, created_at), (thread_id, created_at), (project_id, event_type, created_at DESC)

### ER Diagram (mermaid)
Add an entity-relationship diagram showing the foreign key relationships between the main tables:
```
erDiagram
  projects ||--o{ sessions : contains
  projects ||--o{ documents : tracks
  projects ||--o{ spawns : owns
  sessions ||--o{ threads : has
  sessions ||--o{ spawns : runs
  threads ||--o{ turns : records
  threads ||--o{ thread_documents : references
  spawns ||--o{ spawns : parent_child
  documents ||--o{ document_yjs_updates : journal
  documents ||--o{ document_yjs_checkpoints : snapshots
  documents ||--o{ agent_edit_mutations : writes
```

Make it look professional — the schema tables should be well-formatted with alternating-row styling, proper type highlighting, and FK references should be visually distinct (use the accent color).
