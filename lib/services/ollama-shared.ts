/** Client-safe constants and types for Ollama (no DB or fs imports). */
export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { family?: string; parameter_size?: string; quantization_level?: string };
}

export const RECOMMENDED_MODELS = [
  { name: "llama3.2:3b", label: "Llama 3.2 (3B)", note: "Fast on CPU, ~2GB RAM" },
  { name: "qwen2.5:3b", label: "Qwen 2.5 (3B)", note: "Strong reasoning, ~2GB" },
  { name: "phi3.5:3.8b", label: "Phi 3.5 (3.8B)", note: "Microsoft, ~2.5GB" },
  { name: "qwen2.5:7b", label: "Qwen 2.5 (7B)", note: "Needs ~5GB free RAM" },
  { name: "gemma2:2b", label: "Gemma 2 (2B)", note: "Tiny, very fast, ~1.5GB" },
  { name: "nomic-embed-text", label: "Nomic Embed", note: "Embeddings, ~300MB" },
];

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

/* ------------------------------------------------------------------ *
 * Model registry + hardware fitting
 *
 * Concept (model scoring / fit badges, hardware-aware download table)
 * adapted from Odysseus by pewdiepie-archdaemon (AGPL-3.0). This is a
 * clean-room TypeScript re-implementation — see README / CHANGELOG credits.
 * ------------------------------------------------------------------ */

export type ModelTag = "general" | "coding" | "reasoning" | "vision" | "embed";

export interface ModelSpec {
  /** `ollama pull` id */
  name: string;
  label: string;
  /** billions of parameters (MoE: total params) */
  paramsB: number;
  paramLabel: string;
  /** native/default quant the VRAM estimate is based on */
  quant: string;
  /** estimated VRAM (GB) to run at the default quant + a small ctx */
  vramGb: number;
  /** max context window (tokens) */
  ctx: number;
  /** 0–10 quality index (higher = stronger) */
  quality: number;
  tags: ModelTag[];
}

/** Quant options the download table can re-fit against. */
export const QUANTS = ["Q4_K_M", "Q8_0", "F16"] as const;
export type Quant = (typeof QUANTS)[number];

/** Rough VRAM multiplier vs. the Q4_K_M baseline each spec is stored at. */
export const QUANT_VRAM_MULT: Record<Quant, number> = {
  Q4_K_M: 1,
  Q8_0: 1.85,
  F16: 3.6,
};

