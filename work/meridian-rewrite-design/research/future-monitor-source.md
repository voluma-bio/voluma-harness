# Trajectory monitoring / interruption: source study

Scope: concrete enforcement and isolation mechanisms (checked 2026-07-14). This is an evidence report, not a design recommendation.

## OpenAI Agents SDK

- Official docs: <https://openai.github.io/openai-agents-python/guardrails/> (sections “Execution modes”, “Tool guardrails”, “Tripwires”). Input guardrails can be blocking (`run_in_parallel=False`) or concurrent. Blocking evaluates before the target starts; a tripwire raises `InputGuardrailTripwireTriggered`, so no target tokens/tools have run. Concurrent mode may already have consumed tokens and executed tools before cancellation. Output guardrails run only after completion. Tool input guardrails run immediately before function-tool execution and can reject/replace/raise; tool output checks run after execution.
- Workflow boundaries are explicit: input checks run only on the first agent; output only on the final agent; tool checks on each custom function-tool invocation. Hosted/built-in tools, handoffs, and `Agent.as_tool()` do not use the normal tool-guardrail pipeline (docs lines 189–230).
- Local source: `/home/jimyao/.meridian/ref/openai-agents-python/src/agents/guardrail.py:81-100,141-154,245-263` defines tripwire semantics and `run_in_parallel`; `src/agents/run.py:776-800` separates blocking/parallel checks; `src/agents/run_internal/tool_execution.py:2310` raises tool-input tripwire. This is in-process orchestration, not an isolated monitor process.
- Closes: malicious initial input (only where attached as first-agent input check), disallowed final output, and selected function-tool argument/output violations before/after the function boundary. Gaps: parallel checks are not a pre-side-effect barrier; output checks cannot undo already executed tools; coverage does not include hosted/built-in tools or handoff calls; an LLM guardrail itself is an untrusted-input classifier unless separately constrained.

## LangGraph interrupts

- Official guide: <https://docs.langchain.com/oss/python/langgraph/interrupts> (the older canonical URL redirects from <https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/>).
- Local source: `/home/jimyao/.meridian/ref/langgraph/libs/sdk-py/integration/graph/streaming_graph.py:216-234` calls `interrupt("Are we good?")`; runtime catches the special exception, emits `input.requested`, and requires `thread.run.respond(answer)` to continue. `/home/jimyao/.meridian/ref/langgraph/libs/sdk-py/langgraph_sdk/_async/stream.py:215-263` validates outstanding interrupt IDs under a lock before responding; `:283-330` provides a client-side await timeout; `langgraph_sdk/auth/types.py:21-32,111-117` distinguishes run/thread `timeout` and `interrupted` statuses.
- The interrupt is a checkpointed control-flow pause inside the graph; monitor and target are not separate security domains. Enforcement is at the graph runtime’s caught interrupt/resume boundary. A timeout on the client await bounds waiting, while server run status `timeout` is a separate runtime outcome.
- Closes: pausing before a graph node continues, requiring an explicit response, stale/ambiguous interrupt-response races. Gaps: code before the interrupt has run; a response resumes execution and can contain unsafe instructions; this mechanism itself provides no prompt-injection filtering or independent monitor isolation.

## Microsoft AutoGen

- Official termination documentation: <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/termination.html>; team orchestration: <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/teams.html>; human-in-the-loop: <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/termination.html#human-in-the-loop>.
- The documented model is composable termination conditions (e.g. max messages, timeout, token usage, text match, external/manual termination) evaluated by the team run, with termination propagated as a termination message; teams stop when a condition is met. Human input is a termination/approval style condition, not an OS-level kill.
- No local AutoGen checkout was present under `/home/jimyao/.meridian/ref`, so repository-path claims were not made. The docs describe team-level orchestration, not an isolated monitor process. Gaps evidenced by that boundary: stopping is cooperative at the team runtime; tool/process side effects already started are not retroactively undone, and termination conditions are not presented as prompt-injection defenses.

## Inspect AI / eval harness

- Official docs: <https://inspect.aisi.org.uk/eval-runners.html>, <https://inspect.aisi.org.uk/agents.html>, <https://inspect.aisi.org.uk/sandboxing.html>, and <https://inspect.aisi.org.uk/limits.html>.
- Inspect’s evaluator runs a task against a solver and scorer; evaluation is bounded through evaluator/task limits (time, samples/epochs, model calls/tokens where configured). Sandboxes isolate tool execution from the host according to the configured sandbox provider. Logs preserve transcripts and evaluation metadata for later review; the scorer reviews the completed sample rather than supervising an independent live target.
- No local Inspect AI checkout was present under `/home/jimyao/.meridian/ref`; therefore no source-path assertion is made. The documented sandbox is an execution boundary, while limits are harness/runtime controls. Gaps: scoring/review generally observes outputs after execution; sandboxing limits host impact but does not make the monitor’s judgment trustworthy; untrusted task/web/tool content can still attempt prompt injection unless the solver/tool policy explicitly handles it.

## Cross-source enforcement facts

The strongest documented pre-side-effect boundary is OpenAI’s **blocking** input/tool guardrail, but only for the covered boundary. LangGraph and AutoGen pauses/termination are runtime control-flow mechanisms, not separate monitor isolation. Inspect provides time/sample/token budgets and sandboxed execution for evaluation, with post-run scoring as the normal review boundary. Across all four, stopping a loop does not imply rollback of side effects already performed; none of the cited mechanisms claims a general solution to prompt injection from arbitrary untrusted trajectory content.
