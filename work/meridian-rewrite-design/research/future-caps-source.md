# Capability enforcement: source-study evidence

Evidence gathered 2026-07-14. This is descriptive; it distinguishes technical enforcement from model-facing prompts.

## Claude Code

- The official hooks guide says `PreToolUse` runs before a tool call and can return `deny` (cancels the call and feeds `permissionDecisionReason` to Claude) or escalate to the user. `PostToolUse`/`Stop` use a top-level `decision: "block"`; `PermissionRequest` has hook-specific behavior. This is a policy callback around tool execution, not an OS boundary: [hooks guide](https://code.claude.com/docs/en/hooks-guide).
- Anthropic's sandboxing description states the sandbox covers direct interactions and scripts/programs/subprocesses spawned by a command, with filesystem and network controls; out-of-sandbox access produces a notification and an allow decision can be made. Thus the sandbox, unlike a hook explanation, is intended as an execution boundary: [Anthropic engineering](https://www.anthropic.com/engineering/claude-code-sandboxing).
- The official FAQ says source files are read locally and only needed portions are sent to the API; deny rules can hard-block files, and denied files cannot be read even when requested. It also says approvals normally last for the current session. These are session/configuration semantics, not evidence of credential revocation or cleanup after process exit: [Claude Code FAQ](https://support.claude.com/en/articles/14554922-claude-code-user-faq).

## Codex CLI

- OpenAI's CLI guide describes Full Auto as autonomous read/write/execute in a sandboxed, network-disabled environment scoped to the current directory. The approval workflow is a separate user-consent mechanism: [Getting Started](https://help.openai.com/en/articles/11096431).
- Codex's official sandbox documentation says its manual `codex sandbox` uses the same command-execution sandbox and has “no network access”; `danger-full-access` disables most security restrictions. This directly demonstrates that approval policy and technical sandbox mode are distinct controls: [sandbox command](https://www.mintlify.com/openai/codex/cli/sandbox), [sandboxing architecture](https://www.mintlify.com/openai/codex/architecture/sandboxing).
- OpenAI describes the sandbox as defining where Codex can write, whether it can reach the network, and which paths remain protected, and says logs are used alongside security triage. This is audit/observability evidence, not a claim that logs themselves prevent exfiltration: [Running Codex safely](https://openai.com/index/running-codex-safely/).
- The public CLI source documents the implementation seam in `openai/codex` repository path `docs/sandbox.md` and the bundled executable path `codex-rs/sandboxing/` (Linux sandbox pipeline). Repository: [openai/codex](https://github.com/openai/codex/tree/main/docs), [sandboxing source](https://github.com/openai/codex/tree/main/codex-rs/sandboxing).

## E2B

- E2B documents explicit states `Running`, `Paused`, and terminal `Killed`; `kill()` from any state releases resources and is not resumable. Pausing preserves filesystem *and memory*, including running processes, loaded variables, and data. Paused sandboxes are retained indefinitely unless killed. This is concrete persistence risk if a capability/credential survives pause: [persistence](https://e2b.dev/docs/sandbox/persistence).
- The same page documents connect timeout (default five minutes), auto-pause on timeout, and auto-resume being opt-in. Timeout therefore need not mean destruction; it can preserve process and memory state.
- E2B's public SDK repository is [e2b-dev/e2b](https://github.com/e2b-dev/E2B), with lifecycle implementation under `packages/` (the docs are the authoritative behavioral source consulted here). No evidence was found in the cited lifecycle page that kill automatically revokes arbitrary credentials injected into a process; only resource release/terminal state is stated.

## Daytona

- Daytona says each sandbox has dedicated kernel/filesystem/network stack and allocated resources; architecture further specifies Linux namespaces for processes, network, filesystem mounts, and IPC. This is OS/container isolation rather than a prompt: [Sandboxes](https://www.daytona.io/docs/en/sandboxes/), [architecture](https://www.daytona.io/docs/en/architecture/).
- Stop terminates a container and preserves its filesystem; archive moves a stopped container filesystem to object storage; delete removes it. Auto-stop, auto-archive, and auto-delete are separate lifecycle controls. Therefore stop is not cleanup/destruction: [sandbox lifecycle](https://www.daytona.io/docs/en/sandboxes/).
- Daytona documents ephemeral sandboxes as automatically deleted once stopped, reclaiming compute, memory, and local storage, and says session-scoped credentials/tokens are revoked. Non-ephemeral sandboxes instead need configured auto-stop/auto-delete intervals: [security exhibit](https://www.daytona.io/docs/ja/security-exhibit/).
- Volumes persist independently of sandbox lifecycle and can be shared across sandboxes; deleting a sandbox does not delete volume data. This is an explicit persistence/shared-state channel: [volumes](https://www.daytona.io/docs/volumes/).

## Security implications evidenced by these systems

1. A hook/approval decision is not equivalent to filesystem/network/process enforcement. Claude's hook docs describe cancellation/escalation; Anthropic's sandbox article separately describes OS-level controls. Codex likewise separates approval policies from sandbox mode.
2. “Stop”, timeout, pause, archive, and delete have materially different persistence semantics. E2B pause preserves memory and processes; Daytona stop preserves container filesystem; Daytona volumes outlive deletion. Capability expiry must therefore bind to the actual terminal destruction event, not merely disconnect/stop/timeout.
3. Credential scoping is a separate concern from path/network isolation. Daytona explicitly claims revocation for ephemeral session credentials; the E2B lifecycle evidence does not claim arbitrary environment credentials are revoked on kill/pause. A broker that hands credentials to a child process must prevent reuse through preserved memory, mounted volumes, snapshots, forks, or later reconnects.
4. Shared persistent mounts and snapshots create confused-deputy paths: a sandbox with a capability can write durable data that a later sandbox/session (or a sibling sandbox sharing a volume) reads without possessing the original capability. Fork/snapshot features also copy state beyond the originating execution context.
5. Prompt injection can target the agent's approval reasoning. The controls documented above that are deterministic (kernel namespaces, filesystem/network sandbox, hook deny, credential revocation, terminal deletion) address different attack stages; “ask the model/user” alone does not constrain a subprocess that already has ambient authority.

