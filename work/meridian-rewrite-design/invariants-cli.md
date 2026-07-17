# meridian-cli Invariants for TypeScript Rewrite

> **Note:** Target path `~/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-cli.md` was not writable from this sandbox. Copy this file there manually.

Exploration of `/home/jimyao/gitrepos/meridian-cli` (read-only). Each entry states the contract as implemented today, with rewrite guidance.

**Legend — Carry/Break/Redesign:**
- **Carry** — external/agent-facing contract; breaking it breaks spawns, agents, or on-disk state
- **Break** — root AGENTS.md explicitly allows schema changes (`No real users, no backwards compatibility`)
- **Redesign** — behavior should exist but implementation can change

**Doc contradictions flagged inline** where AGENTS.md / `.context/` disagrees with code.

---

## 1. Spawn Model

### 1.1 Lifecycle states and transitions

| **What** | Seven statuses: `queued`, `running`, `finalizing`, `succeeded`, `failed`, `cancelled`, `timed_out`. Active = first three. Terminal = last four. |
| **Where** | `src/meridian/lib/core/domain.py:14-16`, `src/meridian/lib/core/spawn_lifecycle.py:53-66` |
| **Why it matters** | CLI output, `spawn wait`, dashboards, Pi quiescence, and agent prompts all key off these strings. |
| **Carry/Break/Redesign** | **Carry** status vocabulary; **Redesign** internal transition machinery |

**Allowed transitions** (`spawn_lifecycle.py:62-66`):
```
queued   → running | succeeded | failed | cancelled | timed_out
running  → finalizing | succeeded | failed | cancelled | timed_out
finalizing → succeeded | failed | cancelled | timed_out
```

**Lifecycle service API** (`lifecycle.py:39-47`, `lifecycle.py:239-640`):
- `start()` / `reserve()` → persist row; optional `spawn.created` event
- `mark_running()` → `spawn.running`
- `record_exited()` → sets exit code fields; **no lifecycle event**
- `mark_finalizing()` → CAS `running→finalizing`; **no lifecycle event**
- `finalize()` / `cancel()` → terminal + `spawn.finalized` hook dispatch

**Durable completion precedence** (`spawn_lifecycle.py:256-316`): report text classified as completion evidence wins over late cancel signals.

### 1.2 SpawnRecord vs on-disk schema

| **What** | `SpawnRecord` is the in-memory projection. On disk, `StoredSpawnState` (v2) in `state.json` excludes prompt body; prompt lives in `starting-prompt.md`. |
| **Where** | `src/meridian/lib/state/spawn/model.py:48-100`, `repository.py:27-86` |
| **Why it matters** | Tools reading raw `state.json` won't see prompts; must use `read_state()`. |
| **Carry/Break/Redesign** | **Carry** split prompt file if external tools depend on paths; **Break** v2 field set per root AGENTS.md |

**Persisted fields** (both models): id, chat_id, owner_chat_id, parent_id, originating_bash_id, model, agent, agent_path, skills, skill_paths, harness, kind, desc, work_id, goal, display_label, harness_session_id, control_root, task_cwd, execution_cwd, claude_config_dir, launch_mode, worker_pid, runner_pid, runner_created_at_epoch, status, started_at, last_attempt_*, runner_exit_*, cancel_intent, finished_at, exit_code, duration_secs, token/cost fields, error, terminal_origin, launch_policy_snapshot. On disk only: `v: 2`, `revision`, `prompt_length`.

**Derived / not in state.json**: full `prompt` text (from `starting-prompt.md`), some display labels.

### 1.3 Parent-child relationships and depth

| **What** | `parent_id` on `SpawnRecord` links child spawns. `MERIDIAN_PARENT_SPAWN_ID` set in child env. `MERIDIAN_DEPTH` is zero-based delegation depth (primary = 0). Child depth = parent + 1 when `increment_depth=True`. |
| **Where** | `resolved_context.py:202-230`, `depth.py:11-86` |
| **Why it matters** | `spawn children`, subtree cancel (`cancel-all`), depth guard, reaper gating. |
| **Carry/Break/Redesign** | **Carry** depth semantics and parent env propagation |

| **What** | `max_depth_reached(current, max)` blocks new spawns when `current >= max`. Default from `defaults.max_depth` in meridian.toml. |
| **Where** | `depth.py:82-86`, `docs/configuration.md:112`, `lib/ops/spawn/api.py` (per AGENTS.md) |
| **Why it matters** | Agents hitting depth ceiling get `depth_exceeded_output()` instead of a spawn. |
| **Carry/Break/Redesign** | **Carry** |

