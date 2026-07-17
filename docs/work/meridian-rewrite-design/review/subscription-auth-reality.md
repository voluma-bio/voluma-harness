# Subscription-auth reality for coding-agent harnesses

**Research date:** 2026-07-16 (America/Chicago)
**Scope:** Current public documentation and source available on 2026-07-16, with dated announcements and terms from 2025–2026.

## Definitions

- **In-process:** the agent runtime itself performs the OAuth/device flow, stores or refreshes credentials, and sends model requests. It does not invoke a vendor CLI for inference.
- **Subprocess:** the runtime invokes the vendor's official CLI/client and delegates the subscription-backed session to it.
- **Works** and **is permitted/supported** are different. A third-party client can successfully use an endpoint while the provider reserves the right to change or block it.

## Executive result

| Subscription / integration | Can a non-vendor runtime technically use it in-process today? | Official-support qualification |
|---|---:|---|
| Claude Pro/Max | **Technically existed, but not a legitimate current path** | Anthropic explicitly prohibits third-party developers routing Claude.ai Free/Pro/Max credentials. For a subscription-backed third-party runtime, use the official Claude Code client as a subprocess, or use Anthropic API/cloud credentials in-process. |
| GitHub Copilot | **Yes** | OpenCode documents a GitHub device-login flow and model selection. GitHub officially documents Copilot CLI and selected GitHub-hosted partner agents, but I found no blanket authorization for arbitrary local clients such as OpenCode. |
| ChatGPT Plus/Pro | **Yes, technically** | OpenCode, Zed, Cline, and Pi implement OpenAI Codex/ChatGPT OAuth. OpenAI's public documentation officially documents this flow for Codex, not a general third-party harness contract. |
| xAI SuperGrok | **Yes, according to current OpenCode docs** | OpenCode documents browser/device OAuth for SuperGrok. I did not separately establish xAI's third-party-client terms in this pass. |
| Vendor API keys / cloud credentials | **Yes** | This is the normal supported in-process integration model. A subscription is not required; Anthropic separately distinguishes Claude subscriptions from Console API billing. |

The strongest current conclusion is therefore **not** “all subscriptions require the vendor CLI.” The practical split is: Anthropic Claude consumer OAuth is explicitly restricted; GitHub Copilot and ChatGPT OAuth are technically usable by third-party runtimes but have different levels of documented vendor support; xAI is documented by OpenCode as an OAuth provider.

## Claim-by-claim verification

### 1. OpenCode + Claude Pro/Max OAuth, in-process

**Status: REFUTED as a current, supported/legitimate capability; historically and in stale/current prose, the claim has a technical basis.**

