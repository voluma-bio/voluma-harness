# Architect: meridian-cli v1 rewrite architecture

Synthesize all collected invariants and design decisions into a comprehensive,
buildable architecture document for the meridian-cli TS rewrite.

## Context

meridian-cli is a Python multi-agent coordination CLI. It's being rewritten in
TypeScript as a local-first coding-agent product with CRDT collaborative
editing as the core differentiator. This is NOT a fork of meridian-flow (a
sibling TS collaborative writing app) — it's a rewrite that shares flow's
packages (`@meridian/agent-edit`, `@meridian/contracts`, etc.) as library
dependencies.

**The current Python CLI (0.x) is as mature as the hacky-CLI-over-stdout
approach gets.** It proved spawn coordination, work items, mars-agents
packaging, and multi-harness support. v1 is the clean TS rewrite.

## Input files (READ ALL OF THESE)

All in `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/`:

1. **`architecture.md`** — the living design doc with product definition, system
   architecture sketch, CRDT write seam, unified harness, capability model,
   database, observability, performance, mars integration, and open questions.
   START HERE — this is the current best statement of the design.

2. **`invariants-cli.md`** (650 lines) — spawn model, state formats, env
   contracts, CLI command surface, harness contracts, cross-cutting concerns
   from the current Python codebase.

3. **`invariants-flow-packages.md`** (589 lines) — public API surfaces of the
   shared packages: agent-edit (CRDT engine), contracts, prosemirror-schema,
   markup codecs. Port interfaces the rewrite must implement.

4. **`invariants-flow-collab.md`** (282 lines) — server-side CRDT
   implementation: Hocuspocus adapters, Drizzle journal, thread model, context
   ports. What the rewrite needs to reimplement for local/SQLite.

5. **`invariants-mars.md`** (548 lines) — mars-agents (Rust) integration
   contract: filesystem layout, package format, sync, CLI integration.

6. **`invariants-prompts.md`** (245 lines) — prompt package references to
   meridian CLI commands, env vars, behavioral assumptions.

Also read the prior design session's key artifacts:
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/codebase-audit-rewrite/design/crdt-write-seam.md` — validated CRDT seam design
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/codebase-audit-rewrite/design/local-first-architecture.md` — the earlier converged architecture (now superseded by the rewrite approach, but has good detail)

## Key design decisions already made

- **TS rewrite**, not Python evolution. To share code with flow's packages.
- **Three surfaces, one process:** CLI (Claude Code calls in), subagent spawning
  (recursive meridian-cli), webapp (local, tailscale-hostable).
- **CRDT write is the differentiator.** `@meridian/agent-edit` as a library dep.
  MCP tool for Claude Code primary, bash CLI for subagents, in-process for
  webapp embedded agents.
- **Claude Code stays native** (subscription auth, TUI). Everything else
  unifies under one API harness.
- **SQLite** (Drizzle ORM) replaces files-as-state.
- **Capability model** (D8: `{ own, delegation, max_depth }`) built from day one.
- **Thread cache invariant:** system prompt freezes at thread creation; context
  flows through tool results and injections; hot-swap to new thread when stale.
- **mars-agents stays Rust**, integration is filesystem contract.
- **Optional Yjs peer sync** to meridian-flow cloud.

## Your job

Produce a single comprehensive architecture document that a tech lead can
decompose into implementation work. Write it to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/v1-architecture.md`

### Structure

1. **Executive summary** — what this is, why it exists, the differentiator
2. **Product surfaces** — CLI, subagent, webapp. How they relate.
3. **System architecture** — component diagram, package structure, dependency
   graph. What's shared from flow, what's new.
4. **CRDT write seam** — the three bindings (MCP, CLI, in-process), how they
   hit the same authority. The write command schema. Output format.
5. **Harness architecture** — Claude Code native vs unified API harness.
   How spawns work. The just-bash model for subagent writes.
6. **Data model** — SQLite schema (spawns, threads, documents, journal,
   sessions, events). Replaces the current files-as-state.
7. **Capability & security** — the SpawnCapability model, enforcement,
   sandbox modes, secret grants.
8. **Thread model** — lifecycle, the cache invariant (frozen system prompt,
   hot-swap), how threads map to Yjs docs, parent-child relationships.
9. **Observability** — OTel spans, structured events, the webapp as dashboard.
10. **mars-agents integration** — what stays, what simplifies with unified harness.
11. **Performance** — targets, design decisions, what dies from the old architecture.
12. **Cloud sync** — optional Yjs peer sync to meridian-flow.
13. **Invariant registry** — the hard contracts from the invariant files that the
    rewrite MUST preserve (CLI command surface Claude Code depends on, env vars,
    spawn lifecycle states, mars filesystem contract).
14. **What we deliberately break** — things from the 0.x architecture that we
    drop or redesign (files-as-state, 5 harness adapters, PTY hacking,
    stdout scraping, etc.)
15. **Open questions** — unresolved decisions that need answers before or during
    implementation.

### Principles

- **Be concrete.** Show types, schemas, API shapes. Not "we'll have a database" but
  the actual table definitions.
- **Show the boundaries.** What's a package, what's an app, what crosses process
  boundaries, what's in-process.
- **Carry vs break vs redesign.** For each invariant area, explicitly state what
  the rewrite preserves, what it drops, and what it redesigns.
- **Dependency direction.** Everything depends toward stability. Show which
  components are stable (shared packages) vs volatile (app layer).
