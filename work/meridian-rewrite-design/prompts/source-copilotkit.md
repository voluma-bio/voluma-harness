# Source study: CopilotKit architecture

Study CopilotKit at `~/.meridian/ref/CopilotKit`.

We're building a local-first coding-agent platform with a webapp surface.
CopilotKit integrates AI agents into web UIs — relevant for how our webapp
surface connects to the agent runtime.

**Focus on:**
- Runtime architecture — how the agent runtime connects to the web UI
- How AI actions/tools are registered from the frontend
- Streaming patterns — how agent output flows to the UI in real-time
- Any collaborative editing or CRDT patterns
- The React integration model
- How it handles context (documents, state) from the app

Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/prior-art-copilotkit.md`

Format: architecture summary, patterns to steal, patterns to avoid, relevance to our rewrite.
