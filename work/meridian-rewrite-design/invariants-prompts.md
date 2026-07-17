# Report

I'll systematically search the prompt packages for meridian CLI contracts, starting with project docs and broad pattern searches.
Now I'll compile the findings into the invariants document.
# Explorer Report: Prompt Package Invariants for meridian-cli TS Rewrite

## What Was Done

Read-only exploration of:
- `/home/jimyao/gitrepos/prompts/meridian-base` (AGENTS.md, `agents/`, `skills/`, `bootstrap/`, `hooks/`, `.agents/` for stale copies)
- `/home/jimyao/gitrepos/prompts/meridian-dev-workflow` (`agents/`, `skills/`, AGENTS.md)
- `/home/jimyao/gitrepos/meridian-cli/.claude/` (mars-synced generated install; verified via Read)

**Blocker:** Write to `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-prompts.md` was rejected (path outside workspace sandbox). Full findings are in this report for the parent agent to persist.

---

## Key Decisions / Findings

1. **Authoritative source** is `agents/` and `skills/` in prompt packages. `.mars/`, `.claude/`, and meridian-base `.agents/` are generated.
2. **Spawn doctrine migrated to CLI**: `meridian-spawn` and `meridian-cli` skills deleted from shipped `skills/` (CHANGELOG); contract now expected via `meridian spawn -h` + CLI system-prompt injection. Stale full copies remain in `.agents/skills/`.
3. **Work coordination** consolidated into `work-artifacts` skill (replaces `meridian-work-coordination`).
4. **Task-dir model** replaced managed worktrees in active prompts (`meridian work task-dir`, `$MERIDIAN_TASK_DIR`).
5. **Session navigation** is segment-local by default; `session search` prints `Open:` commands agents must run.

---

## 1. CLI Command Inventory

### `meridian spawn`

| Reference | Where | Rewrite impact |
|-----------|-------|----------------|
| `meridian spawn -a <agent> --prompt-file <path> --bg` | `skills/zoom-out/SKILL.md:19`, `session-mining/SKILL.md:54`, `hooks/deny-generic-agent/run.sh:58` | **Must preserve** — default delegation |
| `meridian spawn wait` | `zoom-out:19`, `README.md:21`, hook:59 | **Must preserve** — parallel barrier |
| `--from $MERIDIAN_CHAT_ID` / `--from <spawn-id>` | `product-lead.md:96`, `review-alignment/SKILL.md:14` | **Must preserve** |
| `-f <file\|dir>` | `product-lead.md:97-98`, `design-lead.md:46` | **Must preserve** |
| `--task-dir $(meridian work current)` | `design-lead.md:46` | **Must preserve** |
| `--sandbox read-only\|workspace-write\|danger-full-access` | `meridian-privilege-escalation/SKILL.md:23-30` | **Must preserve** (Codex) |
| `--approval default\|confirm\|auto\|yolo` | `meridian-privilege-escalation/SKILL.md:38-48` | **Must preserve** |
| `-m MODEL`, `--harness codex` | `meridian-privilege-escalation:60`, `bootstrap/harness-setup:36,72` | **Must preserve** |
| `meridian spawn subagents` | `hooks/deny-generic-agent/run.sh:48` | **Must preserve** — hook parses stdout |
| Inline `-p` (legacy) | `README.md`, `common-mistakes.md:92` | Can evolve → `--prompt-file` |

**Stale in `.agents/skills/meridian-spawn/`** (not shipped): `inject`, `children`, `files`, `cancel`, `stats`, `show`, `--continue`, `--fork`, `--dry-run`, `report show/search`, `--desc`, `--last`.

### `meridian` (primary launch)

| Reference | Where | Rewrite impact |
|-----------|-------|----------------|
| `meridian -a [agent] --work [id] --task-dir [path] --prompt-file [brief] --from [chat-id]` | `handoff/SKILL.md:70-75` | **Must preserve** |
| `meridian -C "$PWD"` / `meridian -C "$MERIDIAN_TASK_DIR"` | Both packages `AGENTS.md:23-28` | **Must preserve** |

### `meridian work`

| Command | Where | Rewrite impact |
|---------|-------|----------------|
| `work`, `start`, `switch`, `current`, `update --status`, `done`, `clear` | `work-artifacts/SKILL.md`, `resources/lifecycle.md` | **Must preserve** |
| `list [--done]`, `show`, `reopen`, `delete [--force]` | `lifecycle.md` | **Must preserve** |
| `sessions <id> --all`, `sessions --primary` | `session-mining:65`, `handoff:61` | **Must preserve** |
| `task-dir <path>` | `product-lead.md:84`, `pre-dev/SKILL.md:25` | **Must preserve** |
| `archive` | `bootstrap/context-setup:151` | **Must preserve** |

