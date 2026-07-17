# Source study: OpenCode architecture

Study OpenCode at `~/.meridian/ref/opencode` to extract architectural patterns.

We're building a local-first coding-agent platform in TS. OpenCode is relevant
because it's a local-first coding agent with HTTP+SSE architecture and storage.

**Focus on:**
- The `opencode serve` HTTP+SSE architecture
- Session and storage management
- Database approach (SQLite? File-based?)
- Tool registration and dispatch
- How it handles the local workspace (file watching, git awareness)
- What meridian-cli's fragility map found fragile about it and whether
  the source confirms those weaknesses

Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/prior-art-opencode.md`

Format: architecture summary, patterns to steal, patterns to avoid, relevance to our rewrite.
