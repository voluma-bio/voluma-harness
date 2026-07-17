# Explore: prompt packages — what they depend on from meridian-cli

We are designing a TS rewrite of meridian-cli. The prompt packages (skills,
agents) teach AI agents how to use meridian. Your job: find every place where
prompt content references meridian CLI commands, env vars, file layouts, or
behaviors — these are the contracts the rewrite must honor.

**Task dirs:**
- `/home/jimyao/gitrepos/prompts/meridian-base` — base prompt package
- `/home/jimyao/gitrepos/prompts/meridian-dev-workflow` — dev workflow package
- Also check: `/home/jimyao/gitrepos/meridian-cli/.claude/` for generated skill/agent files

**Do NOT change any code.** Read-only exploration. Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-prompts.md`

## What to capture

### 1. CLI command references
- Every `meridian` command referenced in prompt text (meridian spawn, work,
  session, mars, task-dir, etc.)
- The expected arguments and flags
- Expected output formats that prompts parse or reference

### 2. Environment variable references
- Every `MERIDIAN_*` env var referenced in prompts
- `MERIDIAN_TASK_DIR`, `MERIDIAN_ACTIVE_WORK_DIR`, `MERIDIAN_CONTEXT_*` etc.
- How prompts tell agents to use these

### 3. File layout assumptions
- Paths prompts reference (`~/.meridian/`, `.meridian/`, work directories)
- The work item directory structure
- KB, context, strategy directory layouts

### 4. Behavioral contracts
- How prompts describe the spawn model to agents
- How prompts describe work items, sessions
- Subagent spawning instructions (--bg, --prompt-file, wait patterns)
- Any assumptions about harness-specific behavior

### 5. Skills that touch meridian internals
- Skills that invoke meridian commands
- Skills that read meridian state files
- Skills that depend on specific meridian features

### 6. Agent definitions
- What agent types exist and what tools/models they specify
- How agents reference harness capabilities
- The agent frontmatter format and what fields matter

## Output format

For each reference/dependency:
- **What:** the specific reference (quote the prompt text)
- **Where:** file path and line
- **Contract type:** CLI command, env var, file path, behavioral assumption
- **Rewrite impact:** must the TS rewrite support this exactly? Can it evolve?
  Is it a teaching artifact that can be updated when the rewrite ships?
