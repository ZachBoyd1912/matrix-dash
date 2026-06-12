"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { toast, confirm } from "@/lib/stores/use-feedback";

export default function SystemPage() {
  const ref = useGsapEntrance();
  const [wiping, setWiping] = useState(false);

  const exportData = () => {
    window.location.href = "/api/system/export";
  };

  const wipe = async (scope: "memories" | "notes" | "sessions" | "files" | "all") => {
    const human =
      scope === "all" ? "ALL local data (memories, notes, sessions, files)" : `all ${scope}`;
    const ok = await confirm({
      title: `Wipe ${scope === "all" ? "everything" : scope}?`,
      description: `This permanently deletes ${human}. There is no undo.`,
      confirmLabel: "Wipe",
      danger: true,
      requireText: "WIPE",
    });
    if (!ok) return;
    setWiping(true);
    try {
      await fetch("/api/system/wipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "WIPE", scope }),
      });
      toast.success("Wipe complete", `Deleted ${human}.`);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">System</h2>
        <p className="text-text-secondary text-sm mt-1">
          Export everything as JSON or wipe scoped data. The database lives at ~/MatrixDash/matrix.db.
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Export local data</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Downloads a single JSON containing every table.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={exportData}>
            <Download size={13} /> Export JSON
          </Button>
        </div>
      </Card>

      <Card className="border-rose-500/20 bg-rose-500/[0.02]">
        <p className="text-sm font-medium text-rose-300">Danger zone</p>
        <p className="text-xs text-text-secondary mt-1 mb-3">
          These operations are permanent and not recoverable. Export first.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" size="sm" onClick={() => wipe("memories")} disabled={wiping}>
            <Trash2 size={13} /> Wipe memories
          </Button>
          <Button variant="danger" size="sm" onClick={() => wipe("notes")} disabled={wiping}>
            <Trash2 size={13} /> Wipe notes
          </Button>
          <Button variant="danger" size="sm" onClick={() => wipe("sessions")} disabled={wiping}>
            <Trash2 size={13} /> Wipe sessions
          </Button>
          <Button variant="danger" size="sm" onClick={() => wipe("files")} disabled={wiping}>
            <Trash2 size={13} /> Wipe files
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => wipe("all")}
            disabled={wiping}
            className="col-span-2"
          >
            <Trash2 size={13} /> Wipe everything
          </Button>
        </div>
      </Card>
    </div>
  );
}