| **What** | `MERIDIAN_CHAT_ID` inherited across spawn tree (top-level session). Distinct from per-spawn `MERIDIAN_SPAWN_ID`. |
| **Where** | `resolved_context.py:94-100`, `docs/commands.md:113-117` |
| **Why it matters** | Session log defaults, cancel-all scoping, work attachment. |
| **Carry/Break/Redesign** | **Carry** |

### 1.4 Spawn ID generation

| **What** | Format `p{N}` where N is monotonic int. `reserve_spawn_id()` increments `spawn-id-counter` under `spawns_flock`. Seeds from existing `spawns/*/state.json` dirs if counter missing. |
| **Where** | `spawn_store.py:71-136` |
| **Why it matters** | Agent references (`p123`), extension APIs, telemetry filenames, Pi child tracking. |
| **Carry/Break/Redesign** | **Carry** ID shape and monotonicity; **Break** counter file layout |

| **What** | Session/chat IDs: `c{N}` from `session-id-counter`. |
| **Where** | `session_store.py`, `state/.context/CONTEXT.md:115-116` |
| **Why it matters** | `--continue c123`, `--fork`, session search. |
| **Carry/Break/Redesign** | **Carry** |

### 1.5 Work item coordination

| **What** | Work precedence for spawn attachment: (1) `--work` explicit, (2) ambient session work, (3) `--from` inheritance. |
| **Where** | `docs/commands.md:66-74`, `work_attachment.py:36-57` |
| **Why it matters** | Multi-agent workflows; wrong precedence attaches spawns to wrong scratch dirs. |
| **Carry/Break/Redesign** | **Carry** |

| **What** | Work items are directory-authoritative under `[context.work]` root: `work/<slug>/__status.json` (active), `archive/work/<slug>/` (done). Not in project repo by default. |
| **Where** | `work_store.py:1-8`, `state/AGENTS.md:30-34` |
| **Why it matters** | `MERIDIAN_ACTIVE_WORK_DIR`, artifact placement, `meridian work path`. |
| **Carry/Break/Redesign** | **Carry** directory existence = work item; **Break** `__status.json` schema |

**Contradiction:** `state/.context/CONTEXT.md:13-14` still lists legacy `.meridian/work-items/<slug>.json`. Code and `work_store.py` use context-resolved directories only — doc is stale.

### 1.6 Terminal write authority

| **What** | `decide_terminal_write()`: runner/launcher/cancel origins supersede reconciler on same spawn. Owner writes use terminal monotonicity guard. |
| **Where** | `terminal_policy.py:23-46`, `state/AGENTS.md:46-55` |
| **Why it matters** | Reaper vs runner races; duplicate finalization. |
| **Carry/Break/Redesign** | **Carry** authority lattice |

### 1.7 Lifecycle events and hooks

| **What** | `LifecycleEvent.event_id` = UUID v5 over `(spawn_id, event_type, sequence)`. Hooks run post-write; exceptions logged, never block. |
| **Where** | `lifecycle.py:117-134`, `lifecycle.py:775-802` |
| **Why it matters** | Hook idempotency, `spawn.finalized` automations (git-autosync, etc.). |
| **Carry/Break/Redesign** | **Carry** hook timing; **Redesign** event ID scheme if hooks rewritten |

---

## 2. State & Persistence

### 2.1 Dual-root layout

