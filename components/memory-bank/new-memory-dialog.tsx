"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MEMORY_TYPES, MEMORY_TYPE_META, type MemoryType } from "@/types/memory";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewMemoryDialog({ open, onClose, onCreated }: Props) {
  const [content, setContent] = useState("");
  const [type, setType] = useState<MemoryType>("project");
  const [tags, setTags] = useState("");
  const [importance, setImportance] = useState(0.6);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          type,
          tags,
          importance,
        }),
      });
      setContent("");
      setTags("");
      setImportance(0.6);
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New memory" description="Capture a fact worth remembering.">
      <div className="space-y-3">
        <Textarea
          autoFocus
          rows={3}
          placeholder="One sentence — what should the AI remember?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Type</label>
            <Select value={type} onChange={(e) => setType(e.target.value as MemoryType)} className="w-full">
              {MEMORY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEMORY_TYPE_META[t].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">
              Importance · {importance.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={importance}
              onChange={(e) => setImportance(parseFloat(e.target.value))}
              className="w-full accent-emerald-400"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase text-text-muted mb-1">Tags</label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma,separated,keywords"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!content.trim() || submitting}>
            {submitting ? "Saving…" : "Save memory"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
