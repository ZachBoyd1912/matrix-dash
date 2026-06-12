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
        toast.error("Generation failed", typeof data.error === "string" ? data.error : "Check your provider.");
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
    <div ref={ref} className="px-4 md:px-8 py-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles size={20} className="text-emerald-400" /> Image generation
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Uses your OpenAI-compatible provider&apos;s images endpoint. Results saved to your local gallery.
        </p>
      </div>

      <Card className="space-y-3">
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
        <EmptyState icon={<ImageIcon size={16} />} title="No images yet" description="Type a prompt above to start." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {list.map((img) => (
            <Card key={img.id} className="overflow-hidden p-0 group">
              <div className="relative">
                <img src={img.dataUrl} alt={img.prompt} className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-[11px] text-white line-clamp-2">{img.prompt}</p>
                  <p className="text-[10px] text-white/70 mt-1">{timeAgo(img.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-t border-white/5">
                <Button size="icon" variant="ghost" onClick={() => download(img)} aria-label="Download">
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
