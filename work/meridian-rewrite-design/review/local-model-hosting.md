# Local model hosting for `voluma-local`

**Research snapshot: 2026-07-16.** This document evaluates local inference
runtimes for a TypeScript, offline-first daemon whose `AgentDriver` needs
OpenAI-shaped requests, tool calls, and schema-valid results. A runtime can
produce syntactically valid JSON without making a good tool decision; those are
separate requirements. Likewise, a grammar constrains decoding but does not
make an untrained model reliable at agent loops.

## Decision summary

Use **Ollama as the default managed runtime**, but make the driver endpoint-first
and runtime-neutral. Detect an already-running endpoint before offering to start
anything. Offer optional managed child-process mode for Ollama and
`llama-server`; accept externally managed LM Studio, Jan, LocalAI, vLLM,
SGLang, TGI, Foundry Local, and any conforming OpenAI-compatible server. For a power-user GPU,
document **vLLM or SGLang**; for Apple Silicon, document **MLX-backed serving**
but retain `llama-server` as the strict-schema fallback.

This is deliberately not a single-runtime abstraction. Ollama has the best
download-and-run experience, while `llama-server`, vLLM, SGLang, and MLX have
different strengths in constrained decoding, batching, hardware, and model
format. The local product should expose a capability report rather than assume
that every `/v1` endpoint implements the same subset.

## Comparison

Legend: **enforced** means the server masks decoding with a grammar/schema;
**best-effort** means a model/template/parser is asked to emit a tool call and
the client must validate it. “Memory” is approximate model-weight memory for a
4-bit quant; KV cache, context length, runtime overhead, and concurrent requests
are additional.

