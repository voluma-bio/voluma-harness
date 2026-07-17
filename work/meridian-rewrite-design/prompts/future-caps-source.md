# Source study: sandbox/capability enforcement

Investigate concrete source and official primary docs for Claude Code hooks/permissions, Codex sandboxing/approval, Anthropic container-use if available, and E2B or Daytona sandbox lifecycle. Focus on what is *actually* enforced versus merely prompted: filesystem/network/process isolation, broker/credential scoping, hooks/audit, and lifetime cleanup. Identify confused-deputy and persistence attack paths these systems address that Meridian's capability-caps proposal might underweight. Clone/reference source under ~/.meridian/ref as appropriate. Cite exact repository paths and official URLs.

Write evidence-only findings to `research/future-caps-source.md` under the active Meridian work directory.