/** ~34-model catalogue spanning 0.5B → 70B, plus coders / reasoners / embedders. */
export const MODEL_REGISTRY: ModelSpec[] = [
  // ---- tiny / edge ----
  {
    name: "qwen2.5:0.5b",
    label: "Qwen 2.5 0.5B",
    paramsB: 0.5,
    paramLabel: "0.5B",
    quant: "Q4_K_M",
    vramGb: 0.6,
    ctx: 32768,
    quality: 4.4,
    tags: ["general"],
  },
  {
    name: "tinyllama:1.1b",
    label: "TinyLlama 1.1B",
    paramsB: 1.1,
    paramLabel: "1.1B",
    quant: "Q4_K_M",
    vramGb: 0.7,
    ctx: 8192,
    quality: 4.0,
    tags: ["general"],
  },
  {
    name: "llama3.2:1b",
    label: "Llama 3.2 1B",
    paramsB: 1,
    paramLabel: "1B",
    quant: "Q4_K_M",
    vramGb: 1.0,
    ctx: 131072,
    quality: 6.0,
    tags: ["general"],
  },
  {
    name: "qwen2.5:1.5b",
    label: "Qwen 2.5 1.5B",
    paramsB: 1.5,
    paramLabel: "1.5B",
    quant: "Q4_K_M",
    vramGb: 1.2,
    ctx: 32768,
    quality: 6.1,
    tags: ["general"],
  },
  {
    name: "deepseek-r1:1.5b",
    label: "DeepSeek-R1 1.5B",
    paramsB: 1.5,
    paramLabel: "1.5B",
    quant: "Q4_K_M",
    vramGb: 1.2,
    ctx: 131072,
    quality: 6.8,
    tags: ["reasoning"],
  },
  {
    name: "qwen2.5-coder:1.5b",
    label: "Qwen2.5-Coder 1.5B",
    paramsB: 1.5,
    paramLabel: "1.5B",
    quant: "Q4_K_M",
    vramGb: 1.2,
    ctx: 32768,
    quality: 6.5,
    tags: ["coding"],
  },
  // ---- 2–4B: comfortable on 8 GB ----
  {
    name: "gemma2:2b",
    label: "Gemma 2 2B",
    paramsB: 2,
    paramLabel: "2B",
    quant: "Q4_K_M",
    vramGb: 1.7,
    ctx: 8192,
    quality: 6.5,
    tags: ["general"],
  },
  {
    name: "llama3.2:3b",
    label: "Llama 3.2 3B",
    paramsB: 3,
    paramLabel: "3B",
    quant: "Q4_K_M",
    vramGb: 2.0,
    ctx: 131072,
    quality: 7.0,
    tags: ["general"],
  },
  {
    name: "qwen2.5:3b",
    label: "Qwen 2.5 3B",
    paramsB: 3,
    paramLabel: "3B",
    quant: "Q4_K_M",
    vramGb: 2.0,
    ctx: 32768,
    quality: 7.2,
    tags: ["general"],
  },
  {
    name: "phi3.5:3.8b",
    label: "Phi 3.5 Mini",
    paramsB: 3.8,
    paramLabel: "3.8B",
    quant: "Q4_K_M",
    vramGb: 2.4,
    ctx: 131072,
    quality: 7.1,
    tags: ["general"],
  },
  {
    name: "starcoder2:3b",
    label: "StarCoder2 3B",
    paramsB: 3,
    paramLabel: "3B",
    quant: "Q4_K_M",
    vramGb: 1.9,
    ctx: 16384,
    quality: 6.8,
    tags: ["coding"],
  },
  // ---- 7–9B: needs headroom ----
  {
    name: "mistral:7b",
    label: "Mistral 7B",
    paramsB: 7,
    paramLabel: "7B",
    quant: "Q4_K_M",
    vramGb: 4.1,
    ctx: 32768,
    quality: 7.8,
    tags: ["general"],
  },
  {
    name: "qwen2.5:7b",
    label: "Qwen 2.5 7B",
    paramsB: 7,
    paramLabel: "7B",
    quant: "Q4_K_M",
    vramGb: 4.7,
    ctx: 131072,
    quality: 8.0,
    tags: ["general"],
  },
  {
    name: "qwen2.5-coder:7b",
    label: "Qwen2.5-Coder 7B",
    paramsB: 7,
    paramLabel: "7B",
    quant: "Q4_K_M",
    vramGb: 4.7,
    ctx: 131072,
    quality: 8.2,
    tags: ["coding"],
  },
  {
    name: "deepseek-r1:7b",
    label: "DeepSeek-R1 7B",
    paramsB: 7,
    paramLabel: "7B",
    quant: "Q4_K_M",
    vramGb: 4.7,
    ctx: 131072,
    quality: 8.3,
    tags: ["reasoning"],
  },
  {
    name: "codellama:7b",
    label: "Code Llama 7B",
    paramsB: 7,
    paramLabel: "7B",
    quant: "Q4_K_M",
    vramGb: 3.8,
    ctx: 16384,
    quality: 7.2,
    tags: ["coding"],
  },
  {
    name: "llava:7b",
    label: "LLaVA 7B (vision)",
    paramsB: 7,
    paramLabel: "7B",
    quant: "Q4_K_M",
    vramGb: 4.7,
    ctx: 4096,
    quality: 7.0,
    tags: ["vision"],
  },
  {
    name: "llama3.1:8b",
    label: "Llama 3.1 8B",
    paramsB: 8,
    paramLabel: "8B",
    quant: "Q4_K_M",
    vramGb: 4.9,
    ctx: 131072,
    quality: 8.1,
    tags: ["general"],
  },
  {
    name: "deepseek-r1:8b",
    label: "DeepSeek-R1 8B",
    paramsB: 8,
    paramLabel: "8B",
    quant: "Q4_K_M",
    vramGb: 4.9,
    ctx: 131072,
    quality: 8.4,
    tags: ["reasoning"],
  },
  {
    name: "gemma2:9b",
    label: "Gemma 2 9B",
    paramsB: 9,
    paramLabel: "9B",
    quant: "Q4_K_M",
    vramGb: 5.5,
    ctx: 8192,
    quality: 8.0,
    tags: ["general"],
  },
  // ---- 12–16B ----
  {
    name: "mistral-nemo:12b",
    label: "Mistral Nemo 12B",
    paramsB: 12,
    paramLabel: "12B",
    quant: "Q4_K_M",
    vramGb: 7.1,
    ctx: 131072,
    quality: 8.1,
    tags: ["general"],
  },
  {
    name: "phi3:14b",
    label: "Phi 3 Medium 14B",
    paramsB: 14,
    paramLabel: "14B",
    quant: "Q4_K_M",
    vramGb: 7.9,
    ctx: 131072,
    quality: 7.8,
    tags: ["general"],
  },
  {
    name: "qwen2.5:14b",
    label: "Qwen 2.5 14B",
    paramsB: 14,
    paramLabel: "14B",
    quant: "Q4_K_M",
    vramGb: 9.0,
    ctx: 131072,
    quality: 8.5,
    tags: ["general"],
  },
  {
    name: "deepseek-r1:14b",
    label: "DeepSeek-R1 14B",
    paramsB: 14,
    paramLabel: "14B",
    quant: "Q4_K_M",
    vramGb: 9.0,
    ctx: 131072,
    quality: 8.8,
    tags: ["reasoning"],
  },
  {
    name: "codellama:13b",
    label: "Code Llama 13B",
    paramsB: 13,
    paramLabel: "13B",
    quant: "Q4_K_M",
    vramGb: 7.4,
    ctx: 16384,
    quality: 7.6,
    tags: ["coding"],
  },
  {
    name: "deepseek-coder-v2:16b",
    label: "DeepSeek-Coder-V2 16B",
    paramsB: 16,
    paramLabel: "16B MoE",
    quant: "Q4_K_M",
    vramGb: 8.9,
    ctx: 131072,
    quality: 8.4,
    tags: ["coding"],
  },
  // ---- 27–32B: workstation ----
  {
    name: "gemma2:27b",
    label: "Gemma 2 27B",
    paramsB: 27,
    paramLabel: "27B",
    quant: "Q4_K_M",
    vramGb: 16,
    ctx: 8192,
    quality: 8.7,
    tags: ["general"],
  },
  {
    name: "qwen2.5:32b",
    label: "Qwen 2.5 32B",
    paramsB: 32,
    paramLabel: "32B",
    quant: "Q4_K_M",
    vramGb: 20,
    ctx: 131072,
    quality: 9.0,
    tags: ["general"],
  },
  {
    name: "deepseek-r1:32b",
    label: "DeepSeek-R1 32B",
    paramsB: 32,
    paramLabel: "32B",
    quant: "Q4_K_M",
    vramGb: 20,
    ctx: 131072,
    quality: 9.1,
    tags: ["reasoning"],
  },
  {
    name: "qwen2.5-coder:32b",
    label: "Qwen2.5-Coder 32B",
    paramsB: 32,
    paramLabel: "32B",
    quant: "Q4_K_M",
    vramGb: 20,
    ctx: 131072,
    quality: 9.0,
    tags: ["coding"],
  },
  // ---- 47–70B: big iron ----
  {
    name: "mixtral:8x7b",
    label: "Mixtral 8x7B",
    paramsB: 47,
    paramLabel: "8x7B MoE",
    quant: "Q4_K_M",
    vramGb: 26,
    ctx: 32768,
    quality: 8.6,
    tags: ["general"],
  },
  {
    name: "llama3.3:70b",
    label: "Llama 3.3 70B",
    paramsB: 70,
    paramLabel: "70B",
    quant: "Q4_K_M",
    vramGb: 40,
    ctx: 131072,
    quality: 9.4,
    tags: ["general"],
  },
  {
    name: "llama3.1:70b",
    label: "Llama 3.1 70B",
    paramsB: 70,
    paramLabel: "70B",
    quant: "Q4_K_M",
    vramGb: 40,
    ctx: 131072,
    quality: 9.2,
    tags: ["general"],
  },
  // ---- embeddings ----
  {
    name: "nomic-embed-text",
    label: "Nomic Embed Text",
    paramsB: 0.14,
    paramLabel: "137M",
    quant: "F16",
    vramGb: 0.3,
    ctx: 8192,
    quality: 0,
    tags: ["embed"],
  },
  {
    name: "mxbai-embed-large",
    label: "mxbai Embed Large",
    paramsB: 0.34,
    paramLabel: "335M",
    quant: "F16",
    vramGb: 0.7,
    ctx: 512,
    quality: 0,
    tags: ["embed"],
  },
];