**Removed** (CHANGELOG; must not reappear): `work worktree --ensure`, `set-worktree`, `spawn --worktree`, `work start --worktree`.

### `meridian session`

| Reference | Where | Rewrite impact |
|-----------|-------|----------------|
| `session log "$MERIDIAN_CHAT_ID" --tail 20` | `session-mining:21` | **Must preserve** |
| Bare log = last 5 entries, current segment | `session-mining:24-25` | **Must preserve** |
| `--from 0 --limit 1` (entry 0 = prologue) | `session-mining:28` | **Must preserve** |
| `--segment previous\|current\|N`, `--full`, `--no-truncate`, `--around` | `session-mining:29-31` | **Must preserve** |
| `--global` (opt-in, conflicts with `--segment`) | `session-mining:33-34` | **Must preserve** |
| `session search` + `--work`, `--workspace` | `session-mining:41-43` | **Must preserve** |
| Each hit prints `Open:` command | `session-mining:46-47` | **Must preserve** — agents run verbatim |

### `meridian context`

`meridian context`, `--verbose`, `context kb`, `context work` — `kb-lead.md`, `kb-maintainer.md`, `zoom-out:22`, `bootstrap/context-setup:141-144`. **Must preserve.**

### `meridian mars`

`sync`, `add`, `version patch|minor --push`, `models list [--live]`, `list --json`, `init`, `check` — AGENTS.md, handoff, agent-staffing, harness-setup. **Must preserve.**

### `meridian kg` / `meridian mermaid`

`kg [check|graph]`, context aliases (`kb`, `strategy`, `work`), `mermaid check` — `md-validation/SKILL.md`, kb agents, architect. Exit codes 0/1 for `kg check`. **Must preserve.**

### `meridian qi`

`qi graph <path>`, `qi claude-md-fix <root>` — `explorer.md:54`, `kb-maintainer.md:72`, `kb-lead.md:87`. **Must preserve** if QI remains in product.

### Other

- `meridian sync conflict` — `bootstrap/context-setup:128`
- `meridian config set primary.agent` — README files

---

## 2. Environment Variables

| Variable | Where | Usage | Rewrite impact |
|----------|-------|-------|----------------|
| `$MERIDIAN_CHAT_ID` | `session-mining:16`, `handoff:66`, `product-lead:96` | Top-level primary session ID; inherited by all spawns | **Must preserve exactly** |
| `$MERIDIAN_ACTIVE_WORK_DIR` | `work-artifacts:17` | Active work scope; fallback `work current` if stale | **Must preserve** |
| `$MERIDIAN_CONTEXT_KB_DIR` | `work-artifacts:54` | KB artifact placement | **Must preserve** |
| `$MERIDIAN_TASK_DIR` | `tech-lead:101`, `gpt-dev:68`, `prober:42`, AGENTS.md | Source-edit checkout | **Must preserve** |
| `$MERIDIAN_PROJECT_DIR` | AGENTS.md (both packages) | Control root for state/profiles/context | **Must preserve** |
| `$MERIDIAN_CONTEXT_*_DIR` | CHANGELOG | work/kb/strategy/archive at launch | **Must preserve** |

**Contract:** env vars don't update mid-session (`work-artifacts:18-19`) — re-query `meridian work current`.

---

## 3. File Layout Assumptions

| Path | Where | Purpose |
|------|-------|---------|
| `~/.meridian/context/<uuid>/work/`, `.../kb/`, `.../archive/work/` | `bootstrap/context-setup:26-28` | Default local context |
| `~/.meridian/git/<clone>/` | `context-setup:40` | Git-backed context |
| `~/.meridian/ref/<name>` | `source-study/SKILL.md:22` | Reference repo clones |
| `/tmp/meridian-<pid>/` | `hooks/deny-generic-agent/run.sh:31` | Blocked Agent() prompt capture |
| `agents/*.md`, `skills/*/SKILL.md` | AGENTS.md | Source artifacts |
| `.mars/`, `.agents/`, `.claude/` | AGENTS.md, skill-creator | Generated — never edit |
| `.context/CONTEXT.md`, `AGENTS.md` | qi-layer, knowledge-layers | Code-local knowledge |
| `design/`, `docs/`, work dir | knowledge-layers | Artifact layers |
| `meridian.toml` `[context.*]`, `[[hooks]] git-autosync` | context-setup | Context + autosync config |

**Historical (migrated):** `.meridian/fs/`, `.meridian/work/<id>/` — only in CHANGELOG.

---

## 4. Behavioral Contracts

### Spawn model
- Subagents via shell `meridian spawn`, not harness `Agent()` — enforced by `deny-generic-agent` hook
- `--bg` + single `spawn wait` barrier; notification on completion
- `--prompt-file` preferred over inline `-p`
- `spawn subagents` respects caller's `subagents:` allow-list