| Runtime | OpenAI-compatible HTTP API | Tool calling and constrained output | Concurrency | macOS / Linux / Windows | Model management and distribution DX | Runtime license | Footprint and quantization |
|---|---|---|---|---|---|---|---|
| **Ollama** | Strong `/v1/chat/completions`, JSON mode, tools, and Responses API; some fields are intentionally only partial compatibility ([API docs](https://docs.ollama.com/api/openai-compatibility), updated 2026). | Tools are model/template-dependent; local API supports tools and parallel tool calls. JSON schema through `format` is enforced by the local backend; `/v1` exposes JSON mode/`response_format`, but validate arguments in the driver ([tools](https://docs.ollama.com/capabilities/tool-calling), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs)). | Queues by default (`OLLAMA_NUM_PARALLEL=1`); supports per-model parallel requests and a configurable queue, but memory scales with parallelism × context ([FAQ](https://docs.ollama.com/faq)). | **Native all three**; installers and app/CLI are especially approachable. | Best in class: `pull`, `run`, `list`, named model library, Modelfiles, official Docker image. Works offline after install/pull. | **MIT** for the repository ([license](https://github.com/ollama/ollama/blob/main/LICENSE)); model licenses still apply. | GGUF/llama.cpp family; CPU, CUDA, ROCm, Metal, Vulkan paths. Q4 7–9B is laptop-sized; 20–35B Q4 usually wants 16–24+ GB usable memory. |
| **llama.cpp / `llama-server`** | Direct OpenAI-compatible chat, Responses, embeddings, and Anthropic-compatible routes ([server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)). | Strongest portable strictness: JSON Schema/GBNF grammar, Jinja chat templates, and tool parsing. Function calling has a generic fallback, but native templates are better; parallel tool calls are model/template-dependent. JSON Schema is a decoding constraint, not prompt instruction ([grammar notes](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)). | Parallel decoding, slots, continuous batching, multi-user support; explicit `--parallel` controls slots. | **Native all three**, including CPU and Apple Metal; broad CUDA/ROCm/Vulkan/SYCL support. | A binary plus a GGUF path is simple and reproducible, but it does not provide Ollama-like model discovery/pull. Use Hugging Face/GGUF manifests or an app-level model catalog. | **MIT** ([repository](https://github.com/ggml-org/llama.cpp)); bundled third-party/model terms must be tracked. | GGUF, CPU/GPU offload, Metal, CUDA, ROCm, Vulkan; usually the lowest-friction strict local path. Q4_K_M is the practical default; Q5/Q6 improve tool quality when memory permits. |
| **LM Studio** | OpenAI and Anthropic-compatible local server; default port 1234; headless `llmster` is available ([server](https://lmstudio.ai/docs/developer/core/server), [headless/CLI](https://lmstudio.ai/docs/cli)). | JSON Schema is enforced: GGUF uses llama.cpp grammars and MLX uses Outlines. Tool calls are parsed from model text, so small or non-tool-trained models can still fail ([structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output), [tools](https://beta.lmstudio.ai/docs/developer/openai-compat/tools)). | llama.cpp engine has continuous-batching parallel requests; default max concurrent predictions is 4 when configured. MLX parallel support has lagged the GGUF path ([parallel requests](https://lmstudio.ai/docs/app/advanced/parallel-requests)). | **Native all three**; desktop UX is the smoothest, with a headless Linux/server path. | Excellent GUI/CLI Hub: `lms get`, `ls`, `load`, `unload`, server control; model identifiers can be stable aliases. | **Proprietary app terms**: personal/internal-business use, no redistribution or embedding; `lms` itself is MIT ([terms](https://lmstudio.ai/app-terms), [CLI](https://lmstudio.ai/docs/cli)). Do not bundle the app. | GGUF and MLX; GPU split/offload, CPU fallback. Very good 4–35B laptop workflow, but GUI/runtime download and commercial redistribution constraints matter. |
| **vLLM** | Mature OpenAI-compatible server plus Anthropic/gRPC options ([official docs](https://docs.vllm.ai/en/latest/)). | Strong guided decoding via XGrammar/Guidance and model-specific tool/reasoning parsers; schema constraints are enforced when configured. Tool parser and `--enable-auto-tool-choice` must match the model. | Best-in-class GPU serving: PagedAttention, continuous batching, prefix caching, tensor/data parallelism; built for many simultaneous agents. | **Linux-first**: NVIDIA/AMD/CPU production paths. Windows generally means WSL/Docker; Apple Silicon is experimental CPU-only rather than Metal GPU ([CPU/macOS notes](https://docs.vllm.ai/en/stable/getting_started/installation/cpu/index.html)). | Pulls Hugging Face safetensors on start; excellent reproducibility with Docker/containers, less friendly for a first-time laptop user. | **Apache-2.0** ([repository](https://github.com/vllm-project/vllm)); verify CUDA/PyTorch and model licenses separately. | Safetensors, AWQ/GPTQ, FP8/FP16/BF16 and other GPU formats; not a GGUF-first runtime. Best for 24–80+ GB GPUs and multi-GPU servers; 20–35B AWQ/GPTQ is feasible on a 24 GB card with context headroom. |
| **SGLang** | OpenAI-compatible server and clients ([docs](https://docs.sglang.io/)); model-specific parsers are explicit server settings. | Excellent enforced structured output: XGrammar default supports JSON Schema, regex, and EBNF; Outlines/llguidance alternatives. Tool calls still require the right parser/template ([structured outputs](https://sgl-project.github.io/advanced_features/structured_outputs.html), [server arguments](https://sgl-project.github.io/advanced_features/server_arguments.html)). | Production-grade low-latency/high-throughput serving with continuous batching, RadixAttention/prefix caching, and multi-GPU parallelism. | **Linux GPU/server-first** (NVIDIA, AMD, Intel/other accelerator support is expanding); not a native macOS/Windows laptop default. | Hugging Face/ModelScope plus Docker; powerful but Python/CUDA setup-heavy. | **Apache-2.0** ([repository](https://github.com/sgl-project/sglang)). | Safetensors, FP8/BF16/FP16 and GPU quantization; ideal for 24 GB+ NVIDIA/AMD and multi-GPU. |
| **MLX / `mlx-lm`** | `mlx_lm.server` is intended as a local OpenAI-compatible HTTP endpoint, not a general production gateway ([project](https://github.com/ml-explore/mlx-lm), maintainers' 2025 server discussion). | Chat templates can express tool calls, but `mlx-lm` does **not** provide the same general grammar/schema enforcement as llama.cpp; use prompt + validation/retry, or LM Studio/another Outlines layer. A 2026 comparison found `mlx_lm` did not enforce JSON Schema ([study](https://arxiv.org/abs/2604.18566)). | Python batch generation exists, but standalone server concurrency and production controls are less mature than vLLM/SGLang; use LM Studio/MLX serving wrappers for multi-agent batching. | **Apple Silicon only** (Metal/unified memory); not a cross-platform runtime. | Hugging Face/MLX Community models; `mlx_lm.convert` quantizes/uploads models. Good developer DX on Mac, but Python environment is part of the cost. | **MIT** ([license](https://github.com/ml-explore/mlx-lm/blob/main/LICENSE)). | MLX 4/8-bit weights and Apple unified memory; often the fastest/most memory-efficient Mac path. 7–9B 4-bit fits 8–16 GB; 27–35B 4-bit wants roughly 24–48 GB unified memory depending on context. |
| **LocalAI** | OpenAI and Anthropic-compatible core with a broad API surface ([overview](https://localai.io/docs/overview/index.html)). | Backend-dependent function calling; llama.cpp models support JSON mode and `grammar_json_functions`, while other backends vary. Treat as an adapter/orchestrator, not one invariant decoder ([features](https://localai.io/features/index.print.html)). | Backend-dependent; can use llama.cpp, vLLM, MLX, and other backends. Good queue/API layer, but throughput and schema semantics inherit the selected backend. | Linux/macOS binaries; Windows through WSL or containers; Docker/Podman works on all three ([installation](https://localai.io/installation/)). | Model gallery, YAML model configs, containers, and universal loaders; broader but more moving parts than Ollama. | **MIT** ([repository](https://github.com/mudler/LocalAI)). | GGUF and several backend formats; CPU/GPU options are broad. A useful compatibility layer when one endpoint must host text, vision, audio, and embeddings, not the leanest coding-agent runtime. |
| **Jan** | Local server at `/v1` (current CLI default 6767; older docs also mention 1337); auto-detects llama.cpp or MLX ([CLI](https://www.jan.ai/docs/desktop/cli), [custom endpoints](https://www.jan.ai/docs/desktop/remote-models/custom-endpoint)). | Tool support follows the selected llama.cpp/MLX engine. llama.cpp can enforce grammars; MLX path is less strict. Agent wiring/MCP is a product strength, not a guarantee that every model emits valid calls. | llama.cpp router/slots can serve parallel requests; MLX path is less established. | **Native all three** desktop app with offline operation. | Good Hub/model downloader and the `jan` CLI; downloads from desktop are reusable by server. | **Apache-2.0**, with attribution requested ([license](https://github.com/janhq/jan/blob/main/LICENSE)). | GGUF and MLX; laptop-friendly. A credible GUI alternative to Ollama/LM Studio and useful for users already in the Jan ecosystem. |
| **llamafile** | Bundles a llama.cpp-based local server and can expose OpenAI-style endpoints, but API surface/version is tied to the produced executable. | Inherits the bundled llama.cpp grammar/tool support; enforced when configured, template-dependent for tools. | Inherits llama.cpp server slots/batching, but each packaged file normally targets one model/runtime build. | **Strongest single-file portability**: macOS, Windows, Linux, and BSD/Unix variants ([Mozilla docs](https://mozilla-ai.github.io/llamafile/)). | Superb distribution (one executable, weights can be embedded); weak discovery/version management for a model catalog. | Project **Apache-2.0**; changes to llama.cpp/whisper.cpp **MIT** ([license](https://github.com/mozilla-ai/llamafile)). Embedded model license/notice must travel with the file. | GGUF embedded or alongside; excellent for a pinned demo/smoke test. Large embedded artifacts are inconvenient for normal model updates. |
| **Microsoft Foundry Local** *(additional 2026 candidate)* | Optional OpenAI-compatible HTTP endpoint plus native JavaScript/Python/C#/Rust SDKs ([GA announcement](https://devblogs.microsoft.com/foundry/foundry-local-ga/), [repository](https://github.com/microsoft/Foundry-Local)). | Native SDK supports tool calling, but strict grammar/GBNF enforcement is not documented as a general runtime guarantee; early releases documented one-tool-call limits and streaming issues ([release history](https://github.com/microsoft/Foundry-Local/releases)). Keep it out of the strict tier until the fixture passes. | Core manages model lifecycle/inference, but public documentation does not establish vLLM/SGLang-style continuous batching controls. | **Windows, macOS Apple Silicon, Linux x64**; Linux ARM64 is a newer target. | Excellent curated catalog, automatic hardware-optimized model selection, versioning, download/load/unload; lightweight native runtime (~20 MB). | Foundry Local SDK **MIT**; CLI has Microsoft Software License Terms; each model has separate terms ([license notes](https://github.com/microsoft/Foundry-Local)). | ONNX Runtime/WinML acceleration across CPU/GPU/NPU; curated optimized models rather than arbitrary GGUF/MLX. Especially interesting for Windows NPUs and embedded product scenarios. |
| **TGI (Hugging Face)** | OpenAI-compatible chat/tool APIs through Hugging Face clients; API is less drop-in than vLLM for current agent stacks. | Guidance/Outlines can enforce JSON/regex grammars and tool schemas ([guidance](https://huggingface.co/docs/text-generation-inference/main/basic_tutorials/using_guidance)). | Continuous batching, tensor parallelism, paged/flash attention, and quantization; server/GPU oriented. | Linux/CUDA/container-first; not a native Mac/Windows laptop option. | Hugging Face Hub and Docker; strong production packaging, but the docs now point users toward vLLM/SGLang and other downstream engines for this direction ([overview](https://huggingface.co/docs/text-generation-inference/index)). | **Apache-2.0** ([repository](https://github.com/huggingface/text-generation-inference)). | Safetensors, bitsandbytes/GPTQ and GPU formats; practical for Linux GPU fleets, not GGUF/Metal laptops. |
| **KoboldCpp** | OpenAI-compatible endpoint exists, but the project calls some of it not-recommended and its native `/api/v1/generate` is raw text ([issue](https://github.com/LostRuins/koboldcpp/issues/1448)). | Grammar sampler can constrain JSON; native, reliable OpenAI tool semantics are not its primary contract. | Multi-user/server support exists, but it is not a throughput-focused continuous-batching platform. | Excellent one-file Windows/macOS/Linux usability. | One-file GGUF loader and UI; little formal model registry/versioning. | **AGPL-3.0** for KoboldCpp/KoboldAI Lite; llama.cpp dependency is MIT ([license](https://github.com/LostRuins/koboldcpp)). Shelling out is easy; embedding/distributing in a proprietary product needs copyleft review. | GGUF, CPU/CUDA/Metal/Vulkan-style consumer hardware; very good for hobbyist single-user inference, weaker fit for a typed agent protocol. |
| **text-generation-webui / TextGen** | OpenAI/Anthropic-compatible Chat, Completions, and Messages endpoints with tool calling ([repository](https://github.com/oobabooga/text-generation-webui)). | Tool calling is exposed, but correctness depends on backend, chat template, and model; grammar/guidance support varies by backend. Do not claim universal schema enforcement. | Backend-dependent (llama.cpp, Transformers, ExLlamaV3, TensorRT-LLM); can be concurrent, but not a single predictable batching contract. | Portable builds/one-click installers for all three. | Strong UI and multiple backends; model downloads are hands-on and the stack is broad. | Check the current repository/package license before embedding; its UI/source and bundled components have varied terms over time. Prefer shelling out to a user-installed copy rather than redistributing. | GGUF, GPTQ/AWQ/EXLlama/Transformers/TensorRT formats; broad hardware reach but higher operational complexity. |

### What the table means for the hard requirement

The runtimes fall into three useful groups:

1. **Portable strict decoding:** `llama-server` (GBNF/JSON Schema), Ollama's
   local backend for JSON schema, and LM Studio's GGUF path. These are the
   cross-platform choices for an offline laptop product.
2. **GPU serving with explicit guided decoding:** vLLM (XGrammar/Guidance)
   and SGLang (XGrammar). These are the choices for several simultaneous
   agents, not first-run laptop installers.
3. **Compatibility/UI layers:** LocalAI, Jan, LM Studio, Foundry Local,
   TextGen, and KoboldCpp. Their semantics inherit a backend and a model
   template; the driver must interrogate capabilities and validate every tool
   call.

No runtime can guarantee that a model chooses the semantically correct tool.
Schema enforcement guarantees shape, not intent. Keep a bounded validation /
repair path, reject unknown tool names, enforce per-tool argument schemas, and
record the runtime/model/template in telemetry that stays local.

## Ranked deployment shapes

### (a) Easiest embedded default: Ollama

1. **Ollama** — best install/pull/run DX across the three operating systems,
   stable local HTTP endpoint, official JavaScript client, and a model library.
   Its documented local tool loop includes single, parallel, streaming, and
   multi-turn tools. Set a conservative default (`OLLAMA_NUM_PARALLEL=2` or
   hardware-derived) rather than assuming unlimited concurrency.
2. **LM Studio** — better GUI and schema UX for humans, but proprietary app
   terms make it unsuitable to bundle and its server must be enabled/managed.
3. **Jan** — Apache-licensed and genuinely offline, with a promising CLI/server
   path, but it is less ubiquitous and its backend-dependent tool semantics are
   not a reason to replace Ollama as the default.

The default should not silently download a large model. On first run, detect
RAM/VRAM, show a recommended model and estimated disk/memory, ask for consent,
then `pull` it. A tiny smoke-test model can be offered separately.

### (b) High-throughput / multi-agent GPU: vLLM, then SGLang

1. **vLLM** — default power-user recipe: broad model support, continuous
   batching, cache reuse, multi-GPU parallelism, mature OpenAI server, and
   model-specific tool parsers. Recommended for NVIDIA/AMD Linux or WSL/Docker.
2. **SGLang** — use where XGrammar, prefix-cache-heavy workflows, newer MoE
   models, or SGLang's model-day support is more valuable. Its constrained
   decoding story is exceptionally direct, but installation/model-specific
   parser setup is more demanding.
3. **TGI** — still viable for an existing Hugging Face deployment, but new
   local-agent documentation should point first to vLLM/SGLang because TGI's
   current docs recommend those downstream engines for structured-generation
   direction.

Use AWQ/GPTQ/FP8/BF16 according to GPU memory and quality target. A 24 GB GPU
can host a 20–35B 4-bit model with modest context; 48–80 GB enables larger
models and several concurrent contexts. Benchmark *agent-loop throughput*, not
single-request tokens/second: prefill, tool pauses, KV cache, and scheduler
fairness dominate perceived multi-agent speed.

### (c) Apple-Silicon-optimal: MLX serving, with llama.cpp fallback

1. **MLX / `mlx-lm`** — native Metal and unified-memory execution; MLX 4-bit
   weights are usually the best speed/memory choice on M-series Macs. Use a
   maintained MLX HTTP wrapper that supports the needed concurrency, or LM
   Studio's MLX engine if a GUI/headless product is acceptable.
2. **llama.cpp / LM Studio GGUF** — choose this when strict JSON Schema/GBNF is
   more important than peak Mac throughput. `llama-server` is also the most
   reproducible child process because it is a small native binary.
3. **Ollama** — simplest cross-platform fallback and often good enough; it may
   use Metal, but it is a management layer rather than the Apple-specific
   performance choice.

Do not make raw `mlx_lm.server` the only Apple integration: its own maintainers
describe it as a local HTTP endpoint and tool-calling support is still a moving
target. Capability negotiation should route strict structured calls to
llama.cpp or an Outlines-backed server when necessary.

## Integration posture: both, with endpoint-first ownership

Implement two modes behind one `LocalModelProvider`:

```text
configured endpoint
        |
        v
probe /v1/models + health + capability test
        | success
        v
use endpoint without owning its process

no usable endpoint
        |
        v
optional managed adapter (Ollama or llama-server)
  -> locate/install prerequisite (never silently install)
  -> pull/verify selected model
  -> spawn process group and wait for readiness
  -> use endpoint
  -> stop only processes recorded as ours
```

### Why not always spawn?

* Users commonly already run Ollama, LM Studio, Jan, or a GPU server for
  multiple applications. Starting another server wastes memory and can make
  the machine thrash.
* vLLM/SGLang are normally managed by Docker, systemd, a scheduler, or a
  remote workstation. The daemon should be able to connect without knowing how
  they were launched.
* A user-owned endpoint has independent model lifecycle, logs, upgrades, and
  security policy. Voluma must not kill it or mutate its model selection.

### What managed mode should own

Managed mode should be opt-in or explicitly approved and should:

* use a runtime-specific adapter (`ollama`, `llama-server`, later `jan`), not
  shell-string concatenation;
* allocate a private port and a per-project runtime directory;
* spawn a process group, capture stdout/stderr, poll `/health` and `/v1/models`,
  and expose startup/download progress;
* persist a PID, start token, runtime version, model digest, and ownership
  marker; on restart, recover only a process matching those facts;
* send `SIGTERM`/native shutdown on normal exit and leave user-owned daemons
  untouched;
* never require network at inference time. Model pulls are a separate explicit
  operation and should support an offline local file/import path.

### AgentDriver contract

Keep the core request on a narrow OpenAI Chat Completions subset (`messages`,
`tools`, `tool_choice`, streaming, `response_format`, usage). Add a runtime
capability record such as:

```ts
type LocalCapabilities = {
  chatCompletions: boolean;
  responses: boolean;
  tools: "native" | "parsed" | "none";
  structuredOutput: "grammar" | "outlines" | "json-mode" | "prompt-only" | "none";
  parallelRequests: boolean;
  parallelToolCalls: boolean;
  vision: boolean;
  modelIds: string[];
};
```

Probe behavior, not only version strings: send a tiny schema/tool canary with
an impossible-to-execute tool, assert the response shape, and cache the result
per endpoint/model/template. For every agent turn:

1. validate tool names and arguments against the local schema;
2. reject malformed/unknown calls rather than executing them;
3. retry at most once with a repair prompt or a stricter endpoint mode;
4. disable parallel tool calls when strict schema guarantees and the selected
   model/runtime cannot safely combine them (OpenAI's own Structured Outputs
   documentation calls out this limitation ([source](https://openai.com/index/introducing-structured-outputs-in-the-api/)));
5. maintain an offline circuit breaker so a cloud sync failure cannot block the
   local agent loop.

## Model recommendations for agentic tool use

These are model families to test, not unconditional quality guarantees. Use the
model's official chat template and the runtime's matching tool parser. The
quant/memory numbers below are engineering estimates for weights plus modest
runtime headroom; long contexts and concurrent agents require more.

| Tier | Model | Why it is relevant | Practical local shape |
|---|---|---|---|
| Default 8–16 GB | **Qwen3.5 4B/9B** or **Qwen3 8B** instruct | Qwen3's official release includes tool/MCP integration and Apache-2.0 dense sizes; Qwen3.5 is the newer multimodal-agent line. Prefer the newer family when the selected runtime has a correct template/parser. | 4-bit GGUF/MLX, roughly 3–6 GB weights; reserve 8–16 GB total. Good for short tool schemas and lightweight coding, not long autonomous loops. |
| Default 16 GB | **gpt-oss-20b** | OpenAI explicitly describes native function calling and structured outputs; 21B total/3.6B active, Apache-2.0, designed for local/low-latency use, with a stated 16 GB memory target ([model page](https://developers.openai.com/api/docs/models/gpt-oss-20b), 2025). | Use the runtime's official MXFP4/GGUF/quant build; plan on about 14–16 GB including runtime/KV for moderate context. Strong general agent candidate; verify parser/template in each server. |
| 16–24 GB | **Qwen3-Coder-30B-A3B-Instruct** | Specifically trained for agentic coding and a special function-call format; 30.5B total/3.3B active, Apache-2.0, 256K native context ([model card](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct), 2025). | Q4 GGUF/MLX is roughly 18–22 GB once runtime/KV headroom is included; 24 GB unified memory/GPU is the practical floor for useful context. Good power-laptop choice, but all expert weights are resident despite low active parameters. |
| 16–24 GB | **Devstral Small 2 24B** | Mistral recommends it for local use; it is dense 24B and tuned for agentic/code tasks. Devstral's model documentation exposes function calling and structured outputs; Mistral's offline guide provides vLLM parser flags ([offline guide](https://docs.mistral.ai/vibe/code/cli/offline-models), [model card](https://docs.mistral.ai/models/model-cards/devstral-small-1-0-25-05)). | Q4 GGUF/MLX about 14–18 GB weights, usually 20–24 GB usable memory with context. A strong code-agent candidate; use the correct `mistral` parser in vLLM. |
| 24–48 GB | **Qwen3.6-27B** or **Qwen3.6-35B-A3B** | 2026 Qwen open-weight releases target agentic coding; the official repo lists llama.cpp and MLX support and Apache-2.0 model weights ([Qwen3.6 repo](https://github.com/QwenLM/Qwen3.6), [27B release](https://qwen.ai/blog?id=qwen3.6-27b)). | Q4 GGUF/MLX roughly 16–24 GB weights; 24 GB is a floor, 32–48 GB is more comfortable for long context/concurrency. Prefer Qwen3.6 over older Qwen3 where the runtime's tool template is verified. |
| 24–48 GB | **Gemma 4 26B-A4B / 31B** | Google documents native function calling, structured JSON, coding, 128K–256K context, and laptop/consumer-GPU quantized deployment ([announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/), 2026). | 4-bit weights are approximately 16–22 GB; use a runtime with current Gemma 4 template/parser support. Check Gemma's model terms/usage policy separately from the MIT/Apache runtime. |
| 48–80+ GB | **Qwen3-Coder 480B-A35B**, **Qwen3.5/3.6 large**, **gpt-oss-120b**, **DeepSeek-R1 distill 70B** | Better long-horizon reasoning/tool selection, but these are workstation/server models, not the default laptop download. Qwen3-Coder 480B reports state-of-the-art open-model agentic coding/tool use ([release](https://qwenlm.github.io/blog/qwen3-coder/)); gpt-oss has native tool/structured capabilities ([OpenAI](https://openai.com/index/introducing-gpt-oss/)). | FP8/AWQ/GPTQ or high-quality 4-bit, multi-GPU or 80–96 GB unified memory. DeepSeek-R1 distills are reasoning models; do not choose them solely for tool use without a real agent-loop benchmark. |

### What “reliable” means in practice

The most defensible laptop shortlist is **gpt-oss-20b**, **Qwen3-Coder-30B-
A3B-Instruct**, and **Devstral Small 2** at 16–24 GB, with **Qwen3.6-27B / 
35B-A3B** and **Gemma 4 26B-A4B** as the newer 24–48 GB tier. They are
tool/agent-trained models with official function-calling claims or agentic
coding guidance, not merely general chat models. **Qwen3 8B/14B** and
Qwen3.5 4B/9B are sensible low-memory fallbacks, but expect more retries and
shorter tool schemas.

Published independent spot checks are directionally useful but not a product
gate: one March 2026 13-model test reported 85% tool-call success for gpt-oss
20B on its own harness ([results](https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/));
another 2026 community test reported high pass rates for Qwen3-Coder 30B and
Qwen3 32B but did not establish a shared benchmark protocol
([report](https://www.promptquorum.com/power-local-llm/best-local-models-tool-calling-2026)).
Treat these as leads, not guarantees. A 2026 study also found that constraining
decoding can suppress tool invocation for some open models—the “constraint
tax”—so blindly adding a JSON grammar can reduce agent quality even while it
improves syntactic validity ([study](https://arxiv.org/abs/2606.25605)).

### Models to treat cautiously

* **DeepSeek-R1 and its distills:** excellent reasoning and useful 7B/14B/32B
  local sizes, but the base R1 is not the first choice for a tool-call contract;
  the official card documents a special template and distill lineage/licenses.
  Prefer a tool-tuned Qwen/Coder/Devstral/Gemma family for coding-agent turns,
  or use R1 as a planner with strict validation.
* **Plain Llama 3.x instruct:** broad runtime support and good general quality,
  but not as consistently tool-oriented as the current coder/agent families at
  the same size. Use when an existing deployment already standardizes on it.
* **Sub-7B or heavily quantized models:** a grammar can make JSON parseable, but
  smaller models often select the wrong tool, omit required arguments, or fail
  after several turns. Include a canary and a bounded retry policy in the
  product rather than advertising “schema enforcement” as agent reliability.
* **Qwen3.5/3.6 and Gemma 4 early integrations:** current templates, reasoning
  markers, and parser behavior are still moving. Pin known-good model revision,
  runtime version, and parser settings in the compatibility matrix; do not infer
  compatibility from a successful plain chat request.

## Licensing and distribution notes

Runtime license and model license are independent. The permissive runtimes in
the recommended path (Ollama MIT, llama.cpp MIT, vLLM/SGLang Apache-2.0,
MLX/MLX-LM MIT, Jan Apache-2.0, LocalAI MIT, llamafile Apache-2.0/MIT) can be
*invoked as separate processes* without making `voluma-local` a derivative
work. Still ship notices for anything redistributed and record the model's
license. Do not embed LM Studio's proprietary app or KoboldCpp's AGPL code in
the daemon; do not redistribute TextGen without auditing the current repository
and bundled component terms.

Model terms vary: Qwen3/Qwen3.6 and gpt-oss are Apache-2.0 according to their
official releases/cards; DeepSeek-R1 weights/code are MIT with base-model
notices; Llama and Gemma have their own licenses/terms; Mistral's open weights
are generally Apache-2.0 but each release should be checked. The model catalog
must preserve the exact model revision, source URL, digest, and license notice.

## Verification plan before implementation

Build a small cross-runtime fixture rather than trusting marketing claims:

* one no-op tool with required string/integer/enum properties;
* one nested JSON Schema response;
* one two-tool parallel request;
* one malformed-tool-output recovery turn;
* 1, 2, 4, and 8 concurrent requests with a fixed prompt and 8K/32K context;
* cold-start, model-load, cancellation, process-crash, and offline restart;
* Qwen3-Coder, gpt-oss-20b, Devstral Small 2, and one Qwen3.6/Gemma 4 model;
* Ollama, llama-server, vLLM, SGLang, MLX/LM Studio on their supported hosts.

Record: exact runtime/model versions, model revision/digest, quantization,
hardware, schema pass rate, tool-selection accuracy, malformed-call rate,
tokens/sec, time-to-first-token, p50/p95 latency, peak memory, and behavior
under cancellation. This fixture should gate adding a runtime to the “strict
tool-capable” capability tier.

## Sources and caveats

Primary sources were checked on **2026-07-16**. Relevant 2025–2026 evidence
includes the official Ollama API/FAQ, llama.cpp server and grammar docs, LM
Studio structured-output/parallel-request docs, vLLM/SGLang/TGI documentation,
MLX-LM's repository and maintainer discussion, LocalAI/Jan/llamafile/TextGen/
KoboldCpp repositories, and official Qwen, OpenAI, Mistral, Google, and
DeepSeek model cards/releases linked above.

The market is changing weekly. Runtime feature claims are version-sensitive;
model tool-call success is model-template-parser-sensitive; memory figures are
estimates rather than benchmark results; and community benchmark posts often
do not publish prompts, seeds, or full harnesses. The verification fixture is
therefore a required follow-up, not optional polish.
