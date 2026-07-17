# mars-agents ↔ meridian-cli Integration Contract

Design reference for the meridian-cli TypeScript rewrite. **mars-agents (Rust) stays as-is** — a subprocess-backed package manager for prompt artifacts. Meridian orchestrates; Mars compiles and materializes.

---

## Integration Overview

```
meridian-cli (Python today, TS rewrite)
    │
    ├── subprocess: `mars` binary (bundled via `mars-agents==X.Y.Z` PyPI dep)
    │       ├── passthrough: `meridian mars <args>` → nearly all mars subcommands
    │       ├── init flow: `mars init`, `mars add`, `mars link` (via init_ops)
    │       ├── launch policy: `mars build launch-bundle --json`
    │       ├── catalog: `mars models list/resolve`, `mars agents list/show`
    │       └── diagnostics: `mars outdated --json`
    │
    └── filesystem reads (no mars subprocess):
            .mars/agents/*.md          ← agent catalog
            .mars/models-merged.json   ← fallback alias cache (meridian-side)
            mars.toml / mars.lock      ← config authority (committed)
```

**Pinned version today:** `mars-agents==0.10.2` in `meridian-cli/pyproject.toml`. Launch-bundle schema **v3 only**.

---

## 1. Filesystem Contract

### 1.1 Project root discovery

| What | Walk up from cwd (or `--root`) to filesystem root until `mars.toml` exists. Git boundaries do **not** stop the walk. Reject `--root` values that look like managed output dirs (`.claude`, `.mars`, etc.). |
| Where | `mars-agents/src/cli/mod.rs` (`find_agents_root`, `find_agents_root_from`) |
| Direction | mars reads; meridian injects `--root` |
| Rewrite impact | **Preserve.** Meridian must pass `--root` explicitly when `MERIDIAN_PROJECT_DIR` is set (passthrough) or when operating on a launcher project from a nested spawn/task dir. |

Meridian project root resolution (`MERIDIAN_PROJECT_DIR` → cwd) is separate but must align for mars calls:

| What | `resolve_project_root_resolution()` prefers explicit path, then `MERIDIAN_PROJECT_DIR`, then cwd. |
| Where | `meridian-cli/src/meridian/lib/config/project_root.py` |
| Rewrite impact | **Preserve** env precedence; mars and meridian roots are usually the same repo root. |

### 1.2 Files mars reads (inputs)

| Path | Purpose |
|------|---------|
| `mars.toml` | Dependencies, settings, model aliases, agent overlays |
| `mars.local.toml` | Gitignored dev overrides (`[overrides]`, local `[settings]`, `[models]`, `[agents]`) |
| `mars.lock` | Resolved versions, ownership registry (v2 schema) |
| `.mars-src/agents/`, `.mars-src/skills/` | Project-local `_self` items (always discovered) |
| Dependency source trees | Git clones (global cache) or local paths; package layout below |
| `MARS_CACHE_DIR` / OS cache / `.mars/cache` | Global git source cache |

Repo-root `agents/` and `skills/` are **package contents for downstream consumers**, not local `_self` discovery roots.

| Where | `mars-agents/docs/config/mars-toml.md`, `src/sync/mod.rs`, `src/source/mod.rs` |
| Rewrite impact | **No change** — mars owns resolution. Meridian only edits `mars.toml` indirectly via init/add or user edits. |

### 1.3 Files mars writes (outputs)

| Path | Committed? | Purpose |
|------|------------|---------|
| `.mars/` | No (gitignored) | Canonical compiled store — **cache**, not source of truth |
| `.mars/agents/*.md` | No | Full-fidelity agent profiles (Meridian spawn reads these) |
| `.mars/skills/<name>/` | No | Canonical skill trees (`SKILL.md` + assets) |
| `.mars/cache/` | No | Project-local cache + `sync.lock` advisory lock |
| `mars.lock` | **Yes** | Ownership + resolved dependency provenance |
| `mars.toml` | Yes | Mutated by `add`/`remove`/`upgrade`/`rename`/`override` |
| Target dirs from `settings.targets` | Usually **yes** | `.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.pi/` |
| Target config files | Varies | MCP (`*.mcp.json`), hooks (`settings.json`), per adapter |