export type Fit = "PERFECT" | "OK" | "MARGINAL" | "NO";

export interface ModelScore {
  /** VRAM needed at the chosen quant (GB) */
  vramGb: number;
  fit: Fit;
  /** higher = better choice for this machine */
  score: number;
  /** rough generation speed estimate (tokens/sec) */
  speed: number;
}

export const FIT_META: Record<Fit, { label: string; cls: string }> = {
  PERFECT: { label: "PERFECT", cls: "bg-emerald-400/15 border-emerald-400/30 text-emerald-300" },
  OK: { label: "OK", cls: "bg-sky-400/15 border-sky-400/30 text-sky-300" },
  MARGINAL: { label: "MARGINAL", cls: "bg-amber-400/15 border-amber-400/30 text-amber-300" },
  NO: { label: "NO", cls: "bg-rose-500/15 border-rose-500/30 text-rose-300" },
};

/** VRAM (GB) a model needs at a given quant. */
export function vramForQuant(m: ModelSpec, quant: Quant): number {
  const baseMult = QUANT_VRAM_MULT[m.quant as Quant] ?? 1;
  const target = QUANT_VRAM_MULT[quant] ?? 1;
  return Math.round((m.vramGb / baseMult) * target * 10) / 10;
}

/**
 * Fit a model to the machine's usable VRAM (unified memory on Apple silicon).
 *   PERFECT  ≤ 70% of available     OK  ≤ 100%
 *   MARGINAL ≤ 120% (spills to RAM) NO  otherwise
 */
export function scoreModel(m: ModelSpec, availVramGb: number, quant: Quant = "Q4_K_M"): ModelScore {
  const vramGb = vramForQuant(m, quant);
  const avail = Math.max(availVramGb, 0.1);
  let fit: Fit;
  if (vramGb <= avail * 0.7) fit = "PERFECT";
  else if (vramGb <= avail) fit = "OK";
  else if (vramGb <= avail * 1.2) fit = "MARGINAL";
  else fit = "NO";

  const score = Math.round(m.quality * 10 - (vramGb / avail) * 20);

  const base = 280 / (m.paramsB + 1.5);
  const factor = fit === "PERFECT" ? 1 : fit === "OK" ? 0.7 : fit === "MARGINAL" ? 0.4 : 0.12;
  const speed = Math.max(1, Math.round(base * factor));

  return { vramGb, fit, score, speed };
}

export const TAG_META: Record<ModelTag, { label: string; cls: string }> = {
  general: { label: "General", cls: "text-text-secondary" },
  coding: { label: "Coding", cls: "text-sky-300" },
  reasoning: { label: "Reasoning", cls: "text-violet-300" },
  vision: { label: "Vision", cls: "text-amber-300" },
  embed: { label: "Embed", cls: "text-emerald-300" },
};
