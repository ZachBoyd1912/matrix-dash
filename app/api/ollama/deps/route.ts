import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pexec = promisify(exec);

type DepKind = "system" | "python";
type DepType = "System" | "LLM" | "Image" | "Tools";

interface DepDef {
  name: string;
  /** import name for python pkgs, binary name for system tools */
  probe: string;
  kind: DepKind;
  type: DepType;
  group: "app" | "server";
  description: string;
  /** install hint shown when not present */
  install: string;
}

const DEPS: DepDef[] = [
  // App dependencies
  {
    name: "playwright",
    probe: "playwright",
    kind: "python",
    type: "Tools",
    group: "app",
    description: "Headless browser automation for web tasks",
    install: "pip install playwright && playwright install",
  },
  {
    name: "rembg",
    probe: "rembg",
    kind: "python",
    type: "Image",
    group: "app",
    description: "Background removal for images",
    install: "pip install rembg",
  },
  {
    name: "yt-dlp",
    probe: "yt_dlp",
    kind: "python",
    type: "Tools",
    group: "app",
    description: "Media download utility",
    install: "pip install yt-dlp",
  },
  // Server dependencies — system tools
  {
    name: "tmux",
    probe: "tmux",
    kind: "system",
    type: "System",
    group: "server",
    description: "Terminal multiplexer for long-running sessions",
    install: "brew install tmux",
  },
  {
    name: "docker",
    probe: "docker",
    kind: "system",
    type: "System",
    group: "server",
    description: "Container runtime",
    install: "https://docs.docker.com/get-docker",
  },
  {
    name: "git",
    probe: "git",
    kind: "system",
    type: "System",
    group: "server",
    description: "Version control",
    install: "brew install git",
  },
  {
    name: "ffmpeg",
    probe: "ffmpeg",
    kind: "system",
    type: "Tools",
    group: "server",
    description: "Audio/video transcoding",
    install: "brew install ffmpeg",
  },
  // Server dependencies — LLM / ML python
  {
    name: "hf_transfer",
    probe: "hf_transfer",
    kind: "python",
    type: "LLM",
    group: "server",
    description: "Faster Hugging Face downloads",
    install: "pip install hf_transfer",
  },
  {
    name: "huggingface_hub",
    probe: "huggingface_hub",
    kind: "python",
    type: "LLM",
    group: "server",
    description: "Model hub client + CLI",
    install: "pip install huggingface_hub",
  },
  {
    name: "llama_cpp",
    probe: "llama_cpp",
    kind: "python",
    type: "LLM",
    group: "server",
    description: "GGUF inference (llama.cpp python bindings)",
    install: "pip install llama-cpp-python",
  },
  {
    name: "vllm",
    probe: "vllm",
    kind: "python",
    type: "LLM",
    group: "server",
    description: "High-throughput GPU serving",
    install: "pip install vllm",
  },
  {
    name: "sglang",
    probe: "sglang",
    kind: "python",
    type: "LLM",
    group: "server",
    description: "Structured generation serving",
    install: "pip install sglang",
  },
  {
    name: "diffusers",
    probe: "diffusers",
    kind: "python",
    type: "Image",
    group: "server",
    description: "Stable Diffusion / image generation",
    install: "pip install diffusers",
  },
];

async function probeDep(d: DepDef): Promise<boolean> {
  try {
    if (d.kind === "system") {
      await pexec(`command -v ${d.probe}`, { timeout: 4000 });
    } else {
      await pexec(`python3 -c "import ${d.probe}"`, { timeout: 8000 });
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const results = await Promise.all(
    DEPS.map(async (d) => ({
      name: d.name,
      kind: d.kind,
      type: d.type,
      group: d.group,
      description: d.description,
      install: d.install,
      installed: await probeDep(d),
    }))
  );
  return Response.json({ deps: results });
}

const Body = z.object({ name: z.string().min(1).max(200) });

/** Best-effort install for python packages; system tools return manual instructions. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "name required" }, { status: 400 });

  const dep = DEPS.find((d) => d.name === parsed.data.name);
  if (!dep) return Response.json({ error: "Unknown dependency" }, { status: 404 });

  if (dep.kind === "system") {
    return Response.json({
      manual: true,
      instruction: dep.install,
      message: `${dep.name} is a system tool — install it manually: ${dep.install}`,
    });
  }

  try {
    // pip can be slow; cap it and surface the tail of stderr on failure.
    await pexec(
      `python3 -m pip install --user ${dep.name === "yt-dlp" ? "yt-dlp" : dep.name.replace(/_/g, "-")}`,
      {
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 8,
      }
    );
    const installed = await probeDep(dep);
    return Response.json({ installed, manual: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg.split("\n").slice(-4).join("\n") }, { status: 500 });
  }
}
