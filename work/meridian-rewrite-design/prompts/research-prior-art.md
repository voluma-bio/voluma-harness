# Research: Prior art architectures for the meridian-cli v1 rewrite

We are designing a TS rewrite of meridian-cli as a local-first coding-agent
product. Research how existing agent harnesses and meta-harnesses are
architected so we can learn from their structural decisions.

Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/research-prior-art.md`

## What we're building (context)

A local-first agent coordination platform with:
- CRDT collaborative editing (Yjs) as the write primitive
- Unified harness for API-based providers + Claude Code native
- CLI + webapp + subagent spawning, all one process
- SQLite, capability model, OTel observability
- Shared packages from a sibling TS app (meridian-flow)

We need to understand how others solved: harness abstraction, agent spawning,
tool registration, sandbox/containment, session management, and local-first
architecture.

## Sources to research

### 1. Pi (`~/.meridian/ref/pi`)
Local reference checkout available. Explore:
- `packages/` structure — how the monorepo is organized
- The provider registration seam (`pi.registerProvider()`, `models.json`)
- Agent core loop — how turns work, how tools are dispatched
- Session/conversation model
- Extension system architecture
- How it handles multiple providers

### 2. Oh-My-Pi (`~/.meridian/ref/oh-my-pi`)
Local reference checkout. Explore:
- What it adds on top of Pi
- Community extensions/providers pattern
- Any architectural innovations

### 3. AI SDK Harnesses
Research online: https://ai-sdk.dev/docs/ai-sdk-harnesses/overview
- The harness abstraction model — how they unify different agent runtimes
- Session/sandbox/working-dir concepts
- How they handle approvals and tool permissions
- The streaming/event model
- TS-native design decisions

### 4. Omnigent
Research online: https://github.com/omnigent-ai/omnigent and https://omnigent.ai
- Architecture — daemon + CLI + SDK + web UI
- How they abstract harnesses (claude-sdk/claude-native/codex/cursor/pi etc.)
- The YAML executor.harness model
- Sandbox implementation (bwrap/seatbelt/Job Objects)
- Stateful policies (cost budgets, access controls)
- REST API surface
- How they handle cross-device browser/mobile UI
- Python core — how it compares to our TS direction

### 5. OpenAI Agents SDK
Research online: https://github.com/openai/openai-agents-python
- Agent loop architecture
- Tool registration model
- Handoff/delegation between agents
- Guardrails and safety model
- Tracing/observability built-in

### 6. OpenCode (`~/.meridian/ref/opencode`)
Local reference checkout. Explore:
- The `opencode serve` HTTP+SSE architecture
- How it manages sessions and storage
- The SQLite approach (if any)
- What works well vs what meridian-cli found fragile

### 7. Claude Agent SDK (`~/.meridian/ref/claude-agent-sdk-typescript`)
Local reference checkout. Explore:
- The TS SDK architecture
- How it models agents, tools, sessions
- The tool registration pattern
- How it handles streaming
- MCP integration

### 8. CopilotKit (`~/.meridian/ref/CopilotKit`)
Local reference checkout. Explore:
- How it integrates AI agents into web UIs
- The runtime architecture
- Any CRDT or collaborative editing patterns

### 9. LangGraph (`~/.meridian/ref/langgraph`)
Local reference checkout. Explore:
- Graph-based agent orchestration
- State management model
- How it handles multi-agent coordination
- Checkpointing and persistence

## Output format

For each system, capture:

### Architecture summary (2-3 paragraphs)
What it is, how it's structured, what problems it solves.

### Structural decisions we should steal
Specific patterns, abstractions, or API designs worth adopting.

### Structural decisions we should avoid
What doesn't work, what's over-engineered, what's fragile.

### Relevance to our rewrite
How it maps to our specific needs (harness unification, CRDT write, local-first,
subagent spawning, webapp surface).

## Synthesis section

After researching all sources, write a synthesis:
- **Common patterns** across all systems (what the industry converged on)
- **Unique innovations** worth adopting
- **Gaps** none of them solve (our opportunity — likely the CRDT write primitive)
- **Recommended architecture influences** — which systems' patterns should most
  influence our rewrite, and for which specific components