Default managed root is `.mars/` (not legacy `.agents/`). `settings.managed_root` / `settings.targets` can redirect.

| Where | `mars-agents/src/AGENTS.md`, `src/target_sync/mod.rs`, `docs/internals/sync-pipeline.md` |
| Direction | mars writes; meridian reads `.mars/` for catalog, does not write it |
| Rewrite impact | **Preserve** read paths. Do not treat harness dirs as Meridian discovery roots — only `.mars/`. |

### 1.4 `.mars/` structure

```
.mars/
  agents/           # files: <name>.md
  skills/           # dirs: <name>/SKILL.md (+ assets)
  cache/            # internal; skip in content scans
  sync.lock         # advisory lock during sync
```

Meridian's `_scan_mars_content()` walks `.mars/` subdirs dynamically (skips `cache`), treating file stems as agents and dir names as skills.

| Where | `meridian-cli/src/meridian/lib/ops/init_ops.py` |
| Rewrite impact | **Preserve** scan semantics for init reporting. |

### 1.5 `mars.toml` schema (contractual fields)

**Sections Meridian cares about:**

| Section | Controls |
|---------|----------|
| `[dependencies.<name>]` | Git URL or local `path`, `version` constraint, filters (`agents`, `skills`, `exclude`, `only_*`), `rename` |
| `[local-dependencies.<name>]` | Same shape; not exported; merged at sync |
| `[settings].targets` | Harness/materialization dirs (e.g. `[".claude", ".cursor", ...]`) |
| `[settings].agent_emission` | `auto` / `always` / `never` — native harness agent emission |
| `[settings.meridian.agent_copy]` | Selective native copies under managed mode |
| `[settings].default_harness`, `default_model`, `harness_order` | Routing defaults for launch-bundle |
| `[models.<alias>]` | Model alias map (`harness`, `model`, `match`, `exclude`, …) |
| `[agents.<name>]` | Per-agent overlays (model, effort, approval, …) |
| `[package]` | Only in publishable source packages |

Config precedence: `mars.toml < mars.local.toml < CLI flags`. Consumer `[models]` always wins over dependency merge.

| Where | `mars-agents/docs/config/mars-toml.md`, `src/config/mod.rs` |
| Rewrite impact | **Preserve** — Meridian users edit these; TS CLI should not reimplement merge logic. |

### 1.6 `mars.lock` schema (v2)

- `version = 2`
- `[dependencies.<name>]` — resolved URL/path/version/commit
- `[dependency_model_aliases.<alias>]` — dependency-winner aliases only (not consumer overrides)
- `[items."<kind>/<name>"]` — logical item with `source_checksum`
- `[[items."…".outputs]]` — **`(target_root, dest_path, installed_checksum)`** is the ownership identity

**Critical invariant:** Mars may delete/overwrite a path in a target **only** if lock contains matching `(target_root, dest_path)`. `.mars`-only records do not authorize `.cursor/` mutations.

| Where | `mars-agents/docs/internals/lock-file.md`, `src/lock/.context/CONTEXT.md`, `src/target_sync/.context/CONTEXT.md` |
| Rewrite impact | **Preserve** semantics in any lock-aware tooling; do not flatten by `dest_path` alone. |

### 1.7 Deletion / collision invariants

- Mars **never deletes files it didn't create** (per-target lock ownership).
- Unmanaged collisions: preserve by default; `--force` adopts and records lock.
- Atomic writes: tmp+rename for config, lock, installed files.
- Resolve first, then act: zero mutations if resolution errors.

| Where | `mars-agents/AGENTS.md`, `src/target_sync/.context/CONTEXT.md` |
| Rewrite impact | **Preserve** — these are safety contracts users rely on. |

---

## 2. CLI Integration

### 2.1 Invocation model

**Meridian does not link mars as a library.** All integration is subprocess + filesystem.

