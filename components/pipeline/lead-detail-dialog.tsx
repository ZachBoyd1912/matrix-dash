"use client";

import { useEffect, useState } from "react";
import { Mail, Phone } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

interface PipelineRow {
  id: string;
  title: string;
  notes: string | null;
  createdAt: string;
}

// Matches the exact format app/api/leads/ingest/route.ts writes:
// `${email} · ${phone}\n\n${message}`. If that format ever changes, update
// both sides — this is a plain-text re-split, not a schema relationship.
function parseLead(notes: string | null): { email: string; phone: string; message: string } {
  if (!notes) return { email: "", phone: "", message: "" };
  const [contactLine, ...rest] = notes.split("\n\n");
  const [email = "", phone = ""] = contactLine.split(" · ");
  return { email, phone, message: rest.join("\n\n") };
}

export function LeadDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [row, setRow] = useState<PipelineRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setRow(null);
      return;
    }
    setLoading(true);
    fetch(`/api/pipeline/${id}`)
      .then((r) => r.json())
      .then(setRow)
      .catch(() => setRow(null))
      .finally(() => setLoading(false));
  }, [id]);

  const lead = row ? parseLead(row.notes) : null;

  return (
    <Dialog open={id !== null} onClose={onClose} title={row?.title ?? "Lead"}>
      {loading && <p className="text-text-muted text-xs">Loading…</p>}
      {lead && (
        <div className="space-y-3">
          {lead.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail size={14} className="text-text-muted shrink-0" />
              <a href={`mailto:${lead.email}`} className="text-text-primary hover:text-emerald-400">
                {lead.email}
              </a>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone size={14} className="text-text-muted shrink-0" />
              <a href={`tel:${lead.phone}`} className="text-text-primary hover:text-emerald-400">
                {lead.phone}
              </a>
            </div>
          )}
          {lead.message && (
            <p className="text-text-secondary border-t border-white/5 pt-3 text-sm whitespace-pre-wrap">
              {lead.message}
            </p>
          )}
          {row && (
            <p className="text-text-muted pt-1 text-[10px] tracking-wide uppercase">
              Received {new Date(row.createdAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
