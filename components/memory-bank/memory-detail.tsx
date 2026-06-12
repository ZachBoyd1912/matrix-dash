"use client";

import { useState } from "react";
import { Pin, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { MEMORY_TYPE_META, MEMORY_TYPES, type LinkedMemory, type Memory } from "@/types/memory";
import { timeAgo } from "@/lib/utils/time";
import { toast, confirm } from "@/lib/stores/use-feedback";

interface Props {
  memory: Memory;
  links: LinkedMemory[];
  onChange: () => void;
  onSelectLinked: (id: string) => void;
}

export function MemoryDetail({ memory, links, onChange, onSelectLinked }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [type, setType] = useState(memory.type);
  const [tags, setTags] = useState(memory.tags);
  const [importance, setImportance] = useState(memory.importance);
  const meta = MEMORY_TYPE_META[memory.type];

  const save = async () => {
    await fetch(`/api/memories/${memory.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, type, tags, importance }),
    });
    setEditing(false);
    onChange();
  };

  const togglePin = async () => {
    await fetch(`/api/memories/${memory.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isPinned: !memory.isPinned }),
    });
    onChange();
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this memory?",
      description: "Links to and from it will be removed too. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/memories/${memory.id}`, { method: "DELETE" });
    toast.success("Memory deleted");
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Badge className={`${meta.bg} ${meta.border} ${meta.color}`}>{meta.label}</Badge>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={togglePin} aria-label="Pin">
            <Pin size={14} className={memory.isPinned ? "text-amber-400 fill-amber-400/30" : ""} />
          </Button>
          <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete">
            <Trash2 size={14} className="text-rose-400" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase text-text-muted mb-1">Type</label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as Memory["type"])}
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
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="glass-input w-full h-9 px-3 rounded-md text-sm"
              placeholder="comma,separated,keywords"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              <X size={14} /> Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              <Save size={14} /> Save
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="cursor-text rounded-lg border border-white/5 bg-white/[0.02] p-4 hover:border-white/10"
        >
          <p className="text-sm text-text-primary leading-relaxed">{memory.content}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Importance" value={memory.importance.toFixed(2)} />
        <Field label="Used" value={`${memory.usageCount}×`} />
        <Field label="Created" value={timeAgo(memory.createdAt)} />
        <Field label="Last used" value={memory.lastUsedAt ? timeAgo(memory.lastUsedAt) : "never"} />
      </div>

      {memory.tags && (
        <div className="flex flex-wrap gap-1.5">
          {memory.tags.split(",").filter(Boolean).map((tag) => (
            <Badge key={tag} className="lowercase">
              {tag.trim()}
            </Badge>
          ))}
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase text-text-muted mb-2">
          Linked ({links.length})
        </p>
        {links.length === 0 ? (
          <p className="text-xs text-text-muted">No links yet.</p>
        ) : (
          <ul className="space-y-1">
            {links.map((link) => {
              const linkMeta = MEMORY_TYPE_META[link.memory.type];
              return (
                <li
                  key={link.linkId}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 cursor-pointer text-xs"
                  onClick={() => onSelectLinked(link.memory.id)}
                >
                  <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${linkMeta.bg.replace("/10", "")}`} />
                  <span className="text-text-muted text-[10px]">
                    {link.direction === "outgoing" ? "→" : "←"}
                  </span>
                  <span className="flex-1 truncate text-text-secondary">
                    {link.memory.content}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {(link.strength * 100).toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase text-text-muted">{label}</div>
      <div className="text-text-primary tabular-nums">{value}</div>
    </div>
  );
}