| Integration | Mechanism |
|-------------|-----------|
| User-facing mars commands | `meridian mars <args>` passthrough |
| Init/bootstrap | `_run_mars_json()` → `mars --root <project> --json <cmd> …` |
| Launch routing | `mars build launch-bundle --json --root <project> …` |
| Model catalog | `mars models list/resolve/refresh` subprocess |
| Agent metadata | `mars agents list/show --json` |
| Upgrade hints | `mars outdated --json` |

Binary resolution: prefer `mars` / `mars.exe` sibling to `sys.executable` (uv tool env), else `PATH`.

| Where | `meridian-cli/src/meridian/cli/mars_passthrough.py`, `meridian-cli/src/meridian/lib/ops/mars.py`, `meridian-cli/src/meridian/lib/launch/bundle_adapter.py` |
| Rewrite impact | **Preserve** subprocess contract and binary resolution order. Reimplement passthrough in TS with same `--root` injection and `MERIDIAN_MANAGED=1` env. |

### 2.2 `meridian mars` passthrough behavior

1. Resolve mars executable (bundled install preferred).
2. If `--json` absent but global `--format json`, inject `--json`.
3. If no `--root` in args and `MERIDIAN_PROJECT_DIR` set → append `--root <MERIDIAN_PROJECT_DIR>`.
4. Set `MERIDIAN_MANAGED=1` in subprocess env (default `"1"` if unset).
5. Forward exit code; stream stdout/stderr (capture when JSON).

| Where | `mars_passthrough.py` lines 72–169 |
| Rewrite impact | **Preserve** — nested spawns must target launcher project, not task-dir cwd. |

### 2.3 Meridian-owned mars subcommands (documented)

From `meridian-cli/docs/commands.md` — all are passthrough unless noted:

| Command | Role |
|---------|------|
| `meridian mars init [--link DIR]` | Create `mars.toml`, `.mars/`, optional target link |
| `meridian mars add SOURCE` | Add dependency + sync |
| `meridian mars sync` | Full compile + target materialization |
| `meridian mars link DIR` | Add managed target |
| `meridian mars list` | Installed agents/skills |
| `meridian mars upgrade` | Maximize versions + sync |
| `meridian mars doctor` | Drift/integrity |
| `meridian mars models list` | Model catalog (`meridian models list` redirects here) |
| `meridian mars models refresh` | Force catalog refresh |
| `meridian mars models resolve ALIAS` | Authoritative alias resolution |
| `meridian mars export --json` | Compile plan inspection |

`meridian init --add/--link` orchestrates: `config_init` → `mars init` → `mars add` → `mars link` → optional `primary.agent` in `meridian.toml`.

| Where | `meridian-cli/src/meridian/lib/ops/init_ops.py`, `meridian-cli/docs/commands.md` |
| Rewrite impact | **Preserve** init sequencing; TS rewrite owns orchestration, mars owns compile. |

### 2.4 mars binary CLI surface (full)

Root globals: `--root <PATH>`, `--json`.

Subcommands (mars-agents `src/cli/mod.rs`):

`init`, `add`, `adopt`, `remove`, `sync`, `upgrade`, `outdated`, `version`, `list`, `why`, `rename`, `resolve`, `override`, `link`, `unlink`, `validate`, `export`, `check`, `doctor`, `repair`, `cache`, `models`, `build`, `agents`, `skills`

Meridian directly depends on: **sync**, **init/add/link**, **build launch-bundle**, **models***, **agents***, **outdated**, **list** (user-facing).

### 2.5 Programmatic mars calls from Meridian (non-passthrough)

| Function | mars command | On failure |
|----------|--------------|------------|
| `check_upgrade_availability()` | `outdated --json [--root]` | Returns `None` (graceful) |
| `mars_agent_subagents()` | `agents show <name> --json` | Returns `None`; logs warning |
| `mars_list_subagents()` | `agents list --json` | Returns `()` |
| `run_mars_models_resolve()` | `models resolve <alias> --json` | Raises `RuntimeError` |
| `run_mars_models_list()` | `models list --json` | Returns `None` (graceful) |
| `request_and_resolve()` (bundle) | `build launch-bundle --json` | Raises `RuntimeError` with mars stderr |

