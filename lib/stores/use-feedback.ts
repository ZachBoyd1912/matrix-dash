"use client";

import { create } from "zustand";

// crypto.randomUUID() is undefined in some SSR/Node contexts; fall back to a
// simple random string which is sufficient for ephemeral client-side IDs.
const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: "default" | "success" | "error";
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the user must type this exact string to enable the confirm button. */
  requireText?: string;
}

interface FeedbackState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  confirmState: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  openConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  settleConfirm: (ok: boolean) => void;
}

export const useFeedback = create<FeedbackState>((set, get) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirmState: null,
  openConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ confirmState: { ...opts, resolve } });
    }),
  settleConfirm: (ok) => {
    const current = get().confirmState;
    if (current) current.resolve(ok);
    set({ confirmState: null });
  },
}));

/** Imperative helpers usable from any client component. */
export const toast = {
  success: (title: string, description?: string) =>
    useFeedback.getState().pushToast({ title, description, variant: "success" }),
  error: (title: string, description?: string) =>
    useFeedback.getState().pushToast({ title, description, variant: "error" }),
  info: (title: string, description?: string) =>
    useFeedback.getState().pushToast({ title, description, variant: "default" }),
};

export const confirm = (opts: ConfirmOptions) => useFeedback.getState().openConfirm(opts);
