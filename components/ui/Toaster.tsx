"use client";

import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let counter = 1;
const listeners = new Set<(t: Toast) => void>();

/**
 * Fire a toast from anywhere (server-action callback, mutation onSuccess,
 * etc). Non-blocking, no provider required at the call site.
 */
export function toast(message: string, kind: ToastKind = "success") {
  const t: Toast = { id: counter++, kind, message };
  for (const l of listeners) l(t);
}

export const toastSuccess = (m: string) => toast(m, "success");
export const toastError = (m: string) => toast(m, "error");
export const toastInfo = (m: string) => toast(m, "info");

/**
 * Renders a stack of toasts in the top-right. Each auto-dismisses after a
 * short delay; user can also click to dismiss early.
 */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setItems((prev) => [...prev, t]);
      const ttl = t.kind === "error" ? 6000 : 3500;
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, ttl);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-md border px-3 py-2 text-left text-sm shadow-lg ${kindClass(t.kind)}`}
        >
          <span className="font-semibold">{kindLabel(t.kind)}</span>
          <span className="flex-1">{t.message}</span>
        </button>
      ))}
    </div>
  );
}

function kindClass(k: ToastKind) {
  if (k === "error") return "border-red-200 bg-red-50 text-red-800";
  if (k === "info") return "border-neutral-200 bg-white text-neutral-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function kindLabel(k: ToastKind) {
  if (k === "error") return "Error";
  if (k === "info") return "FYI";
  return "Done";
}