| Where | `meridian-cli/src/meridian/lib/ops/mars.py`, `meridian-cli/src/meridian/lib/catalog/model_aliases.py`, `bundle_adapter.py` |
| Rewrite impact | **Preserve** failure semantics (graceful vs hard fail) per call site. |

### 2.6 Error handling / exit codes

**mars exit codes** (`mars-agents/src/error.rs`):

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Sync completed with unresolved conflicts |
| 2 | Config, resolution, validation, lock, collision, frozen violations |
| 3 | I/O, source fetch, HTTP, git CLI errors |

stderr format: `error: <message>`; lock corrupt hints suggest `mars repair`.

**Meridian passthrough:** propagates mars return code via `SystemExit`.

**launch-bundle:** Meridian wraps failures as `RuntimeError`; version/schema errors mention required mars version.

| Rewrite impact | **Preserve** exit code mapping for passthrough; keep bundle error wrapping for spawn/primary launch. |

### 2.7 Environment variables (cross-cutting)

| Variable | Set by | Effect on mars |
|----------|--------|----------------|
| `MERIDIAN_MANAGED=1` | Meridian passthrough | Suppresses native agent emission when `agent_emission=auto` |
| `MERIDIAN_PROJECT_DIR` | Meridian session | Meridian injects as mars `--root` |
| `MARS_CACHE_DIR` | Optional user | Global source cache location |
| `MARS_OFFLINE=1` | Optional | Skip harness probes |
| `MARS_PROBE_TIMEOUT_SECS` | Optional | Probe timeout (default 5s) |

---

## 3. Package Format

### 3.1 Source package layout (on disk / in git)

Publishable package:

```
<package-root>/
  mars.toml              # [package] name + version required for publishing
  agents/<name>.md       # agent profiles (YAML frontmatter + markdown body)
  skills/<name>/SKILL.md # skill trees (optional flat root SKILL.md)
  mcp/<name>/mcp.toml    # optional MCP registrations
  hooks/<name>/hook.toml # optional lifecycle hooks
  [dependencies]         # transitive deps for consumers
```

Project-local (no publish):

```
.mars-src/agents/<name>.md
.mars-src/skills/<name>/SKILL.md
```

Validated by `mars check [PATH]` — no project config required.

| Where | `mars-agents/docs/config/agent-profiles.md`, `src/cli/check.rs`, `docs/config/mcp-and-hooks.md` |
| Rewrite impact | **No reimplementation** — mars validates and compiles. Document for users only. |

### 3.2 Agent profile format

- Markdown + YAML frontmatter (`name`, `description`, `model`, `harness`, `mode`, `skills`, `tools`, `model-policies`, `fanout`, `harness-overrides`, …)
- `mode`: `primary` | `subagent` (controls `mars list` grouping)
- Canonical compiled output: `.mars/agents/<name>.md` (full fidelity)
- Native harness outputs: format-translated (e.g. `.codex/agents/<name>.toml`)

| Where | `mars-agents/docs/config/agent-compilation.md` |
| Rewrite impact | Meridian reads **compiled** `.mars/agents/` via `AgentProfile` parser — preserve parser fields used at spawn time. |

### 3.3 Skill format

- Universal frontmatter: `name`, `description`, `type`, `model-invocable`, `user-invocable`, `allowed-tools`, …
- Compiled to per-harness native field names
- Canonical: `.mars/skills/<name>/` directory tree

**Launch-time skill content** comes from launch-bundle JSON (`skills.loaded[].{name, skill_type, body}`), **not** by re-reading `.mars/skills/` on disk.

| Where | `mars-agents/docs/config/skill-compilation.md`, `meridian-cli/src/meridian/lib/launch/policies.py` |
| Rewrite impact | **Preserve** bundle as skill authority at launch; disk reads are legacy/fallback only. |

### 3.4 Versioning

- Packages: semver in `[package].version`; git tags `vX.Y.Z`
- Consumer constraints: `^1.0`, `~1.2`, `>=`, exact, or ref pins
- Resolution: MVS (normal sync) vs maximize (upgrade)
- `mars version patch|minor|major` — **prompt package publishing only**, not mars-agents binary

