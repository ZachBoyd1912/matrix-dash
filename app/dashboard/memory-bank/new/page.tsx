"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BrainCircuit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { MEMORY_TYPES, MEMORY_TYPE_META, type MemoryType } from "@/types/memory";

export default function NewMemoryPage() {
  const router = useRouter();
  const ref = useGsapEntrance();
  const [content, setContent] = useState("");
  const [type, setType] = useState<MemoryType>("project");
  const [tags, setTags] = useState("");
  const [importance, setImportance] = useState(0.6);
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: content.trim(), type, tags, importance, isPinned: pinned }),
      });
      toast.success("Memory saved");
      router.push("/dashboard/memory-bank");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={ref} className="mx-auto max-w-2xl space-y-8 px-4 py-10 md:px-8">
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative flex items-start gap-3">
          <Link
            href="/dashboard/memory-bank"
            className="text-text-muted hover:text-text-primary mt-1 rounded-md p-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/5"
            aria-label="Back"
          >
            <ArrowLeft size={15} />
          </Link>
          <div className="space-y-2">
            <span className="eyebrow">
              <BrainCircuit size={11} /> Memory Bank
            </span>
            <h1 className="display text-gradient text-4xl md:text-5xl">New memory</h1>
            <p className="text-text-secondary text-sm">Capture a fact worth remembering.</p>
          </div>
        </div>
      </div>

      <Card interactive className="space-y-4 rounded-2xl">
        <Textarea
          autoFocus
          rows={4}
          placeholder="One sentence — what should the AI remember?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">Type</label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as MemoryType)}
              className="w-full"
            >
              {MEMORY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEMORY_TYPE_META[t].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">
              Importance · {importance.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={importance}
              onChange={(e) => setImportance(parseFloat(e.target.value))}
              className="h-9 w-full accent-emerald-400"
            />
          </div>
        </div>
        <div>
          <label className="text-text-muted mb-1 block text-[10px] uppercase">Tags</label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma,separated,keywords"
          />
        </div>
        <label className="text-text-secondary flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="accent-emerald-400"
          />
          Pin — always inject into context
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/dashboard/memory-bank")}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!content.trim() || submitting}>
            {submitting ? "Saving…" : "Save memory"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