| **What** | **Repo-local** `.meridian/`: committed `id`, `.gitignore`, optional `kb/` fallback. **User runtime** `~/.meridian/projects/<project-id>/` (Windows: `%LOCALAPPDATA%\meridian\`): sessions, spawns, telemetry. |
| **Where** | `state/AGENTS.md:10-28`, `user_paths.py:14-40`, `docs/configuration.md:52-98` |
| **Why it matters** | Repo moves don't orphan history; CI read paths must not create UUID. |
| **Carry/Break/Redesign** | **Carry** UUID-keyed runtime root; **Break** three-word ID format |

### 2.2 Per-spawn artifact directory

```
spawns/<p-id>/
  state.json          # v2 authoritative state
  state.lock          # external writer lock
  starting-prompt.md  # prompt body (not in state.json)
  history.jsonl       # seq-enveloped harness events (primary output)
  heartbeat           # 30s touch; reaper liveness
  report.md           # completion report
  stderr.log
  params.json
  tokens.json
  inbound.jsonl       # injected messages
  control.sock        # POSIX control endpoint
  control.sock.port   # Windows TCP port file
  failure.json        # terminal failure sentinel
  debug.jsonl         # optional wire trace
  output.jsonl        # guardrail output
  primary_meta.json   # managed-primary metadata
  scope.json          # spawn-scope task_dir override
```

| **Where** | `state/.context/CONTEXT.md:22-35`, `launch/constants.py:7-14` |
| **Why it matters** | Harness extractors, session log providers, doctor prune, agent `spawn show`. |
| **Carry/Break/Redesign** | **Carry** paths agents/docs reference; **Break** optional artifacts |

### 2.3 state.json schema (v2)

| **What** | `StoredSpawnState` with `v: 2`, monotonic `revision`, all spawn fields except prompt body. |
| **Where** | `repository.py:27-86` |
| **Why it matters** | Any reader of existing installations must validate with same schema. |
| **Carry/Break/Redesign** | **Break** per project policy; document migration if changed |

### 2.4 history.jsonl envelope

| **What** | Each line: JSON with `seq`, `byte_offset`, `turn_id`, `item_id`, `request_id`, `interrupt_epoch`, `stale_after_interrupt`, `event_type`, `harness_id`, `payload`, `raw_text`. Append-only; binary mode for stable offsets. |
| **Where** | `history.py:56-73`, `atomic.py` (per state/AGENTS.md) |
| **Why it matters** | Session transcript providers, managed-primary causal tracking, crash recovery truncates partial tail line. |
| **Carry/Break/Redesign** | **Carry** envelope fields consumed by transcript layer; **Redesign** storage format |

### 2.5 Session state (event-sourced)

| **What** | `sessions.jsonl` append-only: `start`, `stop`, `update` events → materialized `SessionRecord`. Per-chat lease files under `sessions/`. Chat history at `chats/<c-id>/history.jsonl`. |
| **Where** | `session_store.py:21-94`, `paths.py:56-70` |
| **Why it matters** | `--continue`, session repair, active work ID on session. |
| **Carry/Break/Redesign** | **Carry** event types; **Redesign** JSONL → per-file like spawns (not planned today) |

### 2.6 Atomic write contract

| **What** | All state writes: temp in same dir → fsync → `os.replace()`. JSONL via `append_text_line()` in binary mode (no CRLF translation). |
| **Where** | `state/AGENTS.md:57-68` |
| **Why it matters** | Crash-only recovery; partial writes fail Pydantic validation. |
| **Carry/Break/Redesign** | **Carry** crash-safety semantics; **Redesign** implementation language |

### 2.7 Read vs write root resolvers

| **What** | `resolve_project_runtime_root()` — read-only, no UUID creation. `resolve_project_runtime_root_for_write()` — may create `.meridian/id`. |
| **Where** | `state/AGENTS.md:71-80` |
| **Why it matters** | CI/`spawn list` on clean checkouts must not side-effect init. |
| **Carry/Break/Redesign** | **Carry** |

### 2.8 Reaper (orphan reconciliation)

| **What** | Runs on read paths only when `is_root_side_effect_process()` (depth absent/0, valid). Heartbeat stale after 120s. Managed-primary has separate strategy. |
| **Where** | `reaper.py:38-48`, `depth.py:69-79`, `state/AGENTS.md:82-93` |
| **Why it matters** | `spawn show` after crash converges status; nested agents must not reap siblings. |
| **Carry/Break/Redesign** | **Carry** depth gating; **Redesign** timing thresholds |

### 2.9 Config file formats and precedence

**Meridian config** (`meridian.toml`, `meridian.local.toml`, `~/.meridian/config.toml`):
```
defaults < user < project < local < ENV
```
| **Where** | `config/AGENTS.md:35-41`, `docs/configuration.md:145-153` |

**Per-spawn runtime overrides** (7-tier, per-field first-non-None):
```
CLI flags > ENV (MERIDIAN_MODEL, etc.) > matched model-policy > agent overlay >
agent profile > MeridianConfig defaults > model alias defaults
```
| **Where** | `docs/configuration.md:319-328`, `core/overrides.py`, `core/AGENTS.md:19` |

**Mars config** (separate surface): `mars.toml`, `mars.local.toml` — packages, targets, model aliases, `[agents.<name>]` overlays, routing defaults.

| **What** | `RuntimeOverrides`: `None` = unset; empty string at high layer wins over lower (never use `""` as default). |
| **Where** | `core/AGENTS.md:19`, `overrides.py` |
| **Why it matters** | Silent config bugs if TS rewrite uses falsy defaults. |
| **Carry/Break/Redesign** | **Carry** merge semantics |

**Hooks config precedence:** `builtin < context < user < project < local` (`docs/configuration.md:498`).

### 2.10 Legacy / unused paths

| **What** | Global `spawns.jsonl` exists in `RuntimePaths` but unused (v2 per-spawn files). Legacy telemetry at `~/.meridian/telemetry/` read-only. |
| **Where** | `state/AGENTS.md:36-42`, `docs/commands.md:316-320` |
| **Why it matters** | Migration tooling, `--global` telemetry queries. |
| **Carry/Break/Redesign** | **Break** remove after migration; **Carry** read compatibility during transition |

---

## 3. Environment Contracts

### 3.1 Core MERIDIAN_* variables (child propagation allowlist)

| Variable | Role |
|----------|------|
| `MERIDIAN_SPAWN_ID` | Current run ID; managed-session detector |
| `MERIDIAN_PARENT_SPAWN_ID` | Parent spawn for nested runs |
| `MERIDIAN_PROJECT_DIR` | Project/control root (inherited) |
| `MERIDIAN_DEPTH` | Delegation depth string |
| `MERIDIAN_CHAT_ID` | Top-level chat/session tree |
| `MERIDIAN_ACTIVE_WORK_ID` | Attached work slug |
| `MERIDIAN_ACTIVE_WORK_DIR` | Active scope directory |
| `MERIDIAN_TASK_DIR` | Inherited source-edit directory |
| `MERIDIAN_CONTEXT_<NAME>_DIR` | Dynamic context dirs (regex-validated) |

| **Where** | `child_env.py:12-41`, `resolved_context.py:202-230` |
| **Why it matters** | Only these (+ context dirs) may be set via `child_env_overrides()`; unknown `MERIDIAN_*` raises. |
| **Carry/Break/Redesign** | **Carry** for agent subprocess contracts |

### 3.2 Bind-time / non-inherited exports

| Variable | Role |
|----------|------|
| `MERIDIAN_PROJECT_ROOT` | Bind-time project root export |
| `MERIDIAN_TASK_CWD` | Bind-time task cwd alias (not inherited) |

| **Where** | `docs/configuration.md:694-696` |

### 3.3 Blocked from child inheritance

| **What** | `MERIDIAN_ACTIVE_WORK_ID`, `MERIDIAN_ACTIVE_WORK_DIR`, `MERIDIAN_RUNTIME_DIR` stripped/blocked — child scope comes from launch bind, not parent env. |
| **Where** | `launch/constants.py:24-32`, `launch/env.py` |
| **Carry/Break/Redesign** | **Carry** |

### 3.4 Runtime policy overrides (ENV)

`MERIDIAN_MODEL`, `MERIDIAN_AGENT`, `MERIDIAN_EFFORT`, `MERIDIAN_APPROVAL`, `MERIDIAN_SANDBOX`, `MERIDIAN_AUTOCOMPACT`, `MERIDIAN_AUTOCOMPACT_PCT`, `MERIDIAN_TIMEOUT` — per `overrides.py:107-117`.

Config overrides: `MERIDIAN_MAX_DEPTH`, `MERIDIAN_MAX_RETRIES`, `MERIDIAN_RETRY_BACKOFF_SECONDS`, `MERIDIAN_KILL_GRACE_MINUTES`, `MERIDIAN_GUARDRAIL_TIMEOUT_MINUTES`, `MERIDIAN_WAIT_TIMEOUT_MINUTES`, harness model envs, `MERIDIAN_STATE_RETENTION_DAYS` (`docs/configuration.md:699-741`).

### 3.5 State / home overrides

| Variable | Role |
|----------|------|
| `MERIDIAN_HOME` | User state root (~/.meridian or %LOCALAPPDATA%\meridian) |
| `MERIDIAN_CONFIG` | User config path override |
| `MERIDIAN_RUNTIME_DIR` | Runtime root override (relative → repo-relative) |
| `MERIDIAN_FS_DIR` | Resolved shared FS path |
| `MERIDIAN_PROJECT_DIR` | Inherited control root |

### 3.6 Guardrails & secrets

`MERIDIAN_GUARDRAIL_*`, `MERIDIAN_SECRET_<KEY>` (`docs/configuration.md:743-750`).

### 3.7 Operational flags

| Variable | Role |
|----------|------|
| `MERIDIAN_MANAGED` | Default `1` on CLI; Mars suppresses native agent emission |
| `MERIDIAN_HOOKS_ENABLED` | `false` disables lifecycle hook dispatch |
| `MERIDIAN_PI_BINARY` | Pi harness binary override |

### 3.8 Child env sanitization

| **What** | Pass-through allowlist: `PATH`, `HOME`, `USER`, `SHELL`, `LANG`, `TERM`, `TMPDIR`, `PYTHONPATH`, `VIRTUAL_ENV`, `LC_*`, `XDG_*`, `UV_*`. Secrets (`*_TOKEN`, `*_KEY`, `*_SECRET`) stripped unless explicitly passed through. |
| **Where** | `launch/env.py:16-44`, `68-80` |
| **Carry/Break/Redesign** | **Carry** security boundary |

### 3.9 Harness-specific env (selected)

| Harness | Env vars |
|---------|----------|
| Pi | `PI_CODING_AGENT_SESSION_DIR` (session isolation) |
| OpenCode | `OPENCODE_CONFIG_CONTENT` (workspace merge, deep-merge with parent) |
| Claude | config dir via spawn record fields |

| **Where** | `launch/env.py:31`, `harness/.context/CONTEXT.md:294-298` |

### 3.10 MERIDIAN_DEPTH contract

| **What** | Absent/empty → 0. Malformed non-empty → parse fails; `is_root_side_effect_process()` returns **false** (fail-closed for reaper). `is_managed_meridian_session()` keys on `MERIDIAN_SPAWN_ID`, not `MERIDIAN_MANAGED`. |
| **Where** | `depth.py:11-79`, `core/AGENTS.md:21` |
| **Why it matters** | Primary stays depth 0; broken depth must not run root cleanup inside agents. |
| **Carry/Break/Redesign** | **Carry** |

---

## 4. CLI Command Surface

### 4.1 Architecture

| **What** | Descriptor-driven startup: `COMMAND_CATALOG` in `startup/catalog.py` classifies argv before heavy imports. Lazy command registration by bucket. |
| **Where** | `cli/AGENTS.md:7-36` |
| **Carry/Break/Redesign** | **Redesign** internal; **Carry** command paths and outputs |

### 4.2 Top-level command groups

From `command_groups.py` / `catalog.py` (authoritative list):

| Group | Subcommands / notes |
|-------|---------------------|
| *(default)* | Primary launch (`meridian`), `--continue`, `--fork`, `--fork-fresh`, `--from`, `--task-dir` |
| `spawn` | create (default), continue, list, show, status, wait, cancel, cancel-all, inject, children, subagents, files, stats, report show/search |
| `session` | log, export, search, repair |
| `work` | dashboard, list, show, sessions, current, path, root, start, switch, done, reopen, update, delete, rename, clear, task-dir |
| `config` | show, get, set, init, reset |
| `context` | show paths (`context`, `context work`, etc.) |
| `doctor` | health + `--prune`, `--global`, `--kill-orphans` |
| `mars` | passthrough to bundled `mars` binary |
| `models` | `list` redirects → `mars models list` |
| `ext` | list, show, commands, run |
| `hooks` | list, check, run |
| `task-dir` | query, set, clear (spawn-scope; distinct from `work task-dir`) |
| `sync` | conflict list/show/resolve |
| `workspace` | list, init |
| `kg` | graph, check |
| `mermaid` | check |
| `qi` | graph, list, check, claude-md-fix |
| `telemetry` | tail, query, status |
| `streaming` | serve, test |
| `test` | harness |
| `serve` | MCP stdio server |
| `init`, `bootstrap`, `migrate`, `completion` | setup / shell completion |

### 4.3 Agent-critical commands (Claude Code / prompts)

Documented as agent root commands (`command_groups.py:315-317`):
- `meridian spawn` — delegation loop (`--prompt-file`, `--bg`, `wait`)
- `meridian session` — transcript recovery
- `meridian work` — work item coordination
- `meridian context` — artifact paths
- `meridian mars` — models/agents/skills inventory
- `meridian doctor` — stuck spawn recovery
- `meridian ext` — extension commands

### 4.4 Spawn output contracts

| Mode | Behavior |
|------|----------|
| Default foreground/wait | Status line + report body + `Transcript: meridian session log <id>` |
| `--metadata` | Adds model, cost, tokens, duration, paths |
| `--no-report` | Suppress report body |
| `--format json` | Structured JSON |
| `--bg` | Spawn ID + wait instructions |

| **Where** | `docs/commands.md:76-107` |
| **Carry/Break/Redesign** | **Carry** for agent parsers |

### 4.5 Spawn reference aliases

`@latest`, `@last-failed`, `@last-completed`; refs `p123`, `c123`, raw harness session id (`docs/commands.md:388-395`).

### 4.6 Invocation classes (bootstrap side effects)

| Class | Examples | Creates state? |
|-------|----------|----------------|
| READ_ROOTLESS | doctor, qi, config show | No |
| READ_RUNTIME | spawn list, session log | No (but may reap) |
| WRITE_RUNTIME | spawn create, work start | Yes |
| PRIMARY_LAUNCH | bare `meridian` | Yes + optional auto-init |

| **Where** | `cli/AGENTS.md:47-58` |

### 4.7 Fork/from/continue CLI policy

| **What** | `validate_fork_mode()` is sole conflict checker. `--fork` identity-locked (rejects `-m`, `-a`, `--skills`). `--fork-fresh` allows changes. `--from` reference-only (no transcript fork). |
| **Where** | `cli/AGENTS.md:64-65`, `docs/commands.md:56-64` |
| **Carry/Break/Redesign** | **Carry** agent-facing semantics |

---

## 5. Harness Integration Contracts

> **Fragility map:** No file named `fragility*` in repo. Closest authoritative source: `src/meridian/lib/harness/.context/CONTEXT.md` + `docs/harness-integration.md`. Items below include undocumented brittleness called out there.

### 5.1 Translation pipeline (all harnesses)

```
SpawnParams → resolve_launch_spec() → HarnessLaunchSpec → project_*_spec_to_cli_args() → subprocess | connection
```

| **What** | `SpawnParams` field accounting enforced at import: every field in `consumed_fields` or `explicitly_ignored_fields` per adapter or startup `ImportError`. |
| **Where** | `harness/AGENTS.md:26-30`, `harness/.context/CONTEXT.md:114-117` |
| **Carry/Break/Redesign** | **Redesign** internal; **Carry** adapter registration pattern |

### 5.2 Per-harness launch commands

| Harness | Subprocess | Connection |
|---------|------------|------------|
| Claude | `claude -p --output-format stream-json --verbose -` | stdin/stdout NDJSON |
| Codex | `codex exec --json` | `codex app-server` WebSocket JSON-RPC |
| OpenCode | `opencode run` | `opencode serve` HTTP+SSE |
| Cursor | `cursor agent ...` (subprocess only) | — |
| Pi | `pi --mode rpc` | same (RPC stdio) |

| **Where** | `harness/AGENTS.md:41-54`, `launch/constants.py:34-68` |

### 5.3 Terminal event classification (fragile)

| Harness | Parent terminal signal | Notes |
|---------|------------------------|-------|
| Claude | `result` !is_error | Child events persisted but don't complete parent |
| Codex | `turn/completed` on main `threadId` | Unscoped `turn/completed` still counts (legacy) |
| OpenCode | parent `session.idle` / `session.error` | No unscoped fallback once parent known |
| Cursor | stdout EOF + exit 0 | No explicit success event |
| Pi | `agent_end` + quiescence coordinator | Process does not exit on completion |

| **Where** | `harness/.context/CONTEXT.md:201-234` |
| **Why it matters** | Wrong mapping → hung spawns or premature completion. |
| **Carry/Break/Redesign** | **Carry** per-harness semantics; **Redesign** with integration tests |

### 5.4 Session ID observation (once post-execution, primary)

Priority: connection session ID → artifact extraction → known ID → filesystem scan. Claude adds TUI trampoline reconciliation (`harness/.context/CONTEXT.md:149-177`).

### 5.5 Claude-specific fragility

- PTY required for primary session ID on POSIX (`harness/.context/CONTEXT.md:238-244`)
- Built-in agents always denied; generic `Agent` gated by Mars `agent_copy` + `.claude` target
- `--append-system-prompt-file` required for large skill bodies (ARG_MAX)
- `--add-dir` loads foreign skills from workspace roots (undocumented Claude behavior, `docs/configuration.md:435-449`)

### 5.6 Pi-specific fragility

- Completion = quiescence (disk-backed), not process exit
- Disk authority: `spawns/<child>/state.json`, `pi-bash/<parent>/bash-records.json`, `last-notification.json`
- Extensions built to `~/.meridian/pi/extensions/`; toggles via `[harness.pi]` in meridian.toml
- Stdout lifecycle messages are diagnostic only

| **Where** | `harness/.context/CONTEXT.md:53-98`, `streaming/.context/CONTEXT.md:170-273` |

### 5.7 Drain loop ordering (streaming)

| **What** | Per event: **persist** (`history.jsonl`) → **observe** → **fan-out** (subscriber queue). 10 consecutive write failures → failed outcome. |
| **Where** | `streaming/AGENTS.md:45-53`, `streaming/.context/CONTEXT.md:47-57` |
| **Carry/Break/Redesign** | **Carry** ordering guarantee |

### 5.8 Launch composition invariants

| Code | Rule |
|------|------|
| I-1 | All composition in `build_launch_context()` / prepare+bind pipeline |
| I-4 | `observe_session_id()` exactly once (primary) |
| I-10 | Fork materialization only after spawn row exists |
| I-13 | Warnings only via `LaunchContext.warnings` |

| **Where** | `launch/AGENTS.md:56-66` |

### 5.9 Resolve-before-persist split

| Path | Behavior |
|------|----------|
| REST / streaming-serve | `prepare_spawn()` — no row on resolution failure |
| Spawn subprocess | Row created before `build_launch_context()` (known gap) |

| **Where** | `ops/AGENTS.md:81-86` |
| **Carry/Break/Redesign** | **Redesign** unify spawn subprocess path |

---

## 6. mars-agents Integration

### 6.1 Invocation

| **What** | `meridian mars <args>` passthrough via `mars_passthrough.py`. Resolves `mars` binary adjacent to Python install (`resolve_mars_executable()`), else PATH. Injects `--root <MERIDIAN_PROJECT_DIR>` when unset. Sets `MERIDIAN_MANAGED=1` on child env. |
| **Where** | `mars_passthrough.py:72-134`, `lib/ops/mars.py:31-43` |
| **Carry/Break/Redesign** | **Carry** passthrough contract; **Redesign** embed mars as library |

### 6.2 Config files

| File | Role |
|------|------|
| `mars.toml` | Package deps, `[settings].targets`, `default_model`, `default_harness`, `[models.*]`, `[agents.*]` overlays |
| `mars.local.toml` | Local Mars overrides (win over project) |
| `mars.lock` | Lockfile (CI/release; managed by mars, not meridian-cli directly) |

| **Where** | `docs/configuration.md:5-17`, `docs/commands.md:338-343` |

### 6.3 Filesystem layout (sync output)

| Path | Content |
|------|---------|
| `.mars/agents/` | Compiled agent profiles (Meridian reads here) |
| `.mars/skills/` | Canonical skill content |
| `.mars/models-merged.json` | Model alias catalog |
| `.claude/`, `.codex/`, `.opencode/`, `.pi/`, `.cursor/` | Mars materialization targets (generated; do not hand-edit) |

| **Where** | `docs/configuration.md:56-67`, `AGENTS.md:16-18` |

### 6.4 Sync contract

| **What** | `meridian mars sync` compiles packages into `.mars/` and links targets per `settings.targets`. `meridian init --add` runs mars init if needed, installs sources, links targets, applies `primary.agent` from package metadata. |
| **Where** | `docs/commands.md:345-357` |
| **Carry/Break/Redesign** | **Carry** if mars remains separate binary; **Redesign** if TS bundles mars |

### 6.5 Managed mode & agent copy

| **What** | `MERIDIAN_MANAGED=1` suppresses native agent copies to harness dirs. `[settings.meridian.agent_copy].harnesses` selectively re-enables (e.g. Claude). `[settings.meridian.fanout].agents` allowlists fan-out native copies. |
| **Where** | `docs/configuration.md:175-234`, `docs/commands.md:359-361` |
| **Carry/Break/Redesign** | **Carry** — agents depend on delegation boundary |

### 6.6 Launch-time Mars usage

| **What** | Spawn/primary paths call Mars `launch-bundle` via `SPAWN_PREPARE` / `PRIMARY` composition surfaces. Model alias → `harness_model_id` at bind. |
| **Where** | `launch/AGENTS.md:99-108`, `harness/.context/CONTEXT.md:24-27` |
| **Carry/Break/Redesign** | **Carry** routing semantics |

---

## 7. Cross-Cutting

### 7.1 Error handling patterns

| **What** | Lifecycle hooks: log exception, continue. `DebugTracer.emit()`: never raises; disables on first write failure. Terminal monotonicity: `ValueError` → drop write (debug log). Spawn infra default exit code: 2 (`DEFAULT_INFRA_EXIT_CODE`). |
| **Where** | `lifecycle.py:796-801`, `observability/AGENTS.md:13-14`, `launch/constants.py:17` |
| **Carry/Break/Redesign** | **Redesign** with consistent error types in TS |

### 7.2 Logging / observability split

| Layer | Mechanism |
|-------|-----------|
| catalog/config | stdlib `logging` |
| ops/launch/harness/streaming | `structlog` |
| Per-spawn debug | `debug.jsonl` via `DebugTracer` |
| Telemetry | Per-project JSONL segments `<owner>.<pid>-<seq>.jsonl`; MCP stdio → stderr only |
| Lifecycle | Observer registry + `failure.json` sentinel |

| **Where** | `src/meridian/AGENTS.md:77-82`, `observability/AGENTS.md`, `docs/commands.md:265-324` |
| **Carry/Break/Redesign** | **Redesign** unified logging; **Carry** telemetry segment naming if tools parse it |

### 7.3 Platform abstractions

| **What** | `IS_WINDOWS` / `IS_POSIX` — never inline `sys.platform`. `get_user_home()` / `get_home_path()` — never `Path.home()` on Windows. Deferred POSIX module proxies (`fcntl`, `pty`). |
| **Where** | `platform/AGENTS.md:36-40`, `user_paths.py:14-40` |
| **Carry/Break/Redesign** | **Carry** Windows-first parity |

### 7.4 Process management

| **What** | `ScopedProcessHandle.terminate()` — single integration point for process tree kill (POSIX pgid, Windows Job Object, psutil fallback). Capture `scope_snapshot` before `connection.stop()`. |
| **Where** | `platform/AGENTS.md:52-60`, `streaming/.context/CONTEXT.md:122-124` |

| **What** | `detached_subprocess_config()`: Linux `PR_SET_PDEATHSIG`; other POSIX new session only; Windows post-spawn Job linkage. |
| **Where** | `detached_process.py:1-55` |
| **Carry/Break/Redesign** | **Carry** containment guarantees |

| **What** | `SignalCanceller`: CLI spawns signal runner PID first; app spawns use `SpawnManager.stop_spawn()`. Does not own terminal authority — `SpawnApplicationService.cancel()` converges. |
| **Where** | `streaming/.context/CONTEXT.md:275-321` |

### 7.5 Control socket protocol

| **What** | Per active streaming spawn. Discovery: `control.sock` (Unix) or `control.sock.port` → `tcp://127.0.0.1:<port>` (Windows). One JSON request per connection, one JSON response line. |
| **Where** | `control_socket.py:19-48`, `81-185` |

**Request types:**

| type | Payload | Action |
|------|---------|--------|
| `user_message` | `text: string` | `SpawnManager.inject()` |
| `interrupt` | — | `SpawnManager.interrupt()` |
| `permission_reply` | `request_id`, `decision`, optional `payload` | `respond_request()` |
| `user_input_reply` | `request_id`, `answers` | `respond_user_input()` |

**Response:** `{"ok": true}` or `{"ok": false, "error": "..."}`; inject may include `inbound_seq`.

| **Why it matters** | `meridian spawn inject` depends on this wire format. |
| **Carry/Break/Redesign** | **Carry** wire protocol; **Redesign** transport |

### 7.6 Layered architecture (policy vs mechanism)

```
cli / server / plugin_api  →  ops/  →  launch/ + state/
                              ↓
                           harness/ (mechanism only)
```

| **Where** | `src/meridian/AGENTS.md:7-25` |
| **Carry/Break/Redesign** | **Redesign** internal module boundaries; preserve seams conceptually |

### 7.7 plugin_api stability

| **What** | External plugins import `plugin_api/` only — not `lib/`. |
| **Where** | `src/meridian/AGENTS.md:27-30` |
| **Carry/Break/Redesign** | **Carry** if extensions ship against current API |

### 7.8 Files-as-authority principle

| **What** | No database; crash-only atomic writes; recovery = startup + reaper. |
| **Where** | `AGENTS.md:40-42`, `.context/CONTEXT.md:20-22` |
| **Carry/Break/Redesign** | **Carry** as architectural invariant |

---

## 8. Rewrite Guidance Summary

| Area | Recommendation |
|------|----------------|
| On-disk spawn/session layouts | **Break** allowed per AGENTS.md — document migration; agents may read old trees during transition |
| `p123` / `c123` ID shapes | **Carry** — pervasive in prompts, tests, extensions |
| `MERIDIAN_*` child env contract | **Carry** |
| CLI command paths & spawn output | **Carry** for agent compatibility |
| Harness terminal event mapping | **Carry** behavior; **Redesign** implementation |
| Mars passthrough vs embedded | **Redesign** — evaluate TS-native package manager |
| Global `spawns.jsonl` | **Break** — already migrated |
| Resolve-before-persist gap in spawn subprocess | **Redesign** — unify with REST path |
| Logging split (stdlib vs structlog) | **Redesign** |
| `state/.context` work-items paths | Update docs — stale vs `work_store.py` |

---

## 9. Key Source Index

| Topic | Primary files |
|-------|----------------|
| Spawn lifecycle | `lib/core/lifecycle.py`, `lib/core/spawn_lifecycle.py` |
| Spawn persistence | `lib/state/spawn/repository.py`, `lib/state/spawn_store.py` |
| Runtime context / env | `lib/core/resolved_context.py`, `lib/core/child_env.py`, `lib/core/depth.py` |
| State layout | `lib/state/AGENTS.md`, `lib/state/.context/CONTEXT.md` |
| CLI routing | `cli/startup/catalog.py`, `cli/command_groups.py` |
| Harness contracts | `lib/harness/AGENTS.md`, `lib/harness/.context/CONTEXT.md` |
| Streaming / control | `lib/streaming/control_socket.py`, `lib/streaming/.context/CONTEXT.md` |
| Launch seam | `lib/launch/AGENTS.md`, `lib/launch/context.py` |
| Mars | `cli/mars_passthrough.py`, `docs/configuration.md` |
| Platform | `lib/platform/AGENTS.md`, `lib/platform/process_scope/` |
| Commands reference | `docs/commands.md` |

---

*Generated by explorer sub-agent. No code changes made in meridian-cli.*