| Where | `mars-agents/docs/config/mars-toml.md` |
| Rewrite impact | **Preserve** `mars outdated` + doctor upgrade hints; no local semver resolver. |

### 3.5 Package references / distribution

- **Git-based** (GitHub/GitLab shorthand, HTTPS, SSH) + **local path**
- Global cache under `MARS_CACHE_DIR` or OS cache
- Transitive deps discovered from dependency `mars.toml` manifests
- **Not npm-like** — no archive URL downloads in v1
- Dependency naming: key in `[dependencies.<name>]`, derived from source specifier on `mars add`

| Where | `mars-agents/src/source/`, `docs/config/mars-toml.md` |
| Rewrite impact | **Preserve** `mars add` as the only dependency mutation path. |

---

## 4. Sync Contract

### 4.1 What `meridian mars sync` does (step by step)

Same as `mars sync` — passthrough with `MERIDIAN_MANAGED=1`:

1. **Load config** — acquire `.mars/sync.lock`; load `mars.toml` + `mars.local.toml`; merge to `EffectiveConfig`
2. **Resolve graph** — fetch git/path sources; semver resolution; transitive deps; merge model aliases (declaration order)
3. **Build target** — discover agents/skills; apply filters/renames; detect collisions; rewrite frontmatter skill refs
4. **Create plan** — diff vs lock + disk (dual checksum: `source_checksum` vs `installed_checksum`)
5. **Apply plan** — atomic writes to `.mars/` canonical store
6. **Compile config entries** — MCP + hooks to per-target config files
7. **Compile native agents** — harness-specific agent surfaces per emission policy
8. **Sync targets** — copy `.mars/` → each `settings.targets` entry; per-target orphan cleanup
9. **Finalize** — write `mars.lock` (even if target sync partially failed); persist `dependency_model_aliases`

| Where | `mars-agents/docs/internals/sync-pipeline.md`, `src/sync/mod.rs` |
| Rewrite impact | **Do not reimplement** — call `mars sync`. Optionally surface diagnostics from JSON if mars adds richer machine output. |

### 4.2 Target mapping

| Target | Agent native | Skill native | Notes |
|--------|--------------|--------------|-------|
| `.mars/` | `agents/<n>.md` | `skills/<n>/` | Canonical; always written |
| `.claude/` | `agents/<n>.md` | `skills/<n>/` | YAML frontmatter |
| `.codex/` | `agents/<n>.toml` | `skills/<n>/SKILL.md` | TOML agents |
| `.cursor/` | `agents/<n>.md` | per adapter | |
| `.opencode/` | `agents/<n>.md` | per adapter | |
| `.pi/` | `agents/<n>.md` | per adapter | |

Target sync copies from `.mars/` and applies native lowering during compile phase for harness-specific shapes.

`settings.targets` entries normalize to `KnownHarness` (affects routing) vs `GenericTarget` (materialization only). **`.agents` does not affect routing.**

| Where | `mars-agents/src/config/.context/CONTEXT.md`, `src/target/`, `docs/config/agent-compilation.md` |
| Rewrite impact | **Preserve** target list in project templates; unified harness may reduce *configured* targets, not mars's per-harness adapters until mars changes. |

### 4.3 When a harness isn't installed

- **Sync does not require harness binaries** — it writes files to target dirs regardless.
- **Routing/models** probe harness availability (`mars models list --live`, launch-bundle policy) — missing binary → `unknown`/`unavailable`, not sync failure.
- OpenCode/Pi/Cursor use disk probe caches; Claude/Codex check PATH + auth.

| Where | `mars-agents/src/harness/.context/CONTEXT.md`, `docs/config/mars-toml.md` (OpenCode probe) |
| Rewrite impact | **Preserve** separation: sync = materialize; live routing = runtime concern. |

### 4.4 Template / generation (agents example)

Source `agents/reviewer.md` →

1. Canonical: `.mars/agents/reviewer.md` (all fields preserved)
2. If native emission allows: `.claude/agents/reviewer.md` (field mapping + tool name translation)
3. Lock records separate `installed_checksum` per `(target_root, dest_path)`

