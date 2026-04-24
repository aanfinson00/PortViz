"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PortfolioMap, type ProjectPinData } from "@/components/map/PortfolioMap";
import { NewProjectDrawer } from "@/components/map/NewProjectDrawer";
import { api } from "@/lib/trpc/react";

export default function PortfolioMapPage() {
  const projectsQuery = api.project.list.useQuery(undefined, {
    retry: false,
  });

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [droppedPin, setDroppedPin] = useState<{ lng: number; lat: number } | null>(null);

  const pins = useMemo<ProjectPinData[]>(() => {
    const list = projectsQuery.data ?? [];
    return list.flatMap((p: {
      id: string;
      code: string;
      name: string;
      lat: number | null;
      lng: number | null;
    }) => {
      if (p.lat == null || p.lng == null) return [];
      return [
        {
          id: p.id,
          code: p.code,
          name: p.name,
          lng: p.lng,
          lat: p.lat,
        },
      ];
    });
  }, [projectsQuery.data]);

  const notReady = projectsQuery.isError;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Portfolio</h1>
          <p className="text-sm text-neutral-500">
            Map of all projects across your organization.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setDroppedPin(null);
              setDrawerOpen(true);
            }}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New project
          </button>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
        <aside className="overflow-y-auto border-r border-neutral-200 bg-white">
          {notReady ? (
            <DevBanner />
          ) : projectsQuery.isLoading ? (
            <p className="p-4 text-sm text-neutral-500">Loading projects…</p>
          ) : pins.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              No projects yet. Click &ldquo;New project&rdquo; or click on the
              map to drop your first pin.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {pins.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedCode(p.code)}
                    className={`flex w-full flex-col items-start px-4 py-3 text-left hover:bg-neutral-50 ${
                      selectedCode === p.code ? "bg-neutral-100" : ""
                    }`}
                  >
                    <span className="font-mono text-xs text-neutral-500">
                      {p.code}
                    </span>
                    <span className="text-sm font-medium">{p.name}</span>
                    <Link
                      href={`/app/projects/${p.code}`}
                      className="mt-1 text-xs text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open project →
                    </Link>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="relative">
          <PortfolioMap
            projects={pins}
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
            onMapClick={(lngLat) => {
              setDroppedPin(lngLat);
              setDrawerOpen(true);
            }}
            dropMode={drawerOpen}
          />
        </div>
      </section>

      <NewProjectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        droppedPin={droppedPin}
        onCreated={(code) => setSelectedCode(code)}
      />
    </main>
  );
}

function DevBanner() {
  return (
    <div className="p-4">
      <p className="text-sm font-semibold text-amber-700">
        Supabase not yet connected.
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        Set{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
          NEXT_PUBLIC_SUPABASE_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </code>{" "}
        in <code>.env.local</code>, run the migrations in{" "}
        <code>supabase/migrations</code>, and make sure the signed-in user has
        an <code>app_metadata.org_id</code> claim.
      </p>
    </div>
  );
}
