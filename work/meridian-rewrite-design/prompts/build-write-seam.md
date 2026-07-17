Build a static HTML page at `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/write-seam.html`.

This is part of a multi-page design site. Read these files for patterns:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.css` — shared styles
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.js` — shared JS
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/index.html` — example structure

Standard HTML5, link shared.css, shared.js, CDN mermaid (`<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>`). Topbar with nav (write-seam.html active). Theme toggle.

## Content: "CRDT Write Seam"

### Lede
Three bindings, one authority. The authority is `WriteService`, composed in the daemon from `@meridian/agent-edit` plus local adapters. All agent writes land in the same Yjs document — human and agent edits merge by construction.

### Write Flow Diagram (mermaid)
```
flowchart TD
  Agent --> Binding["Binding (MCP / CLI / in-process)"]
  Binding --> WS["Daemon WriteService"]
  WS --> Auth["1. authorize(capability, path)"]
  Auth --> Core["2. AgentEditCore.write(command, context)"]
  Core --> YDoc["Y.Doc mutation"]
  Core --> Journal["SQLite journal append"]
  Journal --> Proj["3. File projection refresh"]
  Proj --> Outcome["WriteOutcome { status, text, writeId? }"]
  Outcome --> Return["Binding returns WriteOutcome.text"]
```

### Three Bindings

**Binding 1: MCP tool (Claude Code primary)**
- Claude Code stays native for subscription auth and TUI
- Deny `Edit`, `Write`, `NotebookEdit` in `.claude/settings.json`
- Supply `write` as MCP tool via `.mcp.json` (stdio transport)
- Schema imports `WriteCommandSchema` from `@meridian/agent-edit`
- Tool result is `WriteOutcome.text` — already LLM-readable, zero translation

**Binding 2: bash `write` CLI (subagents)**
```
# JSON form (canonical)
write '{"command":"replace","file":"src/main.ts","find":"old","content":"new"}'

# Friendly flags
write replace --file src/main.ts --find "old" --content "new"
write undo --file src/main.ts --last 1
```
Reads context from env (MERIDIAN_SPAWN_ID, MERIDIAN_CAPABILITY_TOKEN), POSTs to daemon, prints WriteOutcome.text, exits 0/1/2.

**Binding 3: in-process (API agents)**
Embedded/API agents call WriteService directly inside the daemon. Same schema, same outcome.

### Command Schema Table
Render as a proper table:

| Command | Required | Optional |
|---|---|---|
| `create` | `file` | content, overwrite |
| `read` | `file` | in, around, format |
| `insert` | `file`, `content` | after, before, find, in, around, all |
| `replace` | `file`, `content` | find, in, around, all |
| `undo` | `file` | to, from, last, all |
| `redo` | `file` | to, from, last, all |

### File → CRDT Projection
4 cards in a grid:
1. **Cold open** — Disk file parsed through code/prose codec → ProseMirror blocks → Y.Doc checkpoint if no journal exists
2. **Active session** — Yjs authoritative. Agent writes + human edits mutate Y.Doc first, then refresh file projection
3. **External change** — Watcher classifies as external edit. If Y.Doc active, import as concurrent update. If inactive, disk stays authority
4. **Large/binary files** — Not tracked by default. `write` rejects binary or over-limit files unless explicit codec exists

Make it visually polished with proper spacing and hierarchy.