Under `MERIDIAN_MANAGED=1` + `agent_emission=auto`: step 2 suppressed **except** `[settings.meridian.agent_copy]` qualifiers.

Example from meridian-cli's own `mars.toml`:

```toml
[settings.meridian.agent_copy]
harnesses = ["claude"]
include_fanout = false
```

| Where | `meridian-cli/mars.toml`, `mars-agents/docs/config/agent-compilation.md` |
| Rewrite impact | **Preserve** managed-mode suppression + agent_copy exception in project templates. |

### 4.5 Meridian-specific sync triggers

| Trigger | Behavior |
|---------|----------|
| User runs `meridian mars sync` | Explicit |
| `meridian init --add` | mars add triggers sync internally |
| `meridian mars upgrade` | passthrough |
| Worktree creation | Writes `mars.local.toml` with `targets = []` to prevent worktree target pollution |
| Auto-sync on spawn | **No** — missing skills error suggests manual sync |

| Where | `meridian-cli/src/meridian/lib/ops/.context/CONTEXT.md`, `resolve.py` |
| Rewrite impact | **Preserve** worktree guard; do not silently sync on spawn. |

---

## 5. Launch-Bundle Contract (critical Meridian ↔ Mars API)

Meridian PRIMARY and SPAWN_PREPARE resolve model/harness/execution policy **only** through mars:

```
mars build launch-bundle --json --root <project_root> \
  [--agent NAME] [--model M] [--harness H] [--effort E] \
  [--approval A] [--sandbox S] [--skill S]...
```

**Schema version 3** (`LAUNCH_BUNDLE_VERSION = 3` in mars). Meridian rejects other versions.

Key JSON fields consumed:

| Field | Meridian use |
|-------|--------------|
| `routing.{model, model_token, harness, harness_model}` | Harness selection |
| `execution_policy.*` | effort, approval, sandbox, autocompact, timeout |
| `tools.{allowed, disallowed, mcp}` | Tool policy |
| `skills.loaded[]` | `{name, skill_type, body}` — **authoritative skill content** |
| `skills.available[]`, `skills.missing[]` | Inventory / warnings |
| `prompt_surface.inventory_prompt` | Agent catalog prompt |
| `provenance` | Field provenance for dry-run display |
| `warnings` | Surface to user |
| `agent_body` | Agent system prompt body |

| Where | `mars-agents/src/build/bundle.rs`, `meridian-cli/src/meridian/lib/launch/bundle_adapter.py`, `policies.py` |
| Rewrite impact | **Must preserve** — this is the tightest API contract. TS rewrite needs equivalent adapter calling mars subprocess. |

---

## 6. Unified Harness Landscape (future simplification)

### 6.1 Current state (5+ targets)

meridian-cli template `mars.toml` links **five** harness targets:

`.claude`, `.cursor`, `.codex`, `.pi`, `.opencode`

Each has a mars target adapter (`src/target/`), native agent lowering rules, skill field mapping, and optional MCP/hook config translation.

Mars harness registry (`HarnessId`): `Claude | Codex | Pi | OpenCode | Cursor`.

| Where | `mars-agents/src/harness/registry.rs`, `meridian-cli/mars.toml` |
| Direction | mars owns registry + adapters; meridian consumes launch-bundle `routing.harness` |

### 6.2 What unified harness (2 types) would simplify

**At the Meridian layer (rewrite can simplify):**

- Fewer harness projection modules in `meridian/lib/harness/projections/`
- Fewer subprocess launch adapters
- `settings.targets` in consumer `mars.toml` could list fewer dirs
- Less doctor/sync surface area for unused harness dirs

**At the Mars layer (unchanged in this design):**

- Mars still compiles to per-harness native formats until mars itself consolidates adapters
- `mars build launch-bundle` still returns a `routing.harness` from the registry
- Target sync still keyed by `(target_root, dest_path)` — reducing targets is config-only

### 6.3 Harness-specific template variables / transformations

Mars applies **per-harness lowering** for:

