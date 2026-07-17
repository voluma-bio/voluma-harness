# Prior art web research: Omnigent, AI SDK, OpenAI Agents SDK

Scope: architecture patterns relevant to the meridian-cli TypeScript rewrite for a local-first coding-agent platform with a unified harness layer, CRDT collaborative editing, CLI + webapp + subagent spawning, and sandbox containment.

## Source note

I was able to verify Omnigent, the AI SDK docs tree, and the OpenAI Agents SDK docs/site. The exact `ai-sdk-harnesses/overview` URL returned an error in the browser, so the AI SDK section below is grounded in adjacent official docs pages that describe the same agent-loop, streaming, subagent, and sandbox primitives.

---

## 1) Omnigent

Sources:
- GitHub repo: <https://github.com/omnigent-ai/omnigent>
- Project site: <https://omnigent.ai/>
- OpenAPI spec: <https://raw.githubusercontent.com/omnigent-ai/omnigent/main/openapi.json>

### Architecture summary

- Omnigent is explicitly framed as a “meta-harness” and “common orchestration layer” over multiple coding-agent harnesses and custom agents, with a runner, server, CLI, web UI, native app, and REST API surface.
- The architecture is split into:
  - a sandboxed runner that wraps an agent in a uniform session,
  - a server that adds policy and shared history,
  - multiple clients/entrypoints over the same session data.
- The repo is Python-first; the README and repo metadata show the implementation is overwhelmingly Python.
- Agent specs are YAML and are centered on `executor.harness`, which selects a runtime like `claude-sdk`, `codex`, `cursor`, `pi`, or `openai-agents`.
- The platform is explicitly multi-device and session-centric: terminal, browser, phone, and desktop app all view the same session.

### Patterns to steal

- **Harness indirection as a first-class concept.**
  - A YAML agent spec with `executor.harness` lets one agent definition target many runtime backends.
  - This is directly relevant to meridian-cli’s unified harness goal: one agent schema, multiple provider/runtime adapters.
- **Server/runner split.**
  - A local runner executes in a sandbox; a server owns policy, history, and API access.
  - This is a clean separation for local-first systems: execution stays close to the workspace, control-plane state stays centralized and replayable.
- **Data-centric policy layer.**
  - Omnigent describes “stateful, data-centric policies” for cost budgets and access controls at the meta-harness layer rather than prompting.
  - That is a strong fit for a rewrite that wants policy to be durable and enforceable outside model text.
- **Shared session history across surfaces.**
  - The same session is exposed in terminal, browser, and mobile.
  - This is a good model for CLI/web parity and collaborative review.
- **Subagent visibility in the API.**
  - The OpenAPI spec includes a dedicated child-session endpoint for sub-agents, making spawned work a durable first-class resource.
- **REST-first orchestration surface.**
  - The OpenAPI file suggests rich CRUD/list operations for sessions, agents, hosts, comments, permissions, child sessions, and related artifacts.

### Patterns to avoid

- **Python core if the target rewrite is TS-native.**
  - Omnigent’s Python core is a good precedent for architecture, but not for implementation language.
- **Overloading YAML as the only source of truth.**
  - YAML agent specs are flexible, but they can become a parallel configuration language that drifts from runtime types if the system grows.
- **Tight coupling to vendor-specific terminal wrappers.**
  - The repo supports native wrappers and multiple harness flavors; that flexibility is useful, but it can also produce a lot of special-case branching.
- **Sandbox semantics that differ by OS backend.**
  - The repo notes Linux `bwrap`, macOS `seatbelt`, and Windows Job Objects; the Windows backend is process containment only, not full filesystem/network isolation. That is a useful warning that “sandbox” can mean different things on different platforms.

### Relevance to meridian-cli rewrite

- Strong precedent for a **meta-harness** architecture rather than a single agent runtime.
- Strong precedent for **policy as durable data** and for **sub-agent sessions as first-class objects**.
- Strong precedent for a **server-backed session history** that can be shared across devices and UIs.
- The Python implementation is a contrast case: useful for design, but the TS rewrite should keep the same separation while moving execution to typed TS modules and adapters.

