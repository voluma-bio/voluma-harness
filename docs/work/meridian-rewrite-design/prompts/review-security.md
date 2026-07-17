# Adversarial security review: capability model, monitor framework, trust boundaries

Your job: break the security model of the Voluma v1 / meridian design. Play the
malicious-or-drifting agent: find concrete bypasses, privilege escalations, and
enforcement gaps. Every finding needs an attack path, not a vibe.

## Corpus

- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/codebase-audit-rewrite/design/capability-caps.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/codebase-audit-rewrite/design/monitor-framework.md`
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/v1-architecture.md` — §3.3 (process/trust boundaries), §4 (write seam), §7 (capability and security), §6.7 (agent-edit journal/reversal)
- `/home/jimyao/.meridian/git/haowjy-meridian-cli-docs/work/meridian-rewrite-design/surface-architecture-notes.md` — two MCP modules, channel-as-identity, read-only config surfaces

## Attack scenarios to work through (and find more)

1. **Channel-as-identity**: the per-spawn stdio MCP channel IS the identity.
   Can a worker reach a sibling's channel, the shared query module's socket,
   or re-invoke the CLI to get a fresh top-level identity with default caps?
   The bash `write` CLI binding is on PATH inside the sandbox — what identity
   does it carry, and can it be replayed?
2. **The bash escape hatch**: subagents get normal bash. Enumerate what bash
   alone defeats: editing config files that influence future policy, writing
   to the DB file directly, killing the monitor process, exfiltrating
   credentials from env.
3. **Monitor race**: one-turn lag is "acceptable" for non-irreversible actions.
   Construct a trajectory that does irreversible damage using