- Agent: field stripping/mapping (e.g. Codex TOML vs Claude YAML; drop `model-policies`, `fanout`, `harness-overrides` from native)
- Skills: `model-invocable` → harness-native field names; variant directory layouts
- Tools: canonical PascalCase → harness-native tool names
- Hooks: universal events → native events (lossy; warnings for unsupported)
- `harness-overrides.<harness>` → `execution_policy.native_config` passthrough in launch-bundle (not merged into native agent files)

**Minimum mars knowledge for Meridian:** harness **names** in registry, launch-bundle routing output, and which targets are linked in `mars.toml`. Meridian should **not** duplicate lowering rules.

| Rewrite impact | TS rewrite can narrow **installed** harnesses; keep calling mars for compile + launch-bundle. Any unified harness work is a **mars + meridian joint migration**, not TS-only. |

---

## 7. Configuration Split (Meridian vs Mars)

| Concern | Owner |
|---------|-------|
| Package deps, targets, model aliases, agent overlays | `mars.toml` / `mars.local.toml` |
| Timeouts, retention, work roots, hooks, primary defaults | `meridian.toml` / `meridian.local.toml` |
| Compiled agents/skills | `.mars/` (mars) |
| Harness-native discovery files | target dirs (mars sync) |
| Runtime spawn/session state | `~/.meridian/projects/<uuid>/` (meridian) |

Meridian reads agents from `.mars/agents/`; it does **not** discover agents from `.claude/agents/` directly.

| Where | `meridian-cli/docs/configuration.md` |
| Rewrite impact | **Preserve** the two-config-surface model in TS. |

---

## 8. Rewrite Checklist

| Must preserve | Can simplify in TS | Stays in Rust (mars) |
|---------------|-------------------|----------------------|
| `meridian mars` passthrough + `--root` injection | Python cyclopts → TS CLI framework | Full sync pipeline |
| `MERIDIAN_MANAGED=1` on mars subprocesses | Internal Python module structure | Package resolution |
| `build launch-bundle` adapter (v3) | Duplicate model-resolution code removal (already delegated) | Compiler + target adapters |
| `.mars/agents/` catalog reads | — | Lock ownership rules |
| Init flow: config → mars init → add → link | — | Git source cache |
| `mars outdated` doctor hints | — | Native agent lowering |
| Worktree `targets = []` guard | — | Harness registry |
| Graceful degradation for optional mars calls | — | `mars check` validation |

---

## 9. Source File Index

### mars-agents

| Area | Path |
|------|------|
| CLI dispatch | `src/cli/mod.rs` |
| Sync pipeline | `src/sync/mod.rs`, `docs/internals/sync-pipeline.md` |
| Config schema | `src/config/mod.rs`, `docs/config/mars-toml.md` |
| Lock | `src/lock/mod.rs`, `docs/internals/lock-file.md` |
| Target sync | `src/target_sync/mod.rs` |
| Compiler / native agents | `src/compiler/`, `docs/config/agent-compilation.md` |
| Launch bundle | `src/build/mod.rs`, `src/build/bundle.rs` |
| Harness registry | `src/harness/registry.rs` |
| Errors / exit codes | `src/error.rs` |
| CLI reference | `docs/cli/commands.md` |

### meridian-cli

| Area | Path |
|------|------|
| Mars passthrough | `src/meridian/cli/mars_passthrough.py` |
| Mars command registration | `src/meridian/cli/main.py` (`@app.command(name="mars")`) |
| Startup catalog | `src/meridian/cli/startup/catalog.py` |
| Mars helpers | `src/meridian/lib/ops/mars.py` |
| Init orchestration | `src/meridian/lib/ops/init_ops.py` |
| Launch bundle adapter | `src/meridian/lib/launch/bundle_adapter.py` |
| Launch policies | `src/meridian/lib/launch/policies.py` |
| Agent catalog parser | `src/meridian/lib/catalog/agent.py` |
| Model aliases | `src/meridian/lib/catalog/model_aliases.py` |
| Project root | `src/meridian/lib/config/project_root.py` |
| Example mars.toml | `mars.toml` |
| User docs | `docs/configuration.md`, `docs/commands.md` |

---

*Generated by explorer sub-agent, 2026-07-06. Read-only; no code changes.*