### Omnigent details worth preserving in the architecture vocabulary

- `executor.harness` as a capability selector
- runner/server split
- stateful spend caps and access controls
- sandboxed sessions
- child sessions / sub-agent summaries
- REST API as the canonical control plane

---

## 2) AI SDK Harnesses / AI SDK agent docs

Sources:
- AI SDK home: <https://ai-sdk.dev/>
- Docs introduction: <https://ai-sdk.dev/docs/introduction>
- Agents overview: <https://ai-sdk.dev/docs/agents/overview>
- Agents loop control: <https://ai-sdk.dev/docs/agents/loop-control>
- Agents subagents: <https://ai-sdk.dev/docs/agents/subagents>
- Streaming: <https://ai-sdk.dev/docs/foundations/streaming>
- Event callbacks: <https://ai-sdk.dev/docs/ai-sdk-core/event-listeners>
- Repo: <https://github.com/vercel/ai>

### Architecture summary

- The AI SDK presents a **TypeScript toolkit** for building AI apps and agents.
- Its docs frame agents around a **tool loop**:
  - LLM chooses next action,
  - tools extend capabilities,
  - a loop orchestrates context and stopping conditions.
- The SDK exposes **loop control** with `stopWhen` and `prepareStep`, letting callers define termination conditions and mutate settings per step.
- The SDK exposes **subagents** as a pattern:
  - either a basic tool that calls another agent,
  - or a streaming subagent pattern with preliminary tool results and UI state.
- The SDK’s event model is **call-level and step-level**:
  - `experimental_onStart`
  - `experimental_onStepStart`
  - `experimental_onToolCallStart`
  - `experimental_onToolCallFinish`
  - `onStepFinish`
  - `onFinish`
- Streaming is a first-class primitive:
  - `streamText` emits parts as they become available,
  - `Runner.run_streamed()` emits events during execution,
  - `readUIMessageStream` can reconstruct progressively built UI messages.
- The docs and repo strongly emphasize **provider-agnostic TS-native APIs** and **framework-agnostic UI hooks**.

### Patterns to steal

- **Typed loop primitives instead of hardcoded agent behavior.**
  - `ToolLoopAgent`, `stopWhen`, and `prepareStep` are a good model for making orchestration explicit and configurable.
- **Step-scoped mutation hooks.**
  - `prepareStep` is a strong pattern for dynamic model choice, context shaping, and tool filtering without baking policy into prompts.
- **Streaming as a structural capability.**
  - The SDK treats streaming as an ordinary path, not an exotic alternate implementation.
- **Subagents as a local compositional pattern.**
  - The docs show both simple delegation and streamed subagent progress, which maps well to “spawn local specialist agents” in a coding platform.
- **Fine-grained event callbacks.**
  - The lifecycle callbacks are well suited to telemetry, debug UIs, and tracing spans.
- **TS-native portability.**
  - The SDK is explicitly TypeScript-first and framework-agnostic, which is aligned with the meridian-cli rewrite target.

### Patterns to avoid

- **A purely library-centric mental model.**
  - The AI SDK is great as a programming model, but it is not itself a full platform control plane with durable sessions, permissions, or cross-device collaboration.
- **Letting UI streaming semantics become the core domain model.**
  - Stream events are useful, but meridian-cli likely needs a durable session/task model underneath, not only ephemeral stream handling.
- **Assuming subagents should always inherit full context.**
  - The docs explicitly treat context isolation as a feature; that is useful, but the meridian rewrite will likely need selective shared state and workspace state.

### Relevance to meridian-cli rewrite

- The AI SDK is the clearest precedent here for a **TS-native orchestrator loop**.
- Its docs suggest a good split between:
  - `Runner`-style execution,
  - per-step policy hooks,
  - streaming output,
  - subagent composition,
  - observability callbacks.
