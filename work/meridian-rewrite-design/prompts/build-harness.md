Build a static HTML page at `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/harness.html`.

Read these for patterns:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.css`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.js`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/index.html`

Standard HTML5, link shared.css, shared.js, CDN mermaid (`<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>`). Topbar nav (harness.html active). Theme toggle.

## Content: "Harness Architecture"

### Lede
v1 avoids rebuilding five native harness adapters. Two harness classes cover all providers:

### Two Harness Classes (table)
| Class | Examples | Write binding | Process model |
|---|---|---|---|
| **Claude Code native** | `claude -p --output-format stream-json` | MCP `write` + bash fallback | Subprocess, stdout stream parsing |
| **Unified API harness** | Anthropic API, OpenAI, Gemini, AI SDK | In-process `WriteService` | In-daemon, tool loop |

Note: Cursor, Pi, OpenCode, Codex native adapters are NOT v1 surface.

### Interfaces (code blocks with syntax highlighting)
```typescript
interface AgentHarness {
  id: "claude-code" | "api";
  launch(input: HarnessLaunchInput): Promise<HarnessRunHandle>;
}

interface HarnessRunHandle {
  spawnId: string;
  interrupt(message?: string): Promise<void>;
  inject(input: UserInjection): Promise<void>;
  stop(reason: string): Promise<void>;
  events(): AsyncIterable<HarnessEvent>;
}

interface HarnessEvent {
  seq?: number;
  spawnId: string;
  threadId: string;
  turnId?: string;
  eventType: string;
  harnessId: "claude-code" | "api";
  payload: unknown;
  rawText?: string;
  observedAt: string;
}
```

### Spawn Lifecycle (mermaid state diagram)
```
stateDiagram-v2
  [*] --> queued
  queued --> running
  queued --> cancelled
  queued --> timed_out
  running --> finalizing
  running --> failed
  running --> cancelled
  running --> timed_out
  finalizing --> succeeded
  finalizing --> failed
  finalizing --> cancelled
  finalizing --> timed_out
```

Note: Terminal state is monotonic. Completion report evidence wins over late cancel signals.

### Claude Code Native Launch Steps (ordered list)
1. Resolve launch bundle from mars
2. Assemble and freeze the thread system prompt
3. Create spawn/thread rows before process launch
4. Create narrowed capability and token
5. Inject environment, controlled PATH, MCP config, and deny rules
6. Spawn Claude Code under a platform process scope
7. Persist harness stream events before observing and fan-out
8. Observe terminal result, then finalize

### Just-Bash Model (3 cards in grid)
**Advisory mode** — Deny Edit/Write in settings, put `write` first on PATH, detect out-of-band changes as external edits.

**Strict CRDT mode** — OS sandbox with read-only source roots. Daemon write broker is the only writer. Writable dirs granted for temp/build.

**Capability elevation** — Commands that intentionally mutate outside CRDT (dep install, generated targets) need explicit grants, shown in UI/events.

### Workspace Resolution (new — simplified from Python 0.x)
Three-level resolution replaces the old 6-level cascade:
1. Explicit `--workspace` on spawn command
2. Work item's default workspace
3. Project root (fallback)

Daemon resolves at spawn creation, stores in spawn row, sets process cwd. No env propagation needed.

Make it polished and well-structured.
