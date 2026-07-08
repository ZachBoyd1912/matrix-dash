"use client";

import { useEffect } from "react";

// This page has no sessionId of its own, so it's always redirected to a real
// session rather than rendered directly — a chat sent here with no sessionId
// is never persisted (see app/api/ai/chat/route.ts's `if (sessionId && ...)`
// gate), which silently drops messages, token/cost tracking, and disables
// regenerate/fork/variants. /dashboard/sessions already has this exact
// create-and-redirect flow via its own ?new=1 handling — reuse it instead of
// duplicating the POST /api/sessions call here.
export default function ChatPage() {
  useEffect(() => {
    window.location.href = "/dashboard/sessions?new=1";
  }, []);

  return null;
}
