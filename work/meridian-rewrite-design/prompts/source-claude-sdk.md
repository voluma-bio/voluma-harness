# Source study: Claude Agent SDK (TypeScript) architecture

Study the Claude Agent SDK at `~/.meridian/ref/claude-agent-sdk-typescript`.

We're building a local-first coding-agent platform in TS. The Claude Agent SDK
is the official TS SDK for building agents with Claude — relevant for our
unified harness design and tool registration patterns.

**Focus on:**
- Agent model — how agents are defined and composed
- Tool registration — how tools are declared, validated, dispatched
- Streaming architecture — how events flow from the model
- MCP integration — how MCP servers are connected to agents
- Session/conversation management
- Multi-agent patterns (handoffs, delegation)
- Error handling and retry patterns

Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/prior-art-claude-sdk.md`

Format: architecture summary, patterns to steal, patterns to avoid, relevance to our rewrite.
