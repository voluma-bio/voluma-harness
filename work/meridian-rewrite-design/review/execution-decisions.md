# Execution decisions — voluma-harness

Decisions settled in design conversation on 2026-07-14..16, building on the
adversarial review (`SYNTHESIS.md`) and its root causes (`root-cause-decisions.md`).
This doc captures the **execution/topology + model-access** layer. It sits *on
top of* the D1–D3 root-cause decisions, which remain the gate before v1 code.

Companion research (verified, primary-sourced):
- `local-model-hosting.md` — local inference runtimes, capability probe, integration posture.
- `subscription-auth-reality.md` — how harnesses actually use provider subscriptions (verified).

---

## 0. Framing statement — the identity change

**voluma-harness is a local-first agent *runtime*, not a coordinator of other
harnesses.** meridian-cli's founding identity ("coordinates agents — does not
control them"; "harness-agnostic: adapters bridge to Claude/Codex/OpenCode") is
**superseded**. voluma-harness owns its own agent loop (context assembly → model
call → tool dispatch → repeat), runs directly against models, and executes its
own tools — including the CRDT `write` capability, which is the differentiator.

Two senses of "harness" now coexist; keep them distinct in all docs:
- **voluma-harness** = the product; the harness you run agents *in*.
- **harness adapter** = the *optional* interop layer bridging to external
  harnesses (Claude Code / Codex) as one route among many — not the spine.

Consequence for the review: the D3/C3/C6 "opaque `HarnessEvent` → adapters
re-derive terminal semantics" problem **quarantines to the optional bridge**.
The native loop emits typed domain events directly. Conversely, D1 (auth/budget)
and C4 (write-seam-as-authority) become *more* load-bearing — the loop is ours.

Honest strategic note: this steps into a crowded field (Claude Code, OpenCode,
Cline, Codex) as a runtime in its own right. The wedge — local-first + CRDT
multi-agent write-authority + model-pluggable + MIT + forkable — is real, but the
differentiator (write seam + multi-agent coordination) must be conspicuously
better; we won't out-polish incumbents' loops on day one.

---

## 1. Repo topology

**Brand-new repo, references `voluma`.** Not a branch of voluma; not additive-on-
main. Dependency direction is **one-way**: voluma-harness depends on published
`voluma` contracts (sync protocol, domain-event schema); never the reverse.

- **`voluma`** (existing) = cloud / sync / backend peer. The moat.
- **`voluma-harness`** (new) = local-first daemon + CLI + UI + MCP surfaces.
  Runs fully offline; syncs to voluma when online.

This resolves review finding **C5** (local-first vs remote-substrate
contradiction) at the *repo boundary* rather than inside one codebase.

## 2. Name

**`voluma-harness`** for the product. Terminology caveat from §0 applies:
document "voluma-harness (the harness)" vs "harness adapter (internal optional
bridge)" up front so nobody reads the product as an adapter the daemon controls.

## 3. Posture & surfaces

**Local-first by design; ships CLI + UI + the two MCP surfaces.** The UI is not a
scope bolt-on — it restores the surface architecture the review flagged as
missing from the build target (**C8**). So voluma-harness = daemon + CLI + UI +
spawn-MCP + query-MCP, all local-first.

## 4. License — open-core

**MIT on `voluma-harness`; protective/proprietary on the `voluma` cloud.**

Rationale (corrected): as copyright holder you can fork your own project under
any terms regardless of license — MIT is not required to fork. What MIT decides
is what *others* can do. It's coherent here because the value/moat is the **cloud
sync backend**, not the local harness. MIT harness = adoption engine + clean
permissive base for the planned **meridian-flow** (writing-focused vertical fork,
CRDT write-seam specialized for writing).

Accepted tradeoff (the whole bet): MIT lets a competitor fork voluma-harness and
point it at *their own* sync backend. Fine precisely because the cloud is the value.

Hard don'ts: do **not** embed LM Studio (proprietary app terms) or KoboldCpp
(AGPL) in the daemon — shelling out to a user-installed copy is fine, bundling is
not. All recommended local runtimes (Ollama/llama.cpp/vLLM/SGLang/MLX/Jan/
LocalAI/llamafile) are MIT/Apache and invoked as separate processes → no
derivative-work contamination.

---

## 5. Model access — sanction tiers, not "planes"

Earlier "Plane 1 (subscription) vs Plane 2 (direct)" framing was **wrong** and is
replaced. Access is organized by **sanction level** (see `subscription-auth-
reality.md` for verified per-provider facts):

| Tier | What | Status |
|---|---|---|
| **Foundation (sanctioned)** | Vendor **API keys** + **local models** (Ollama/vLLM/MLX/llama.cpp) | Fully sanctioned, no rug-pull. The durable base voluma-harness stands on. |
| **Native subscription (gray-area, opt-in)** | **ChatGPT Plus/Pro** (Codex OAuth), **GitHub Copilot**, **xAI SuperGrok** — ridable in-process, as OpenCode/Zed/Cline/Pi do | Technically works; **no vendor guarantee** for arbitrary clients; volatile (quota/endpoint/policy). Opt-in, labeled "may break," isolated behind a provider adapter. A *feature*, not load-bearing. |
| **Subprocess bridge** | Run the vendor's **official client** to spend a subscription safely | The **only** legitimate path for **Claude Pro/Max** (Anthropic *prohibits* third-party OAuth, enforces without notice → run **Claude Code**). Also interop/migration. |

Key verified corrections vs. earlier assertions:
- ChatGPT subscription is **NOT** Codex-locked — third-party in-process OAuth is
  real (OpenCode/Zed/Cline/Pi).
- **Claude Pro/Max native OAuth is explicitly prohibited** — must use Claude Code
  subprocess or Anthropic API. (OpenCode removed those plugins in v1.3.0.)