- For meridian-cli, the likely takeaway is not “copy the SDK,” but “mirror the same seams in a system that also owns workspaces, policies, and collaboration state.”

### AI SDK details worth preserving in the architecture vocabulary

- tool-loop agent
- step-level control
- `stopWhen` / `prepareStep`
- subagent delegation
- preliminary tool results for streamed subagent progress
- event callbacks for start/step/tool/finish
- `readUIMessageStream`
- provider-agnostic TS APIs

---

## 3) OpenAI Agents SDK

Sources:
- GitHub repo: <https://github.com/openai/openai-agents-python>
- Docs hub: <https://openai.github.io/openai-agents-python/agents/>
- Running agents: <https://openai.github.io/openai-agents-python/running_agents/>
- Handoffs: <https://openai.github.io/openai-agents-python/handoffs/>
- Tools: <https://openai.github.io/openai-agents-python/tools/>
- Guardrails: <https://openai.github.io/openai-agents-python/guardrails/>
- Tracing: <https://openai.github.io/openai-agents-python/tracing/>

### Architecture summary

- The SDK is a Python framework for **multi-agent workflows**.
- The core unit is an `Agent` configured with:
  - instructions,
  - tools,
  - optional handoffs,
  - guardrails,
  - structured output.
- Execution is centralized in `Runner`.
  - `Runner.run()`, `Runner.run_sync()`, and `Runner.run_streamed()` are the main entrypoints.
  - The runner loop handles:
    1. calling the current agent,
    2. receiving LLM output,
    3. resolving tool calls or handoffs,
    4. repeating until final output or turn limit.
- Handoffs are represented as tools.
  - The docs explicitly say a handoff like “Refund Agent” appears as a tool such as `transfer_to_refund_agent`.
  - Handoffs can be plain agents or `handoff()` objects with tool naming, descriptions, callbacks, input schema, input filtering, and enablement control.
- Tools are broad and typeful.
  - The docs cover function tools, hosted tools, MCP, container shell, code interpreter, and agents-as-tools.
- Guardrails are first-class.
  - Input guardrails, output guardrails, and tool guardrails can trip and halt execution.
  - Tool guardrails can run before/after execution, with a pre-approval option for some approval flows.
- Tracing is built in.
  - Traces contain spans for the run, agent steps, generation, function tools, guardrails, and handoffs.
  - Traces can be flushed, batched, exported, and extended with custom processors.
- The SDK also includes a sandbox agent layer for workspace-scoped execution.

### Patterns to steal

- **Runner-centered execution loop.**
  - A single runner abstraction makes the lifecycle easy to reason about and test.
- **Handoffs as tools.**
  - This is a strong pattern for delegation because the model can choose specialist transfer points using the same tool-use machinery it already understands.
- **Guardrails as explicit runtime gates.**
  - Input, output, and tool-level guardrails make safety a runtime concern rather than a prompt convention.
- **Built-in tracing with spans for each major action.**
  - The trace/span model is a good match for agent debugging, replay, and observability.
- **Structured tool catalog.**
  - Support for function tools, MCP, hosted tools, and agents-as-tools provides a layered tool model that is flexible without flattening every capability into one interface.

### Patterns to avoid

- **Python-only framework assumptions.**
  - The design is useful, but the rewrite target is TS.
- **Framework-level behavior that hides too much from the product surface.**
  - The SDK is excellent at orchestration, but meridian-cli probably needs more explicit workspace, sandbox, and collaboration objects than a generic agent library exposes.
- **Over-reliance on handoff chains for every kind of delegation.**
  - The SDK clearly supports handoffs, but in a platform like meridian-cli some delegation should likely be modeled as subagent spawning, some as tools, and some as background tasks or jobs.

### Relevance to meridian-cli rewrite

- Best precedent here for:
  - **loop ownership**,
  - **delegation semantics**,
  - **guardrail placement**,
  - **trace/span instrumentation**.
- Useful conceptual split for meridian-cli:
  - agent definition,
  - runner/executor,
  - tools,
  - handoffs,
  - guardrails,
  - trace/telemetry.
