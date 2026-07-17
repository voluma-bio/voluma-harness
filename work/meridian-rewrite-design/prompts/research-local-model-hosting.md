# Research: local LLM hosting/serving for voluma-local (local-first agent coordinator)

## Context
We are designing `voluma-local`: a **local-first** TypeScript daemon that
coordinates AI coding/agent subprocesses (successor to a Python CLI called
meridian-cli). It references a separate `voluma` cloud repo for optional sync,
but the local product must run **fully offline**. We want an **explicit
first-class connection to local model hosting** (the user named Ollama as one
candidate). Your job: find the best local model-hosting options as of 2026 and
recommend an integration strategy.

## What matters (evaluate every option against these)
1. **OpenAI-compatible HTTP API** — our `AgentDriver` abstraction wants to target
   local models the same way it targets hosted providers. Native OpenAI `/v1`
   compat is a strong plus.
2. **Reliable tool/function calling + constrained/structured output** (JSON
   schema / grammar / GBNF). This is the hard requirement — our agents depend on
   structured tool calls, not just chat. Note which runtimes enforce schemas
   (grammar-constrained decoding) vs best-effort.
3. **Concurrency** — multiple agents run in parallel; the runtime must serve
   concurrent requests without collapsing. Note batching/continuous-batching.
4. **Cross-platform** — macOS (Apple Silicon), Linux, Windows. Local-first devs
   are on all three.
5. **Model management / distribution DX** — pull/run/version models easily.
6. **Runtime's own license** — matters because we're choosing our own license;
   note any copyleft/attribution constraints of embedding or shelling out to it.
7. **Footprint / quantization** — GGUF, MLX, AWQ/GPTQ; laptop-viable memory.

## Options to cover (add any current ones you find)
Ollama, llama.cpp (llama-server), LM Studio, vLLM, SGLang, MLX / mlx-lm,
LocalAI, Jan, llamafile, TGI (HF), KoboldCpp, text-generation-webui.

## Deliverables (write to the file below)
- A comparison table across the 7 criteria.
- A **ranked recommendation** for three deployment shapes:
  (a) **easiest embedded default** a local-first user gets out of the box,
  (b) **high-throughput / multi-agent** option for power users with a GPU,
  (c) **Apple-Silicon-optimal** option.
- **Integration posture:** should voluma-local *spawn/manage* the runtime as a
  child process, or *assume an already-running* endpoint, or both (auto-detect +
  optional managed)? Recommend, with reasoning.
- **Best local models for agentic tool-use as of 2026** (e.g. Qwen3 family,
  Llama, DeepSeek, Mistral, others) — which actually do reliable tool calls at
  laptop-runnable sizes, and at what quant/memory.
- Cite sources with dates; the space moves fast, prefer 2025-2026 sources.

## Output
Write to: `$MERIDIAN_ACTIVE_WORK_DIR/review/local-model-hosting.md`
