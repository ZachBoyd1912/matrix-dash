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
