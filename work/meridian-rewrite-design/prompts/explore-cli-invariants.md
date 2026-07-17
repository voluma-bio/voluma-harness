# Explore: meridian-cli invariants for rewrite

We are designing a full TS rewrite of meridian-cli. Your job: explore the
current Python codebase and extract every invariant, contract, and behavioral
guarantee that the rewrite must preserve or deliberately break.

**Task dir:** `/home/jimyao/gitrepos/meridian-cli`

**Do NOT change any code.** Read-only exploration. Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-cli.md`

## What to capture

### 1. Spawn model
- Spawn lifecycle states and transitions (start → running → completed/failed/etc.)
- SpawnRecord fields — what's persisted, what's derived
- Parent-child relationships, depth tracking
- How spawn IDs are generated
- The spawn coordination contract (how work items group spawns)

### 2. State & persistence
- All file formats under `~/.meridian/` and `.meridian/` — what each file is, its schema
- State.json structure for spawn records
- How session state is tracked
- History files, their growth patterns, what reads them
- Config file formats and precedence (CLI > ENV > YAML > project > user > default)

### 3. Environment contracts
- All `MERIDIAN_*` env vars and what they mean
- How env is propagated to child processes
- What harness-specific env vars exist
- The `MERIDIAN_DEPTH` contract

### 4. CLI command surface
- Every CLI command and subcommand (meridian spawn, work, session, mars, etc.)
- Their input/output contracts
- What external tools depend on (the commands Claude Code calls)

### 5. Harness integration contracts
- What each harness adapter assumes about the harness binary
- Session detection mechanisms per harness
- Event stream formats per harness
- What's documented vs undocumented (the fragility map covers this — reference it but also find anything it missed)

### 6. mars-agents integration
- How mars commands are invoked
- What filesystem layout mars expects/produces
- Config files (mars.toml, mars.lock) — their role
- The sync contract (what gets written where)

### 7. Cross-cutting
- Error handling patterns
- Logging/observability (what exists today)
- Platform abstractions (IS_WINDOWS, get_user_home, etc.)
- Process management (ScopedProcessHandle, detached processes, containment)
- The control socket protocol

## Output format

For each invariant, state:
- **What:** the invariant/contract
- **Where:** file paths and line numbers
- **Why it matters:** what breaks if the rewrite violates it
- **Carry/Break/Redesign:** should the rewrite preserve this exactly, can it break it, or should it redesign it?

Group by category. Be thorough — this is the compatibility surface of the rewrite.