The current OpenCode provider page (last-updated marker: **2026-07-16**) says that `/connect` can select “Claude Pro/Max (browser)” under Anthropic. The same page immediately warns that Anthropic explicitly prohibits plugins that let OpenCode use Claude Pro/Max and says those plugins were removed from OpenCode as of **1.3.0**: [OpenCode providers — Anthropic](https://opencode.ai/docs/providers) (accessed 2026-07-16). This is an internal documentation inconsistency, not evidence of a safe current integration.

Anthropic's current Claude Code legal/compliance documentation is unambiguous: OAuth credentials are intended for Claude.ai/Claude Code use, developers building products or services should use API credentials, and Anthropic does not permit third-party developers to offer Claude.ai login or route Free/Pro/Max credentials for their users. It also reserves enforcement without prior notice: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) (current page accessed 2026-07-16).

OpenCode issue reports also show the transition in practice: [issue #18950](https://github.com/anomalyco/opencode/issues/18950), opened **2026-03-24**, reports that v1.3.0 no longer exposed the prior Claude OAuth choices. An issue is not policy evidence, but it corroborates the documentation's “removed as of 1.3.0” statement.

**Conclusion:** OpenCode may still contain stale prose or a UI path around Anthropic, and older versions/plugins could perform the OAuth flow. That should not be treated as a current supported design. A local runtime should not ride Claude Pro/Max OAuth directly.

### 2. OpenCode + GitHub Copilot subscription

**Status: CONFIRMED technically; official authorization for arbitrary local third-party clients is UNCONFIRMED.**

OpenCode's current provider docs explicitly describe using a GitHub Copilot subscription: run `/connect`, complete GitHub's device login at `github.com/login/device`, then choose Copilot models; some models require Pro+. See [OpenCode providers — GitHub Copilot](https://opencode.ai/docs/providers) (current page accessed 2026-07-16).

This is an in-process provider integration in the harness, not a call to `gh` or an editor extension. OpenCode's provider/auth architecture stores credentials itself and the docs describe its auth storage under `~/.local/share/opencode/auth.json`: [OpenCode provider and authentication overview](https://opencode.ai/docs/providers) (current page accessed 2026-07-16).

GitHub officially documents OAuth device authentication for its own Copilot CLI, including keychain/config-file credential storage and token alternatives: [Authenticate Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli) (current page accessed 2026-07-16). GitHub also documents selected third-party coding agents, but the documented product is GitHub-hosted agent sessions installed as GitHub Apps, not arbitrary local clients: [About third-party coding agents](https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents) (current page accessed 2026-07-16).

**Conclusion:** OpenCode can currently use the Copilot subscription in-process. Whether GitHub's supported-product boundary includes every local third-party implementation is not established by the reviewed official pages.

### 3. OpenCode does not use a ChatGPT subscription

**Status: REFUTED.**

The current OpenCode OpenAI provider documentation lists two auth choices: browser sign-in with **ChatGPT Plus/Pro**, or manually entered API key: [OpenCode providers — OpenAI](https://opencode.ai/docs/providers) (current page accessed 2026-07-16).

The current OpenCode source implements the OAuth path in-process. Its built-in Codex auth plugin uses OpenAI's `auth.openai.com` issuer, the Codex responses endpoint at `chatgpt.com/backend-api/codex/responses`, PKCE/browser or device-code login, refresh-token handling, and the `ChatGPT-Account-Id` header: [OpenCode Codex auth plugin](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/codex.ts) (current `dev` source observed 2026-07-16). The same source also exposes API-key authentication as a separate option.

**Conclusion:** API keys remain supported, but “API keys only” is no longer accurate.

### 4. ChatGPT Plus/Pro coding is only possible through first-party Codex CLI

**Status: REFUTED as a factual statement about what third-party runtimes can do; QUALIFIED as a statement about what OpenAI officially documents and guarantees.**

OpenAI's official Codex README tells users to run `codex` and choose **Sign in with ChatGPT**, with Plus/Pro/Business/Edu/Enterprise plans listed as supported; API-key login is the alternative: [OpenAI Codex README](https://github.com/openai/codex/blob/main/README.md) (current repository page accessed 2026-07-16). OpenAI's app-server documentation describes a `chatgpt` managed-auth mode in which Codex owns the OAuth flow and refresh tokens, including browser and device-code paths: [Codex app-server authentication](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) (current repository page accessed 2026-07-16).

However, non-vendor runtimes demonstrably implement the same class of flow:

- OpenCode's built-in source uses the Codex OAuth client and endpoint cited above.
- Zed announced ChatGPT-account sign-in for its agent on **2026-05-15**, with usage aligned to Codex and no API key: [Zed — ChatGPT subscription in Zed](https://zed.dev/blog/chatgpt-subscription-in-zed) (2026-05-15).
- Cline's current CLI docs list “OpenAI Codex (ChatGPT subscription),” and its current changelog documents ChatGPT-subscription OAuth support for successive GPT/Codex releases: [Cline CLI overview](https://github.com/cline/cline/blob/main/docs/cline-cli/overview.mdx) and [Cline changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md) (current pages accessed 2026-07-16).
- Pi's current AI package documents OAuth providers including OpenAI Codex ChatGPT Plus/Pro: [Pi AI package README](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md) (current repository page accessed 2026-07-16).

OpenAI's dated product announcement confirms that ChatGPT sign-in was introduced for Codex CLI in **May 2025**, but does not promise a public general-purpose third-party subscription API: [Introducing Codex](https://openai.com/index/introducing-codex/) (2025-05-16; updated 2025-06-03).

**Conclusion:** A third-party harness can technically ride the ChatGPT/Codex OAuth flow in-process. It should not assume that OpenAI contractually promises compatibility for arbitrary clients: the official public documentation is centered on Codex and first-party surfaces. Model entitlements also change: see current reports such as [Codex issue #25839](https://github.com/openai/codex/issues/25839) (opened 2026-06-02).

### 5. Claude Code supports Claude subscription OAuth and API key

**Status: CONFIRMED.**

Anthropic's official Claude Code authentication documentation lists Claude.ai subscription credentials, Claude API credentials, Bedrock, Vertex, Microsoft Foundry, and other credential sources. It documents `/login` for Pro/Max/Team/Enterprise subscription OAuth and `claude setup-token` for a one-year OAuth token usable with the subscription: [Claude Code authentication](https://code.claude.com/docs/en/authentication) (current page accessed 2026-07-16).

Anthropic's setup guide separately describes Claude App Pro/Max subscription sign-in and Anthropic Console/API authentication: [Claude Code getting started](https://docs.anthropic.com/en/docs/claude-code/getting-started) (current page accessed 2026-07-16). Anthropic also states that Claude subscriptions and Console API usage are separate products/billing: [Why a Claude paid plan does not include API usage](https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console) (current help page accessed 2026-07-16).

**Conclusion:** Claude Code can use either subscription OAuth or API/cloud credentials. The fact that first-party Claude Code can do this does not grant a third-party harness the same right.

### 6. Current terms/enforcement posture

#### Anthropic Claude subscription OAuth

**Explicit prohibition; real rug-pull risk.** Anthropic's current legal page says third-party developers may not offer Claude.ai login or route Free/Pro/Max plan credentials on behalf of users and says enforcement can occur without prior notice: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) (current page accessed 2026-07-16). OpenCode's own current docs acknowledge the prohibition and say its prior Claude subscription plugins were removed in v1.3.0: [OpenCode providers](https://opencode.ai/docs/providers) (current page accessed 2026-07-16).

I found anecdotal account-risk reports in OpenCode's issue tracker, including [issue #6930](https://github.com/anomalyco/opencode/issues/6930) (opened **2026-01-05**) alleging an Anthropic OAuth account ban. It was closed and does not establish causation. The official prohibition alone is sufficient to classify direct Claude subscription OAuth as an unsafe design, rather than a tolerated integration.

#### GitHub Copilot subscription

**Technically available through OAuth; arbitrary-client authorization is not established.** GitHub officially supports Copilot CLI OAuth and documents selected third-party coding agents on GitHub-hosted workflows: [Copilot CLI authentication](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli) and [third-party coding agents](https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents), both current pages accessed 2026-07-16.

I found no current official GitHub page that specifically says “OpenCode is prohibited,” nor a blanket statement that any local third-party client is authorized to use the Copilot endpoint. GitHub's general Terms of Service reserve API enforcement, including temporary or permanent suspension for abuse/excessive requests: [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) (effective **2026-04-27**). Organization policy can also control Copilot availability in managed environments.

There is a practical quota risk even without an account block: [OpenCode issue #8030](https://github.com/anomalyco/opencode/issues/8030), opened **2026-01-12**, reports unexpectedly high premium-request consumption during OpenCode use. This is an issue report, not proof of a GitHub policy violation.

**Conclusion:** “Actively blocked” is UNCONFIRMED from primary sources. “Guaranteed tolerated” is also UNCONFIRMED. Treat it as a working integration with quota and policy-change risk, not a contractual guarantee.

#### OpenAI ChatGPT/Codex OAuth

**First-party flow is official; third-party guarantee is unconfirmed.** OpenAI officially documents ChatGPT sign-in for Codex CLI/app/server and supported ChatGPT plans: [Codex README](https://github.com/openai/codex/blob/main/README.md), [Codex app-server auth](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), and [Codex app announcement](https://openai.com/index/introducing-the-codex-app/) (2026-02-02; updated 2026-03-04 for Windows). I did not find a primary OpenAI source that authorizes arbitrary third-party harnesses to reuse the Codex OAuth client/endpoint, nor a primary source announcing a blanket block of OpenCode/Zed/Cline/Pi.

**Conclusion:** third-party use is empirically real, but its durability is implementation-dependent. Do not describe it as a stable public API contract.

## OpenCode's current provider/auth inventory

OpenCode's provider page says it uses AI SDK providers and Models.dev for 75+ providers, supports local models, and stores login credentials in its own auth file: [OpenCode providers](https://opencode.ai/docs/providers) (last-updated marker **2026-07-16**). The documented provider directory includes:

> 302.AI, Amazon Bedrock, Anthropic, Atomic Chat, Azure OpenAI, Azure Cognitive Services, Baseten, Cerebras, Cloudflare AI Gateway, Cloudflare Workers AI, Cortecs, DeepSeek, Deep Infra, DigitalOcean, FrogBot, Fireworks AI, GitLab Duo, GitHub Copilot, GMI Cloud, Google Vertex AI, Groq, Hugging Face, Helicone, llama.cpp, IO.NET, LM Studio, Moonshot AI, MiniMax, NVIDIA, Nebius Token Factory, Ollama, Ollama Cloud, OpenAI, OpenCode Zen, OpenRouter, LLM Gateway, SAP AI Core, STACKIT, OVHcloud AI Endpoints, Scaleway, Snowflake Cortex, Together AI, Venice AI, Vercel AI Gateway, xAI, Z.AI, ZenMux, and Custom.

This is the current docs directory, not a promise that every Models.dev entry has a separate page. The auth methods are grouped below; individual provider pages are the authority for exact configuration.

### Subscription/OAuth or account-login integrations

| Provider | Current documented method | Evidence / qualification |
|---|---|---|
| OpenAI | ChatGPT Plus/Pro browser OAuth; API key alternative; browser and device-code behavior is implemented in source | [OpenCode OpenAI provider](https://opencode.ai/docs/providers) and [Codex auth plugin source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/codex.ts), current pages/source observed 2026-07-16. |
| GitHub Copilot | GitHub device login, then model selection; entitlement varies by plan | [OpenCode GitHub Copilot provider](https://opencode.ai/docs/providers), current page accessed 2026-07-16. |
| xAI | SuperGrok browser OAuth or headless device-code flow; pay-as-you-go API key alternative | [OpenCode xAI provider](https://opencode.ai/docs/providers), current page accessed 2026-07-16. |
| GitLab Duo | Listed by OpenCode as a subscription that works with zero setup; exact account/token path varies by GitLab deployment | [OpenCode provider overview](https://opencode.ai/docs/providers), current page accessed 2026-07-16. Treat the exact OAuth semantics as **not fully confirmed** by the material collected here. |
| Anthropic | Current docs still contain a Claude Pro/Max browser phrase, but also explicitly say the subscription plugins are prohibited and removed as of 1.3.0 | [OpenCode Anthropic provider](https://opencode.ai/docs/providers) and [Anthropic legal page](https://code.claude.com/docs/en/legal-and-compliance), current pages accessed 2026-07-16. Do not use as a supported subscription path. |

DigitalOcean also documents OAuth for its account/model-access integration, but this is an account authorization method, not a consumer coding subscription: [OpenCode DigitalOcean provider](https://opencode.ai/docs/providers) (current page accessed 2026-07-16).

### API keys, tokens, or cloud-provider credentials

OpenCode's cloud providers generally use an API key, bearer token, provider credential chain, or an OpenAI-compatible endpoint. Examples documented on the current page:

- Amazon Bedrock: bearer token or AWS credential chain (access keys, profile, role, web identity, and related AWS mechanisms).
- OpenAI: API key is supported alongside ChatGPT OAuth.
- Z.AI Coding Plan: API key, not a consumer OAuth subscription flow.
- Custom provider: OpenAI-compatible `baseURL`, model definitions, optional API key, and custom headers.
- The remaining hosted providers in the directory—302.AI, Azure OpenAI, Azure Cognitive Services, Baseten, Cerebras, Cloudflare, Cortecs, DeepSeek, Deep Infra, Fireworks, GMI Cloud, Groq, Hugging Face, Helicone, IO.NET, Moonshot, MiniMax, NVIDIA, Nebius, Ollama Cloud, OpenCode Zen, OpenRouter, LLM Gateway, SAP AI Core, STACKIT, OVHcloud, Scaleway, Snowflake, Together, Venice, Vercel AI Gateway, and ZenMux—are documented as provider integrations rather than consumer-subscription OAuth paths. Their exact key/token names are provider-specific.

See the [OpenCode provider directory](https://opencode.ai/docs/providers) (current page accessed 2026-07-16) and [OpenCode CLI auth commands](https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/cli.mdx) (current source page accessed 2026-07-16).

### Local providers

OpenCode documents local endpoints for Atomic Chat (`localhost:1337`), llama.cpp (`localhost:8080`), LM Studio (`localhost:1234`), and Ollama (`localhost:11434`): [OpenCode local provider pages](https://opencode.ai/docs/providers) (current page accessed 2026-07-16). These do not consume a vendor subscription or require a vendor CLI subprocess. Local/custom OpenAI-compatible servers can also be configured through the Custom provider.

## Other agents using non-Claude subscriptions in-process

The following are current primary-source examples, not claims that every version supports every plan/model:

1. **Zed — ChatGPT Plus/Pro.** Zed's **2026-05-15** announcement says users can sign in to Zed's agent with a ChatGPT account and use OpenAI models with the same usage as Codex, without an API key: [Zed announcement](https://zed.dev/blog/chatgpt-subscription-in-zed). Its current subscription matrix also lists ChatGPT Plus/Pro and GitHub Copilot as existing-subscription integrations: [Zed — use an existing subscription](https://zed.dev/docs/ai/use-an-existing-subscription) (current page accessed 2026-07-16).
2. **Cline — ChatGPT/Codex subscription.** Cline's current CLI provider list includes “OpenAI Codex (ChatGPT subscription),” and the current changelog documents OAuth-backed GPT/Codex subscription support: [Cline CLI overview](https://github.com/cline/cline/blob/main/docs/cline-cli/overview.mdx) and [Cline changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md) (current pages accessed 2026-07-16).
3. **Pi — ChatGPT/Codex and GitHub Copilot subscriptions.** Pi's current AI package README lists OAuth helpers/providers for Anthropic Claude Pro/Max, OpenAI Codex ChatGPT Plus/Pro, and GitHub Copilot: [Pi AI package README](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md) (current repository page accessed 2026-07-16). The Claude entry is technically informative but conflicts with Anthropic's current prohibition; it should not be treated as a permitted deployment model.
4. **Zed — GitHub Copilot.** Zed's current subscription page lists Copilot Chat as an existing-subscription provider, and Zed's original **2023-04-20** announcement described device-code authentication for Copilot: [Zed subscription matrix](https://zed.dev/docs/ai/use-an-existing-subscription) and [Zed Copilot announcement](https://zed.dev/blog/copilot) (current page / 2023-04-20 announcement accessed 2026-07-16).

I found no current primary Aider source establishing a Copilot- or ChatGPT-subscription OAuth integration. Aider's API-key/OpenAI-compatible configuration should not be extrapolated into subscription support.

## Implication for `voluma-harness`

### Native in-process options

- **ChatGPT Plus/Pro:** technically possible using the Codex OAuth flow, as shown by current OpenCode source and multiple other agents. The implementation should be isolated behind a provider adapter and treated as compatibility-sensitive, not as a stable public OpenAI API guarantee.
- **GitHub Copilot:** technically possible through the documented device flow used by OpenCode. The runtime needs its own auth storage/refresh and must account for plan entitlements, quotas, organization policies, and possible endpoint-policy changes.
- **xAI SuperGrok:** current OpenCode documentation describes a native OAuth flow; independently verify xAI terms before shipping a general third-party integration.
- **API/cloud credentials and local models:** normal supported in-process choices; these are not subscription OAuth.

### Subscription options that should use an official client subprocess

- **Claude Pro/Max:** if the product requirement is to consume the consumer subscription rather than pay for API usage, Anthropic's current policy points to Claude Code/native Anthropic apps. A harness should invoke Claude Code (or another permitted first-party surface) rather than impersonate its OAuth client. The alternative is an Anthropic Console/cloud API credential in-process.

### What remains unconfirmed

- I found no primary OpenAI statement granting arbitrary third-party runtimes permission to use Codex OAuth, and no primary OpenAI statement specifically blocking OpenCode, Zed, Cline, or Pi.
- I found no primary GitHub statement specifically authorizing or prohibiting OpenCode as a local Copilot client. GitHub documents its own CLI and selected hosted partner agents, which is narrower than “any harness.”
- I did not independently verify xAI's current consumer-subscription terms for third-party OAuth clients.
- Provider support and model entitlements are volatile. A passing OAuth flow does not guarantee access to every model advertised by a plan.

## Sources consulted

Primary sources are linked inline above. The key source set is:

- [OpenCode provider documentation](https://opencode.ai/docs/providers), current/last-updated 2026-07-16.
- [OpenCode Codex OAuth source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/codex.ts), current `dev` source observed 2026-07-16.
- [Anthropic Claude Code authentication](https://code.claude.com/docs/en/authentication), current page observed 2026-07-16.
- [Anthropic Claude Code legal/compliance](https://code.claude.com/docs/en/legal-and-compliance), current page observed 2026-07-16.
- [OpenAI Codex README](https://github.com/openai/codex/blob/main/README.md) and [Codex app-server auth](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), current pages observed 2026-07-16.
- [GitHub Copilot CLI authentication](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli), current page observed 2026-07-16.
- [GitHub third-party coding agents](https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents), current page observed 2026-07-16.
- [Zed ChatGPT subscription announcement](https://zed.dev/blog/chatgpt-subscription-in-zed), 2026-05-15.
- [Cline CLI overview](https://github.com/cline/cline/blob/main/docs/cline-cli/overview.mdx) and [Cline changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md), current pages observed 2026-07-16.
- [Pi AI package README](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md), current page observed 2026-07-16.
