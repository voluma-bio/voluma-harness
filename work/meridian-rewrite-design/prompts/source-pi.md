# Source study: Pi agent runtime architecture

Study the Pi agent runtime at `~/.meridian/ref/pi` to extract architectural
patterns relevant to our meridian-cli TS rewrite.

We're building a local-first coding-agent platform with: unified harness for
API providers, CRDT collaborative editing, CLI + webapp + subagent spawning.

**Focus on:**
- Monorepo/package structure
- Provider registration seam (`registerProvider()`, `models.json`)
- Agent core loop — how turns work, tool dispatch
- Extension system architecture
- Session/conversation model
- How it handles multiple providers under one interface

Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/prior-art-pi.md`

Format: architecture summary, patterns to steal, patterns to avoid, relevance to our rewrite.
