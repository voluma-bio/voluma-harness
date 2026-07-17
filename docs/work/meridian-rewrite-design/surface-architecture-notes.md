# Surface Architecture — Session Notes (not yet a design doc)

Decisions converged in design session c4904 (2026-07-14), not yet drafted into
`design/surface-architecture.md`. Captured here so reviewers can weigh them.
Status: **proposed, under adversarial review.**

## Two MCP modules, split by privilege and binding — not topic

| | Spawn module | Sync/query module |
|---|---|---|
| Verbs | spawn, send, cancel, escalate, report/accept completion | work items, session transcripts, status, context resolution, catalog reads |
| Binding | per-spawn stdio instance, wired by coordinator at launch | shared server, connect from anywhere |
| Identity | the channel IS the identity — capability caps clamp here | none beyond read access |
| Lifecycle | lives/dies with the worker | long-running |
| Consumers | only managed workers | any agent, any harness, even unmanaged |

The query module makes meridian's coordination state consumable by any harness
(Cursor session, CI agent, one-off script) without being a meridian-managed
process. Harness-agnosticism in both directions.

## Commitments

- **Both modules are thin surfaces over the same `lib/ops/`.** Three clients
  (CLI, spawn MCP, query MCP), one policy layer. Privilege difference = which
  verbs a surface exposes, never duplicated logic.
- **Sync is sugar on the spawn module's event stream**, not a third surface.
  `wait` = long-poll tool call; completion notifications ride the same pipe.
  Harness support for server-initiated MCP notifications is uneven → portable
  core is long-poll `wait`; notification is a per-bundle capability flag.
- **Tier resequencing**: tool-first, bash CLI as escape hatch, broker later,
  cells demoted to lifecycle.
- A human who hand-wires the spawn module into their own harness config is
  just a top-level caller with default caps. No special case.

## Config and mars in the layering

```
mars (compiler)      packages → resolved catalog artifact      [sync time]
state / data plane   catalog + config files (today) / DB rows (v1)
lib/ops              policy: resolution, precedence, clamping
surfaces             CLI · spawn MCP · query MCP               [runtime]
```

- **Mars is a compiler, not a runtime service.** Agents/config enter at sync
  time as compiled artifacts; surfaces read state at runtime.
- Query MCP gets read verbs: `list_agents`, `describe_agent`,
  `resolve_profile`, `effective_config` — thin over `lib/catalog/` +
  `lib/config/`.
- **Config writes stay off worker surfaces** (config files are the persistence
  attack surface per capability-caps). MCP surfaces are read-only over config;
  mutation stays on the CLI/human path.
- v1 pipeline is batch: mars package → publish → Voluma ingest →
  `agent_definitions`/`skills` rows (`source_package_id`/`source_version`).
  Server runtime reads rows, never resolves packages per-request.

## SDK question — split in two

1. **SDK for reading: publish a schema, not a library.** Durable contract =
   package format schema + normalized harness-neutral resolved-catalog
   artifact (lockfile-shaped JSON emitted by `mars sync`). Any language parses
   it; the Voluma ingest job consumes it.
2. **SDK for resolving (precedence/delegation/overrides): defer with a named
   trigger.** Trigger = first consumer needing live resolution outside
   meridian-cli's process (realistically the v1 server doing per-spawn config
   assembly). Then extract `mars-core` as a Rust library compiled to WASM
   (embeds in TS and Python, one implementation). Never reimplement precedence
   in TypeScript.

## Related monitor-framework decisions (session turns 45–52, drafted in
`../codebase-audit-rewrite/design/monitor-framework.md`)

- Three execution modes, one contract: sync hook (ms, in tool-call path),
  parallel observer (tails journal), checkpoint verifier (turn boundaries).
  Verdict vocabulary: allow/annotate/warn/pause/block/kill/escalate.
- **Async monitors actuate through the broker**: flagged spawn → token
  issuance pauses → agent freezes at next model call. Stops the trajectory,
  not the single tool call.
- Reviewer-as-thread: a monitor is just another thread subscribed to the
  monitored thread's journal, turn as review quantum, one-turn bounded lag,
  tiered cost (cheap scorer → escalate to deep review).
- Placement rule: irreversible actions get sync hooks; everything else async.
