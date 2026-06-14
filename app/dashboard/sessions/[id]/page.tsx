"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, confirm } from "@/lib/stores/use-feedback";
import type { Session, SessionMessage } from "@/types/session";

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<SessionMessage[] | null>(null);
  const [name, setName] = useState("");

  const loadSession = useCallback(async () => {
    const [sessionRes, messagesRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/messages`),
    ]);
    if (sessionRes.ok) {
      const s = await sessionRes.json();
      setSession(s);
      setName(s.name);
    }
    if (messagesRes.ok) {
      setMessages(await messagesRes.json());
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const renameSession = async (value: string) => {
    setName(value);
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this session?",
      description: "All of its messages will be deleted too.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    toast.success("Session deleted");
    router.push("/dashboard/sessions");
  };

  if (!session || messages === null) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-1/2 mb-4" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const initialMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));

  return (
    <div className="flex flex-col page-h">
      <div className="px-4 md:px-6 py-3 border-b border-white/5 flex items-center gap-3">
        <Link
          href="/dashboard/sessions"
          className="text-text-muted hover:text-text-primary p-1 rounded-lg hover:bg-white/5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          aria-label="Back to sessions"
        >
          <ArrowLeft size={14} />
        </Link>
        <Input
          value={name}
          onChange={(e) => renameSession(e.target.value)}
          className="flex-1 h-9 text-sm font-semibold border-transparent bg-transparent focus:bg-white/[0.03]"
        />
        <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete">
          <Trash2 size={14} className="text-rose-400" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <ChatInterface sessionId={sessionId} initialMessages={initialMessages} embedded />
      </div>
    </div>
  );
}
