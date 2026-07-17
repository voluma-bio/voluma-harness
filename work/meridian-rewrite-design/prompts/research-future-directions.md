# Design research — future directions, prior-art gaps & the security frontier

You research where this design should be heading that it currently isn't, and
where its security/monitor story has holes. Ground every claim in prior art or
a concrete emerging pattern — not speculation. Use the `source-study` skill for
how real projects solve these; cite specific systems.

## Read (the design as it stands)

- `../codebase-audit-rewrite/design/monitor-framework.md` (parallel-reviewer /
  monitor framework — the newest thinking)
- `../codebase-audit-rewrite/design/capability-caps.md` (security model)
- `surface-architecture-notes.md`
- `v1-architecture.md` §7 (capability/security), §9 (observability), §10 (mars)
- The `prior-art-*.md` files already gathered: `prior-art-claude-sdk.md`,
  `prior-art-copilotkit.md`, `prior-art-langgraph.md`, `prior-art-opencode.md`,
  `prior-art-pi.md`, `prior-art-web.md` — build on these, don't redo them.

Paths relative to
`/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/`.

## Investigate

1. **Monitor-framework blind spots.** The design proposes async monitors
   actuating through a credential broker (pause token issuance to freeze a
   drifting agent). How do real systems do trajectory-level oversight —
   OpenAI Agents SDK guardrails/tripwires, LangGraph interrupts, AutoGen
   termination, Inspect/eval harnesses? What failure mode (collusion between
   monitor and monitored, monitor cost blowup, broker as single point of
   failure, prompt-injection of the reviewer) does the design not address?
2. **Capability-caps frontier.** Compare against how sandboxed agent systems
   (Claude Code hooks, Codex sandbox, container-use, E2B/Daytona isolation)
   enforce. Where is meridian's cap model weaker? What's the confused-deputy
   / persistence attack the doc under-weights?
3. **Missing future directions.** Given the trajectory (local-first CRDT collab
   + multi-agent + monitor threads), what's the design NOT positioning for that
   the field is clearly moving toward? Candidates to evaluate: agent-to-agent
   protocols (A2A/ACP maturity), multiplayer agent sessions, eval/replay
   harnesses over the journal, cost/budget governance, memory/knowledge layers,
   deterministic replay for debugging. Rank by leverage for THIS product.

## Deliverable

Write `review/research-future-directions.md`:
- **Monitor & security gaps**: concrete, each tied to a real system that
  handles it better, each with the specific attack/failure it closes.
- **Future directions ranked**: for each — the trend, evidence it's real
  (cite systems/standards), why it fits this product, and the cheap
  positioning move to make in the contracts NOW. 3-6 directions.
- A one-paragraph synthesis: the single most important direction the team is
  under-investing in. Cite sources. No hand-waving.
