"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Trash2, Download, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import type { GeneratedImage } from "@/types/jarvis";

export default function ImagesPage() {
  const ref = useGsapEntrance();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<GeneratedImage[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/images");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          "Generation failed",
          typeof data.error === "string" ? data.error : "Check your provider."
        );
        return;
      }
      toast.success("Image generated");
      setPrompt("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i: GeneratedImage) => {
    const ok = await confirm({ title: "Delete this image?", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/images?id=${i.id}`, { method: "DELETE" });
    refresh();
  };

  const download = (i: GeneratedImage) => {
    const a = document.createElement("a");
    a.href = i.dataUrl;
    a.download = `matrix-${i.id.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <div ref={ref} className="mx-auto max-w-5xl space-y-8 px-4 py-10 md:px-8">
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Sparkles size={11} /> Image Studio
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Image generation</h1>
          <p className="text-text-secondary mt-3 max-w-2xl text-sm">
            Uses your OpenAI-compatible provider&apos;s images endpoint. Results saved to your local
            gallery.
          </p>
        </div>
      </div>

      <Card interactive className="space-y-3 rounded-2xl">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="A futuristic OLED dashboard with emerald accents, glassmorphism, ultra-detailed."
        />
        <div className="flex justify-end">
          <Button variant="primary" onClick={generate} disabled={busy || !prompt.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? "Generating…" : "Generate"}
          </Button>
        </div>
      </Card>

      {list.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={16} />}
          title="No images yet"
          description="Type a prompt above to start."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {list.map((img) => (
            <Card key={img.id} interactive className="group overflow-hidden rounded-2xl p-0">
              <div className="relative">
                <img
                  src={img.dataUrl}
                  alt={img.prompt}
                  className="aspect-square w-full object-cover"
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-2 text-[11px] text-white">{img.prompt}</p>
                  <p className="mt-1 text-[10px] text-white/70">{timeAgo(img.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 border-t border-white/5 px-2 py-1.5">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => download(img)}
                  aria-label="Download"
                >
                  <Download size={12} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(img)} aria-label="Delete">
                  <Trash2 size={12} className="text-rose-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
