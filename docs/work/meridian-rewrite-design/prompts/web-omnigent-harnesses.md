# Web research: Omnigent, AI SDK Harnesses, OpenAI Agents SDK

Research these three online-only sources for architectural patterns relevant
to our meridian-cli TS rewrite.

We're building a local-first coding-agent platform with: unified harness for
API providers, CRDT collaborative editing, CLI + webapp + subagent spawning,
sandbox containment.

## 1. Omnigent
- https://github.com/omnigent-ai/omnigent
- https://omnigent.ai
- Architecture: daemon + CLI + SDK + web UI
- How they abstract harnesses (YAML `executor.harness`)
- Sandbox: bwrap (Linux) + seatbelt (macOS) + Job Objects (Windows)
- Stateful policies (cost budgets, access controls)
- REST API surface
- Python core

## 2. AI SDK Harnesses
- https://ai-sdk.dev/docs/ai-sdk-harnesses/overview
- The harness abstraction model
- Session/sandbox/working-dir concepts
- Approvals and tool permissions
- The streaming/event model
- TS-native

## 3. OpenAI Agents SDK
- https://github.com/openai/openai-agents-python
- Agent loop architecture
- Tool registration model
- Handoffs/delegation between agents
- Guardrails and safety model
- Tracing/observability built-in

Write findings to:
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/prior-art-web.md`

For each: architecture summary, patterns to steal, patterns to avoid,
relevance to our rewrite. End with a synthesis of common patterns and unique
innovations across all three.
