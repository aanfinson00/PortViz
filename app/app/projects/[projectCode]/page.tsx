"use client";

import Link from "next/link";
import { use, useState } from "react";
import { api } from "@/lib/trpc/react";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectCode: string }>;
}) {
  const { projectCode } = use(params);
  const project = api.project.byCode.useQuery(
    { code: projectCode.toUpperCase() },
    { retry: false },
  );
  const buildings = api.building.listByProject.useQuery(
    { projectId: project.data?.id ?? "" },
    { enabled: Boolean(project.data?.id), retry: false },
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <Link href="/app" className="text-sm text-blue-600 hover:underline">
        ← Back to portfolio
      </Link>

      {project.isLoading && (
        <p className="mt-8 text-sm text-neutral-500">Loading project…</p>
      )}

      {project.isError && (
        <p className="mt-8 text-sm text-red-600">
          Couldn&rsquo;t load project. {project.error.message}
        </p>
      )}

      {project.data === null && (
        <p className="mt-8 text-sm text-neutral-500">
          No project with code{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            {projectCode.toUpperCase()}
          </code>
          .
        </p>
      )}

      {project.data && (
        <>
          <header className="mt-4">
            <p className="font-mono text-xs text-neutral-500">
              {project.data.code}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {project.data.name}
            </h1>
            {project.data.address && (
              <p className="mt-1 text-sm text-neutral-600">
                {project.data.address}
              </p>
            )}
            {project.data.description && (
              <p className="mt-4 max-w-2xl text-neutral-700">
                {project.data.description}
              </p>
            )}
          </header>

          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Buildings</h2>
              <Link
                href={`/app/projects/${project.data.code}/buildings/new`}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Add building
              </Link>
            </div>

            {buildings.isLoading && (
              <p className="mt-4 text-sm text-neutral-500">
                Loading buildings…
              </p>
            )}

            {buildings.data?.length === 0 && (
              <p className="mt-4 text-sm text-neutral-500">
                No buildings yet. Building drawing + 3D extrusion lands in
                Phase 3.
              </p>
            )}

            {buildings.data && buildings.data.length > 0 && (
              <ul className="mt-4 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
                {buildings.data.map(
                  (b: {
                    id: string;
                    code: string;
                    name: string | null;
                    total_sf: number | null;
                  }) => (
                    <li key={b.id}>
                      <Link
                        href={`/app/projects/${project.data.code}/buildings/${b.code}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                      >
                        <div>
                          <p className="font-mono text-xs text-neutral-500">
                            {project.data.code}-{b.code}
                          </p>
                          <p className="text-sm font-medium">
                            {b.name ?? `Building ${b.code}`}
                          </p>
                        </div>
                        <span className="text-sm text-neutral-600">
                          {b.total_sf ? `${b.total_sf.toLocaleString()} SF` : "—"}
                        </span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          <ShareLinks projectId={project.data.id} />
        </>
      )}
    </main>
  );
}

function ShareLinks({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const list = api.share.listForProject.useQuery(
    { projectId },
    { retry: false },
  );
  const create = api.share.create.useMutation({
    onSuccess: () => utils.share.listForProject.invalidate({ projectId }),
  });
  const revoke = api.share.revoke.useMutation({
    onSuccess: () => utils.share.listForProject.invalidate({ projectId }),
  });
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Public share links</h2>
          <p className="text-sm text-neutral-500">
            Anyone with one of these URLs can view this project&rsquo;s
            buildings in 3D, read-only.
          </p>
        </div>
        <button
          onClick={() => create.mutate({ projectId })}
          disabled={create.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {create.isPending ? "Generating…" : "New share link"}
        </button>
      </div>

      {list.data && list.data.length > 0 ? (
        <ul className="mt-4 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
          {list.data.map(
            (s: {
              id: string;
              token: string;
              created_at: string;
              revoked_at: string | null;
            }) => {
              const url = `${origin}/share/${s.token}`;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <code className="flex-1 truncate rounded bg-neutral-100 px-2 py-1 text-xs">
                    {url}
                  </code>
                  {s.revoked_at ? (
                    <span className="text-xs text-red-600">revoked</span>
                  ) : (
                    <>
                      <button
                        onClick={() => copy(url)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {copied === url ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={() => revoke.mutate({ shareId: s.id })}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </li>
              );
            },
          )}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">No share links yet.</p>
      )}
    </section>
  );
}
