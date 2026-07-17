# voluma-harness — context

The full design argument lives in the corpus (`meridian context work` →
`meridian-rewrite-design/review/`); this file holds the durable frame an agent
needs before changing structure.

## Architecture frame

**The loop.** voluma-harness owns context assembly → model call → tool dispatch
→ repeat. Models are reached through endpoint drivers (OpenAI-shaped local or
hosted endpoints) — the only `AgentDriver` kind in v1. voluma never runs an
external harness as a child; external harnesses interact with it only as
unmanaged clients (mars-synced package → voluma surfaces). A subprocess driver
slot stays reserved in the decision log.

**Model access — sanction tiers** (see `review/subscription-auth-reality.md`):
- Foundation, sanctioned: vendor API keys + local models (Ollama/vLLM/MLX),
  endpoint-first (detect a running endpoint before spawning one).
- Native subscription, gray-area/opt-in/revocable: ChatGPT, Copilot, xAI OAuth.
- Subprocess bridge, not in v1: running the vendor's official client is the
  only legitimate Claude Pro/Max path (Anthropic prohibits third-party OAuth),
  so v1 serves Claude via metered API only. Subscription users run Claude Code
  themselves against a mars-synced package that calls voluma as an unmanaged
  client.

**Routing** (see `review/execution-decisions.md` §6): a model is a capability
with sanction-ranked routes — {api-key, native-oauth, local} in v1, subprocess
reserved. The broker (D1 RequestContext) picks the route, fails over on block
with consent + budget check, hard-quarantines routes that ban us, and never
offers prohibited ones.

**The three root causes** (all ratified 2026-07-16):
- **D1** — daemon-constructed RequestContext: surfaces authenticate, `lib/ops`
  authorizes `{principal, project, capability, channel, requestId}`.
  Spawn-scoped bearer + daemon-issued invocation lease; broker-mediated
  secrets; two-field `enforcement_assurance`. Never infer root from surface,
  token, env, or cwd.
- **D2** — identity: portable `{replica_id, local_seq}`; `(project,
  ordinal)` as a display alias; workspace/mount identity separate from portable
  document identity; HLC ordering with replica_id tiebreaker.
- **D3** — event/outcome/catalog: private raw provider events / versioned typed
  domain events (the public surface for queries/webhooks/replay) / durable
  singular `RunOutcome` via one `finalize()` transaction. Mars = compiler with
  `dirty -> publishing -> published` state machine; ResolvedLaunchPlan + typed
  LaunchBindings.
- **§13 honesty pass** — the registry states real statuses; the
  `meridian`→`voluma` rename is an atomic Break, no compat shim.

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
