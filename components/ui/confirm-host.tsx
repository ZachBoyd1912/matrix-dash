"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { useFeedback } from "@/lib/stores/use-feedback";

export function ConfirmHost() {
  const state = useFeedback((s) => s.confirmState);
  const settle = useFeedback((s) => s.settleConfirm);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    setTyped("");
  }, [state]);

  if (!state) return null;

  const blocked = !!state.requireText && typed !== state.requireText;

  return (
    <Dialog
      open
      onClose={() => settle(false)}
      title={state.title}
      description={state.description}
      className="max-w-md"
    >
      {state.requireText && (
        <div className="mb-4">
          <label className="block text-[10px] uppercase text-text-muted mb-1">
            Type <span className="text-rose-300 font-mono">{state.requireText}</span> to confirm
          </label>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={state.requireText}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => settle(false)}>
          Cancel
        </Button>
        <Button
          variant={state.danger ? "danger" : "primary"}
          disabled={blocked}
          onClick={() => settle(true)}
          autoFocus={!state.requireText}
        >
          {state.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Dialog>
  );
}
