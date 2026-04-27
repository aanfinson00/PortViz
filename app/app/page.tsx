"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { PortfolioMap, type ProjectPinData } from "@/components/map/PortfolioMap";
import { NewProjectDrawer } from "@/components/map/NewProjectDrawer";
import { api } from "@/lib/trpc/react";

export default function PortfolioMapPage() {
  const me = api.auth.me.useQuery(undefined, { retry: false });
  const projectsQuery = api.project.list.useQuery(undefined, {
    retry: false,
    enabled: me.data?.signedIn === true && !!me.data?.orgId,
  });

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [droppedPin, setDroppedPin] = useState<{ lng: number; lat: number } | null>(null);

  const allProjects = useMemo(
    () =>
      ((projectsQuery.data ?? []) as Array<{
        id: string;
        code: string;
        name: string;
        lat: number | null;
        lng: number | null;
      }>),
    [projectsQuery.data],
  );

  const pins = useMemo<ProjectPinData[]>(() => {
    return allProjects.flatMap((p) => {
      if (p.lat == null || p.lng == null) return [];
      return [
        { id: p.id, code: p.code, name: p.name, lng: p.lng, lat: p.lat },
      ];
    });
  }, [allProjects]);

  const authStatus: "loading" | "signed_out" | "no_org" | "ready" =
    me.isLoading
      ? "loading"
      : me.data?.signedIn === false
        ? "signed_out"
        : !me.data?.orgId
          ? "no_org"
          : "ready";

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <AppNav />
          <div>
            <h1 className="text-lg font-semibold">Portfolio</h1>
            <p className="text-sm text-neutral-500">
              Map of all projects across your organization.
            </p>
          </div>
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
          {authStatus === "loading" ? (
            <p className="p-4 text-sm text-neutral-500">Checking session…</p>
          ) : authStatus === "signed_out" ? (
            <SignedOutBanner />
          ) : authStatus === "no_org" ? (
            <NoOrgBanner />
          ) : projectsQuery.isError ? (
            <p className="p-4 text-sm text-red-600">{projectsQuery.error.message}</p>
          ) : projectsQuery.isLoading ? (
            <p className="p-4 text-sm text-neutral-500">Loading projects…</p>
          ) : allProjects.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              No projects yet. Click &ldquo;New project&rdquo; or click on the
              map to drop your first pin.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {allProjects.map((p) => {
                const hasPin = p.lat != null && p.lng != null;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => hasPin && setSelectedCode(p.code)}
                      className={`flex w-full flex-col items-start px-4 py-3 text-left hover:bg-neutral-50 ${
                        selectedCode === p.code ? "bg-neutral-100" : ""
                      }`}
                    >
                      <span className="font-mono text-xs text-neutral-500">
                        {p.code}
                      </span>
                      <span className="text-sm font-medium">{p.name}</span>
                      {!hasPin && (
                        <span className="mt-1 text-xs text-amber-700">
                          No location yet
                        </span>
                      )}
                      <span className="mt-1 flex gap-3 text-xs">
                        <Link
                          href={`/app/projects/${p.code}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open project →
                        </Link>
                        <Link
                          href={`/app/projects/${p.code}/edit`}
                          className="text-neutral-500 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {hasPin ? "Edit" : "Set location"}
                        </Link>
                      </span>
                    </button>
                  </li>
                );
              })}
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

function SignedOutBanner() {
  return (
    <div className="p-4">
      <p className="text-sm font-semibold text-amber-700">You&rsquo;re signed out.</p>
      <p className="mt-1 text-sm text-neutral-600">
        Sign in to view and manage your portfolio.
      </p>
      <div className="mt-4 flex gap-2">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}

function NoOrgBanner() {
  return (
    <div className="p-4">
      <p className="text-sm font-semibold text-amber-700">
        Set up your organization to get started.
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        You&rsquo;re signed in but don&rsquo;t belong to any organization yet.
      </p>
      <Link
        href="/onboarding"
        className="mt-4 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Continue onboarding
      </Link>
    </div>
  );
}