- The docs also show how to keep **workspace-scoped sandbox execution** distinct from plain agent runs.

### OpenAI Agents details worth preserving in the architecture vocabulary

- Agent / Runner split
- tool-based handoffs
- input and output guardrails
- tool guardrails
- spans and traces
- `run_streamed()`
- sandbox agent concept
- agents-as-tools

---

## Cross-source synthesis

### Common patterns across all three

1. **Explicit execution loop**
   - Omnigent has a runner wrapping sessions.
   - AI SDK uses a tool loop with configurable stopping and per-step mutation.
   - OpenAI Agents SDK uses `Runner` with a documented loop over agent output, tool calls, and handoffs.

2. **Delegation is first-class**
   - Omnigent models sub-agents in YAML and exposes child sessions.
   - AI SDK has subagents as a structured composition pattern.
   - OpenAI Agents SDK uses handoffs and agents-as-tools.

3. **Safety/policy belongs outside the prompt**
   - Omnigent emphasizes stateful policies and access controls.
   - AI SDK exposes tool/step control points and approval-aware loop control.
   - OpenAI Agents SDK has guardrails at input, output, and tool layers.

4. **Observability is not optional**
   - Omnigent stores shared history and exposes session data through REST.
   - AI SDK emits step/tool/finish callbacks and stream events.
   - OpenAI Agents SDK has built-in tracing with spans for runs, tools, guardrails, and handoffs.

5. **Workspace/sandbox concerns are part of the agent runtime**
   - Omnigent wraps execution with OS-level sandboxing and host-specific isolation.
   - AI SDK shows sandbox-backed agent execution as a standard agent pattern.
   - OpenAI Agents SDK includes sandbox agents and workspace-scoped execution.

### Unique innovations by source

- **Omnigent**
  - Most platform-like of the three: durable sessions, collaboration surfaces, REST control plane, multi-device UI, and policy/state centralization.
  - The `executor.harness` YAML abstraction is the clearest “meta-harness” idea.

- **AI SDK**
  - Strongest TS-native ergonomics.
  - Best step-level orchestration primitives: `stopWhen`, `prepareStep`, event callbacks, and streamed UI message reconstruction.

- **OpenAI Agents SDK**
  - Strongest built-in agent governance model.
  - Best tracing/guardrail/handoff vocabulary, and the cleanest `Agent`/`Runner` loop semantics.

### Direct implication for meridian-cli’s rewrite

- Treat the rewrite as a **platform with a runner + control plane + workspace model**, not as a thin agent wrapper.
- Use a **TS-native agent loop** as the implementation backbone.
- Keep **subagent sessions, policies, and traces** durable and queryable.
- Make **sandboxing and permissions** runtime properties of the harness, not incidental CLI flags.
- Preserve **cross-surface collaboration** as a first-class session concern.

---

## Sources used

### Omnigent

- <https://github.com/omnigent-ai/omnigent>
- <https://omnigent.ai/>
- <https://raw.githubusercontent.com/omnigent-ai/omnigent/main/openapi.json>

### AI SDK

- <https://ai-sdk.dev/>
- <https://ai-sdk.dev/docs/introduction>
- <https://ai-sdk.dev/docs/agents/overview>
- <https://ai-sdk.dev/docs/agents/loop-control>
- <https://ai-sdk.dev/docs/agents/subagents>
- <https://ai-sdk.dev/docs/foundations/streaming>
- <https://ai-sdk.dev/docs/ai-sdk-core/event-listeners>
- <https://github.com/vercel/ai>

### OpenAI Agents SDK

- <https://github.com/openai/openai-agents-python>
- <https://openai.github.io/openai-agents-python/agents/>
- <https://openai.github.io/openai-agents-python/running_agents/>
- <https://openai.github.io/openai-agents-python/handoffs/>
- <https://openai.github.io/openai-agents-python/tools/>
- <https://openai.github.io/openai-agents-python/guardrails/>
- <https://openai.github.io/openai-agents-python/tracing/>
