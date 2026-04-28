"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcutLabel } from "@/components/layout/useShortcutLabel";
import { rankFuzzy } from "@/lib/fuzzy";
import { api } from "@/lib/trpc/react";

type Item = {
  type: "project" | "building" | "space" | "tenant";
  id: string;
  code: string;
  label: string;
  sublabel?: string;
  url: string;
  brandColor?: string;
};

const TYPE_LABELS: Record<Item["type"], string> = {
  project: "Project",
  building: "Building",
  space: "Space",
  tenant: "Tenant",
};

export function CommandPalette() {
  const router = useRouter();
  const shortcut = useShortcutLabel("K");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd-K / Ctrl-K toggles, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isToggle) {
        e.preventDefault();
        setOpen((x) => !x);
        setQuery("");
        setActiveIndex(0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input when opened.
  useEffect(() => {
    if (open) {
      // Defer until the modal is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Fetch the index once the palette opens. Cached after that.
  const search = api.search.all.useQuery(undefined, {
    enabled: open,
    staleTime: 30 * 1000,
    retry: false,
  });

  const items = (search.data ?? []) as Item[];
  const ranked = useMemo(
    () =>
      rankFuzzy(items, query, (it) => [it.label, it.code, it.sublabel ?? null]),
    [items, query],
  );

  // Clamp the active index when the result list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  function go(item: Item) {
    setOpen(false);
    router.push(item.url);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(ranked.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = ranked[activeIndex];
      if (it) go(it);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-neutral-900/40 px-4 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search projects, buildings, spaces, tenants…"
          className="block w-full border-b border-neutral-200 px-4 py-3 text-sm focus:outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {search.isLoading ? (
            <p className="px-4 py-3 text-sm text-neutral-500">Loading…</p>
          ) : ranked.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-500">
              {query ? "Nothing matches." : "Start typing to search."}
            </p>
          ) : (
            <ul>
              {ranked.map((it, i) => (
                <li key={`${it.type}-${it.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => go(it)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                      i === activeIndex ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {it.brandColor ? (
                        <span
                          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ background: it.brandColor }}
                        />
                      ) : (
                        <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full bg-neutral-200" />
                      )}
                      <span>
                        <span className="font-medium">{it.label}</span>
                        {it.sublabel && (
                          <span className="ml-2 font-mono text-xs text-neutral-500">
                            {it.sublabel}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                      {TYPE_LABELS[it.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">
          <span>↑↓ navigate · Enter to open · Esc to close</span>
          <span className="font-mono">{shortcut}</span>
        </div>
      </div>
    </div>
  );
}
