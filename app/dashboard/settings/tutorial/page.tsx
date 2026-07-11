"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { useTour, TOUR_CHAPTERS } from "@/lib/stores/use-tour";

export default function TutorialPage() {
  const ref = useGsapEntrance();
  const start = useTour((s) => s.start);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsOwner(d.user?.role === "owner"))
      .catch(() => {});
  }, []);

  const replay = () => {
    // Reset the completed flag so it also auto-launches on next login, then play now.
    fetch("/api/auth/tutorial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    }).catch(() => {});
    start({ isOwner });
  };

  const chapters = TOUR_CHAPTERS.filter((c) => isOwner || !c.ownerOnly);

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="relative">
          <span className="eyebrow">
            <GraduationCap size={11} /> Tutorial
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Product tour</h2>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            Replay the guided walkthrough of Matrix Dashboard any time — chat, your workspace,
            installing the runner, agents, and (for owners) inviting your team.
          </p>
        </div>
      </div>

      <Card interactive className="rounded-2xl">
        <Button onClick={replay}>
          <Play size={14} className="mr-1.5" /> Start the tour
        </Button>
        <div className="mt-5 space-y-1.5">
          {chapters.map((c, i) => (
            <div key={c.id} className="text-text-secondary flex items-center gap-2 text-sm">
              <span className="text-text-muted w-5 text-xs">{i + 1}.</span>
              {c.title}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
