Build a static HTML page at `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/architecture.html`.

This is part of a multi-page design site. Read these files for patterns:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.css` — shared styles
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.js` — shared JS (theme + mermaid)
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/index.html` — example page structure

The page needs:
- Standard HTML5 skeleton with charset utf-8, viewport meta
- Link to `shared.css`, `shared.js`
- CDN script for mermaid: `<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>`
- Topbar with nav links to: index.html, architecture.html (active), write-seam.html, harness.html, data-model.html, runtime.html, integration.html
- Theme toggle button

## Content for this page: "System Architecture"

### Section 1: Product Surfaces
Three user-visible surfaces share one authority process:

| Surface | Caller | Primary job | Process boundary |
|---|---|---|---|
| CLI | Human, Claude Code, subagents, prompts | Start sessions, spawn/wait/cancel, work/session/context/mars commands, `write` command | CLI → daemon RPC |
| Subagent spawning | Recursive `meridian spawn` from agents | Create child threads with bounded capability | Parent → CLI → daemon → harness |
| Webapp | Human browser/mobile | Live editor, thread UI, spawn dashboard, event/tokens/cost views | Browser → HTTP/WS daemon |

### Section 2: System Architecture Diagram (mermaid)
```
flowchart LR
  Human --> CLI[meridian CLI]
  CC[Claude Code] --> CLI
  CC --> MCP[MCP write server]
  Sub[Subagent] --> CLI
  Browser --> WS[HTTP / WS]

  CLI --> Daemon[Local daemon]
  MCP --> Daemon
  WS --> Daemon

  Daemon --> SQLite[(SQLite WAL)]
  Daemon --> Yjs[Yjs doc authority]
  Daemon --> Harness[Harness supervisor]
  Harness --> CCN[Claude Code native]
  Harness --> API[Unified API agents]

  Daemon -.-> Cloud[Yjs peer sync]
```

### Section 3: Package Structure (pnpm workspace)

Table with two columns: Path and Role:
- `apps/cli` — CLI entrypoint, command parser, daemon RPC client
- `apps/daemon` — Authority process: HTTP/RPC/WS server, composition root
- `apps/web` — React/TanStack/Vite web UI, built and served by daemon
- `apps/mcp-write` — stdio MCP facade for Claude Code write tool
- `packages/core` — Spawn/session/thread/work domain services
- `packages/db` — Drizzle schema, migrations, repositories
- `packages/collab-local` — agent-edit port adapters, Y.Doc cache, file projection
- `packages/capabilities` — Write/read/search bindings, capability enforcement
- `packages/harness` — Claude Code native + unified API harness supervisor
- `packages/mars-bridge` — mars subprocess adapter, launch-bundle parser
- `packages/config` — Config precedence, env/CLI/YAML merge, root resolution
- `packages/platform` — Process trees, paths, sandbox strategy, OS abstractions
- `packages/observability` — Event sink, OTel spans, metrics, trace context

### Section 4: Dependency Direction (mermaid)
```
flowchart BT
  subgraph shared["Shared (from meridian-flow npm)"]
    agent-edit["@meridian/agent-edit"]
    contracts
    prosemirror-schema
    markup
  end

  subgraph packages["meridian v1 packages"]
    collab-local --> agent-edit
    capabilities --> collab-local
    core --> db & platform & observability
    harness --> core & capabilities
    mars-bridge --> config
  end

  subgraph apps["meridian v1 apps"]
    daemon --> core & db & collab-local & harness & observability
    cli --> core & config & mars-bridge
    mcp-write --> capabilities
    web --> contracts & capabilities
  end
```

Add a brief explanation paragraph: "Stable dependency direction: apps → packages → shared flow packages. Shared flow packages are library dependencies, not a forked app base."

### Section 5: Environment Contract
Show the core env vars that carry across spawn tree:
```
MERIDIAN_SPAWN_ID
MERIDIAN_PARENT_SPAWN_ID  
MERIDIAN_PROJECT_DIR
MERIDIAN_DEPTH
MERIDIAN_CHAT_ID
MERIDIAN_DAEMON_URL
MERIDIAN_CAPABILITY_TOKEN
MERIDIAN_WORKSPACE
MERIDIAN_ACTIVE_WORK_DIR
```

Make it visually clean, well-spaced. Use the mermaid diagrams (don't use ASCII art). Keep the topbar consistent with index.html.
