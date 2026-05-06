"use client";

import { useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

interface Props {
  comp: { id: string; label: string; currentProjectIds: string[] };
  projects: Array<{ id: string; code: string; name: string }>;
  onClose: () => void;
}

/**
 * Lightweight checklist of every project in the org. The user ticks the
 * boxes the comp should be visible on; on save we diff against the
 * comp's current assignments via `comp.setAssignments`.
 */
export function CompAssignModal({ comp, projects, onClose }: Props) {
  const utils = api.useUtils();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(comp.currentProjectIds),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setAssignments = api.comp.setAssignments.useMutation({
    onSuccess: async () => {
      await utils.comp.list.invalidate();
      await utils.comp.listForProject.invalidate();
      toastSuccess("Assignments saved");
      onClose();
    },
    onError: (err) => toastError(err.message),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Assign comp
          </p>
          <p className="text-sm font-medium">{comp.label}</p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {projects.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-500">
              No projects yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {projects.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1">
                        <span className="font-mono text-xs text-neutral-500">
                          {p.code}
                        </span>{" "}
                        <span className="text-sm">{p.name}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              setAssignments.mutate({
                compId: comp.id,
                projectIds: Array.from(selected),
              })
            }
            disabled={setAssignments.isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {setAssignments.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