### Work items
- Session-scoped; spawns inherit attachment
- Orchestrator owns `update`/`done`/`clear`
- `task_dir` set by product-lead; meridian doesn't own the directory
- Not every spawn needs a work item
- Free-form status strings

### Task vs project roots
- Edits/git/builds → `$MERIDIAN_TASK_DIR`
- State/skills/context → `$MERIDIAN_PROJECT_DIR`
- CWD may be project root, not task dir

### Harness behavior
- Model → harness routing (`harness-setup/BOOTSTRAP.md`)
- Codex: sandbox tiers + `--approval`
- Claude: approval only, no sandbox tiers in prompts
- Workspace `--add-dir` loads sibling `.claude/skills/` (skill leakage gotcha — `workspace-setup`)

### Hooks
- `deny-generic-agent`: blocks generic Agent(), suggests `meridian spawn`
- `git-autosync`: on spawn complete, work events — not timer-based

---

## 5. Skills Touching Meridian Internals

**Active (shipped `skills/`):**
- `work-artifacts`, `session-mining`, `handoff`, `meridian-privilege-escalation`, `md-validation`, `zoom-out`
- dev-workflow: `pre-dev`, `source-study`, `agent-staffing`, `review-alignment`

**Deleted but stale in `.agents/`:**
- `meridian-spawn`, `meridian-cli`, `meridian-work-coordination`

**Executable hook:**
- `hooks/deny-generic-agent/run.sh` calls `meridian spawn subagents`

---

## 6. Agent Definitions

### meridian-base (`agents/`)

| Agent | Tools (meridian) | Body refs |
|-------|------------------|-----------|
| `subagent` | spawn, session, work, context, qi | Template |
| `explorer` | qi | `qi graph` |
| `session-miner` | session, work, spawn show | `/session-mining` |
| `kb-lead` | spawn, session, work, context, qi | context kb, kg, mermaid, qi |
| `kb-maintainer` | `meridian *` | context kb, kg, qi claude-md-fix |

### meridian-dev-workflow (`agents/` — 17 total)

| Agent | mode | Key meridian refs |
|-------|------|-------------------|
| `product-lead` | primary | `work task-dir`, `--from $MERIDIAN_CHAT_ID`, `work current` |
| `tech-lead` | primary | `$MERIDIAN_TASK_DIR`, spawn/session/work tools |
| `design-lead` | primary | `--task-dir $(meridian work current)` |
| `gpt-dev` | primary | `$MERIDIAN_TASK_DIR` |
| `prober` | subagent | `$MERIDIAN_TASK_DIR` |
| `architect` | subagent | `mermaid check`, `meridian *` |

**Frontmatter fields that matter:** `mode`, `model`, `harness`, `effort`, `model-policies`, `subagents`, `skills.load/available`, `tools` (bash allowlists), `sandbox`, `approval`.

### meridian-cli `.claude/`
Mars-synced mirror of both packages. Same contracts; tool YAML translated to harness format (e.g. Claude `Bash(meridian spawn *)`).

---

## 7. Contradictions (Flagged)

| Claim | Reality |
|-------|---------|
| CHANGELOG: spawn/cli skills deleted | `.agents/skills/meridian-spawn/` and `meridian-cli/` still present with stale flags (`--desc`, `--last`, `full-access`) |
| README lists `meridian-default-orchestrator`, `meridian-work-coordination` | Removed per CHANGELOG |
| CHANGELOG: shared-workspace teaches `meridian context` | Current `shared-workspace/SKILL.md` has no meridian commands |
| `.agents/agent-artifacts/resources/meridian.md` | References deleted `meridian-spawn` skill, `full-access` tier |
| `handoff` uses `meridian -a` | Distinct from `meridian spawn` — primary entry surface |
| Bootstrap `work archive` vs skill `work done` | Two archive semantics taught |

---

## 8. Rewrite Impact Summary

| Must preserve exactly | Can evolve (update prompts) | Now in CLI, not skills |
|----------------------|----------------------------|------------------------|
| spawn wait / --bg / --prompt-file | inline `-p` examples | spawn doctrine (`spawn -h`) |
| session segment model + `Open:` | README stale refs | meridian-cli mental model |
| MERIDIAN_CHAT_ID, TASK_DIR, PROJECT_DIR | full-access → danger-full-access | |
| work current / task-dir | managed worktrees (gone) | |
| context kb/work, mars sync/models | | |
| kg / mermaid check | | |

---

## Verification

- Read 40+ source files across both prompt packages
- Grep covered all `skills/`, `agents/`, `bootstrap/`, `hooks/`
- meridian-cli `.claude/` verified by direct Read (workspace grep misses out-of-tree paths)
- No source files modified

## Issues / Blockers

- **Could not write** `invariants-prompts.md` to work directory (sandbox rejected out-of-workspace writes). Parent agent should persist this report to `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-prompts.md`.
