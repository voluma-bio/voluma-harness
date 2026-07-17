# voluma-harness — context

The full argument lives in the design corpus (`meridian context work` →
`meridian-rewrite-design/review/`). This file holds the durable frame an agent
needs before changing structure; the corpus holds the reasoning behind it.

## Architecture frame

**The loop.** voluma-harness owns context assembly → model call → tool dispatch
→ repeat. Models are reached through an `AgentDriver`: an *endpoint driver*
(OpenAI-shaped local or hosted endpoint) or a *subprocess driver* (an external
harness run as a child, for subscription auth or interop). Endpoint drivers are
the native path; subprocess is the fallback.

**Model access — sanction tiers** (see `review/subscription-auth-reality.md`):
- Foundation, sanctioned: vendor API keys + local models (Ollama/vLLM/MLX),
  endpoint-first (detect a running endpoint before spawning one).
- Native subscription, gray-area/opt-in/revocable: ChatGPT, Copilot, xAI OAuth.
- Subprocess bridge: the only legitimate Claude Pro/Max path (Anthropic
  prohibits third-party OAuth).

**Routing** (see `review/execution-decisions.md` §6): a model is a capability
with sanction-ranked routes {api-key, native-oauth, subprocess, local}. The
broker (D1 RequestContext) picks the route, fails over on block with consent +
budget check, hard-quarantines routes that ban us, and never offers prohibited
ones.

**The three root causes** (the seams under design):
- **D1** — authenticated RequestContext: surfaces authenticate, `lib/ops`
  authorizes `{principal, project, capability, channel, requestId}`. Never infer
  root from surface, token, env, or cwd.
- **D2 (decided)** — identity: portable `{replica_id, local_seq}`; `(project,
  ordinal)` as a display alias; workspace/mount identity separate from portable
  document identity; HLC ordering with replica_id tiebreaker.
- **D3** — event/outcome/catalog: private raw provider events / versioned typed
  domain events (the public surface for queries/webhooks/replay) / an explicit
  `RunOutcome` completion authority. Same shape pins the mars catalog per spawn.

**Write seam (C4).** The CRDT `write` capability is the differentiator and must
be an authority protocol — idempotency key, planning base, transactional
multi-file commit — not just CRDT convergence.

## Rationale

- **Runtime, not coordinator** — owning the loop is what makes the CRDT
  write-authority and multi-agent coordination possible; subordinating to
  another harness's protocol forecloses them.
- **New repo + MIT open-core** — a permissive harness drives adoption and gives
  meridian-flow a clean base; the moat is the `voluma` cloud, kept protective. A
  competitor forking the harness onto their own backend is the accepted cost.
- **Docs externalized** — one shared org brain (`voluma-bio/docs`) across repos;
  the harness stays code-only.

## Contracts

- Dependency direction: voluma-harness → published `voluma` contracts (sync
  protocol, domain-event schema). Never the reverse.
- Observability is the domain-event spine (D3), OTel-GenAI-conformant — not a
  gateway's telemetry. Emit locally; export only on opt-in.