## 6. Model routing — identity vs route, with failover

A **model** is a capability; it has a ranked set of **routes** to reach it:
`api-key` · `native-subscription-oauth` · `subprocess-official-client` · `local`.
Routes ranked by **sanction + cost**. The **broker (RequestContext / D1)** picks
the route — never the caller or the agent loop (else confused-deputy, C1).

**Failover ladder** when a route blocks:
1. **Same model, another route the user holds credentials for** ("swap to the
   same Claude model"). Only works if an alternate credential exists.
2. **Substitute model** from a configured equivalence class (e.g.
   `claude-sonnet → copilot-claude → local-qwen3-coder`). A quality change.
3. **Fail the turn** with a clear reason.

**Guardrails (must-have, or this is dangerous):**
- **No silent cost/quality swaps.** Flat-subscription → metered-API is an
  unrequested bill; strong→weak model is mid-task degradation. Failover is
  **explicit + consented per equivalence class**, gated by **BudgetGrant**
  (future-direction #4) before crossing into a paid route, and emitted as a
  **domain event** (D3): "model X served via route B because route A blocked."
- **Circuit breaker classifies the block** — retrying the wrong kind gets
  accounts banned:
  - *Transient* (quota, 429 rate-limit) → back off, retry later, keep route.
  - *Hard* (ToS enforcement, 403 auth-revoked, ban signal) → **disable route,
    do not retry, alert user.**
- **Fail-closed default.** Prohibited routes (Claude-native-OAuth) are excluded
  at catalog-load, never discovered at runtime. Gray-area routes are opt-in and
  auto-quarantined on hard block.

Net rule: *a model is a capability with sanction-aware routes; the broker serves
it via the safest available route, fails over on block with consent + budget
check, hard-quarantines routes that ban us, and never offers prohibited ones.*
Gray-area subscriptions become **bonus reach that degrades gracefully** to the
sanctioned API+local foundation.

## 7. Local model hosting (see `local-model-hosting.md`)

- **Endpoint-first, runtime-neutral.** Probe a configured `/v1` endpoint (health
  + capability canary) before ever spawning one. Optional, explicitly-approved
  **managed child process** (Ollama or `llama-server`) only when no endpoint
  exists; track PID/start-token/model-digest; **kill only processes we started.**
- **Tool-calling is the hard requirement, not chat.** No runtime guarantees the
  model picks the right tool; schema enforcement guarantees *shape, not intent*;
  beware the "constraint tax" (grammar-constraining can suppress tool calls).
  Driver needs a **capability-probe + validate/repair loop** (reject unknown
  tools, validate args, bounded single retry, record runtime/model/template).
- Defaults: **Ollama** (cross-platform default), **MLX** + `llama-server`
  fallback (Apple Silicon), **vLLM/SGLang** (GPU power users). Laptop model
  shortlist for agentic tool-use: `gpt-oss-20b`, `Qwen3-Coder-30B-A3B`,
  `Devstral Small 2`; newer `Qwen3.6-27B` / `Gemma 4` at 24–48 GB.

## 8. Model management — capability-aware catalog

Same shape as the mars resolved-artifact decision (D3):
- **Catalog** — immutable, versioned, digest-pinned. Per model: route set (§6),
  driver kind, endpoint/runtime binding, probed capability record, license +
  weight digest, cost/budget policy. Resolved once, pinned per spawn (no TOCTOU).
- **Registry** — what runtimes/endpoints are actually live now (endpoint-first
  probe feeds this).
- **AgentDriver** — binds a requested model to a concrete route+endpoint at spawn
  under RequestContext + BudgetGrant.

## 9. Observability — the domain-event spine, not a gateway

Observability = the **versioned typed domain-event stream** (D3 contract #2 /
future-direction #1); MCP, webhooks, replay, eval, dashboards all project from
it. Do **not** adopt an external gateway's telemetry as a second event source.
Cheap high-value seam: make domain events **OpenTelemetry GenAI-conformant** so
external tools (Grafana/Honeycomb/Langfuse) consume the stream without lock-in.
Emit locally; export only on opt-in (egress manifest, future-direction #5).

Router build-vs-buy: **native TS router** owns policy (auth/budget/capability/
selection); Vercel AI SDK for in-process multi-provider reach. Treat LiteLLM/
Bifrost/Portkey as an **optional managed sidecar** for exotic providers only —
never the control plane (Python weight + split-brain auth/budget otherwise).

---

## Open questions (not yet decided)

1. **Subprocess bridge in v1, or later?** Keep a thin optional bridge (subscription-
   safe Claude path + interop) vs own-loop-only MVP (API keys + local + gray-area
   native, bridge later). Leaning: keep thin + optional; cut for focus is viable.
2. **Name center-of-gravity confirm** — `voluma-harness` assumes harness-is-product.
   Settled unless cloud becomes primary.
3. **License exact instrument** — MIT chosen; confirm no protective clause wanted
   on the harness itself (moat stays entirely in the cloud).
4. **Model equivalence classes** — who authors the `claude → copilot → local`
   substitution maps, and default vs user-defined.

## Dependencies on root causes (still the gate)

This doc assumes but does **not** replace `root-cause-decisions.md`:
- **D1 (RequestContext/broker)** — owns route selection, circuit-breaker state,
  secret brokering. §6 depends on it.
- **D2 (identity split)** — portable IDs, display alias, workspace/mount, remote
  lease. Unchanged by this doc.
- **D3 (event/outcome/catalog split)** — the domain-event spine (§9), the pinned
  catalog artifact (§8), and RunOutcome completion authority.

v1-architecture.md is a build target only after D1–D3 + the §13 honesty pass.
