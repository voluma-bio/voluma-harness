# Explore: mars-agents integration contract

We are designing a TS rewrite of meridian-cli. mars-agents (Rust) stays as-is —
it's a package manager for prompt artifacts. Your job: extract the exact
integration contract between meridian-cli and mars-agents so the rewrite
preserves it.

**Task dir:** `/home/jimyao/gitrepos/mars-agents`
**Also read:** `/home/jimyao/gitrepos/meridian-cli` for the CLI-side integration

**Do NOT change any code.** Read-only exploration. Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/invariants-mars.md`

## What to capture

### 1. Filesystem contract
- What directories/files mars-agents reads from the project
- What directories/files mars-agents writes to (target dirs: `.claude/`, `.cursor/`, etc.)
- The `mars.toml` and `mars.lock` formats — what fields, what they control
- `.mars/` directory contents and structure
- How mars discovers the project root

### 2. CLI integration
- How meridian-cli invokes mars commands (subprocess? library?)
- What `meridian mars` subcommands exist and what they do
- The `mars-agents` binary's own CLI surface
- Input/output contracts for each command
- Error handling — what mars returns on failure

### 3. Package format
- What a prompt package looks like on disk
- Skills, agents, prompt bundles — their file formats
- How packages are versioned
- How packages reference each other
- The registry/distribution model (git-based? npm-like?)

### 4. Sync contract
- What `meridian mars sync` does step by step
- How it maps packages to harness-specific target directories
- What happens when a harness isn't installed
- The template/generation step — how source packages become target files
- `.claude/agents/*.md`, `.claude/skills/*.md` — how these are generated

### 5. What changes with unified harness
- Currently mars syncs to 5+ target dirs. With 2 harness types (Claude Code
  native + unified), what simplifies?
- Are there harness-specific template variables or transformations?
- What's the minimum mars needs to know about the harness landscape?

## Output format

For each contract point:
- **What:** the contract/invariant
- **Where:** file paths (in both mars-agents and meridian-cli)
- **Direction:** who calls whom, who reads what
- **Rewrite impact:** what the TS rewrite needs to preserve, adapt, or can simplify
