Build a static HTML page at `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/runtime.html`.

Read these for patterns:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.css`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/shared.js`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/site/index.html`

Standard HTML5, shared.css, shared.js, CDN mermaid. Topbar nav (runtime.html active). Theme toggle.

## Content: "Runtime & Security"

### Section 1: Capability Model

```typescript
interface SpawnCapability {
  own: PermissionSet;
  delegation: PermissionSet;
  max_depth: number;
}

interface PermissionSet {
  tools: ToolGrant[];
  files: FileGrant[];
  commands: CommandGrant[];
  network: NetworkGrant;
  env_grants: EnvGrant[];
  secret_grants: SecretGrant[];
  spawn: SpawnGrant;
  sandbox: SandboxGrant;
}
```

Invariant (callout box):
```
child.own        <= parent.delegation
child.delegation <= parent.delegation
child.max_depth  <= parent.max_depth - 1
```

### Section 2: Enforcement Points (table)
| Boundary | Enforcement |
|---|---|
| CLI → daemon | Capability token required. Daemon loads stored capability, ignores caller claims. |
| MCP/CLI `write` | Validate token, actor, file grant, command grant, sandbox mode before path resolution. |
| Spawn creation | Parent delegation checked before row reservation. Blocked = depth/capability error, no side effects. |
| Harness launch | Environment built from grants. Secrets and unknown MERIDIAN_* stripped. |
| Sandbox | OS strategy enforces file/command/network subset feasible on host. |
| Webapp | Local user trusted. Remote binding requires explicit auth + project grants. |

### Section 3: Sandbox Modes (table)
| Mode | Meaning |
|---|---|
| `read-only` | Source roots read-only via OS sandbox. Writes only through daemon `write` broker. |
| `workspace-write` | Approved workspace paths writable. CRDT tracked files still prefer `write`. |
| `danger-full-access` | No filesystem containment. Capability enforcement still applies to daemon APIs. |
| `none` | Uncontained local execution. Explicit & visible. For harnesses that can't be sandboxed. |

### Section 4: Secrets
Secrets are grants, not ambient env inheritance. Default child env strips `*_TOKEN`, `*_KEY`, `*_SECRET` unless explicitly granted.

### Section 5: Thread Model

Callout: "System prompts are immutable after thread creation. This preserves provider prompt-cache behavior."

Thread lifecycle (mermaid):
```
stateDiagram-v2
  [*] --> Created
  Created --> Running
  Running --> Stale: context drift
  Stale --> HotSwapped: new thread
  Running --> Closed: completed
  HotSwapped --> Closed
```

Thread creation steps (ordered list):
1. Resolve config and mars launch bundle
2. Resolve work/task/context roots
3. Assemble system prompt (agent body + skills + invariants + capability instructions + context summary)
4. Hash and store system_prompt_snapshot + context_snapshot_json
5. Freeze prompt for thread lifetime
6. Launch harness with thread IDs and capability context

Parent-child: MERIDIAN_CHAT_ID inherited across tree, MERIDIAN_SPAWN_ID per-spawn, MERIDIAN_DEPTH zero-based fail-closed.

### Section 6: Observability

Event families (4 cards):
- **Spawn lifecycle**: spawn.created, .running, .finalizing, .finalized, .cancel_requested
- **Harness events**: harness.event, .error, thread.created, .hot_swapped
- **Write events**: write.started, .completed, .failed, document.tracked, .projected, .external_change
- **Security events**: sandbox.violation, capability.denied, mars.command

OTel spans (code block):
```
meridian.cli.command
meridian.spawn.reserve / .launch
meridian.harness.turn / .tool_call
meridian.write / .agent_edit.core_write
meridian.yjs.journal_append
meridian.document.projection_refresh
meridian.mars.launch_bundle
meridian.sandbox.exec
```

### Section 7: Performance Targets (table)
| Operation | Target | Key choice |
|---|---|---|
| `write` CLI round trip | <50ms | Persistent daemon, HTTP, no Node cold start |
| Webapp TTI | <1s | Serve built assets, lazy-load editor, indexed SQLite |
| Spawn creation | <100ms | Resolve-before-persist, single DB txn, cached mars catalog |
| Spawn list (1000) | <10ms | Indexed query |
| Y.Doc open | <25ms hot | LRU live docs, checkpoints, compacted journals |

Make it polished. Use tabular-nums for the performance numbers.
