"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { FootprintEditor } from "@/components/map/FootprintEditor";
import { api } from "@/lib/trpc/react";

export default function NewBuildingPage({
  params,
}: {
  params: Promise<{ projectCode: string }>;
}) {
  const router = useRouter();
  const { projectCode } = use(params);
  const projectQuery = api.project.byCode.useQuery(
    { code: projectCode.toUpperCase() },
    { retry: false },
  );
  const utils = api.useUtils();
  const create = api.building.create.useMutation({
    onSuccess: async (b) => {
      await utils.building.listByProject.invalidate();
      router.push(`/app/projects/${projectCode.toUpperCase()}/buildings/${b.code}`);
    },
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [heightFt, setHeightFt] = useState("32");
  const [clearHeightFt, setClearHeightFt] = useState("");
  const [officeSf, setOfficeSf] = useState("0");
  const [warehouseSf, setWarehouseSf] = useState("0");
  const [footprint, setFootprint] = useState<Polygon | null>(null);

  const center: [number, number] =
    projectQuery.data?.lng != null && projectQuery.data?.lat != null
      ? [projectQuery.data.lng, projectQuery.data.lat]
      : [-98.5795, 39.8283];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectQuery.data?.id) return;
    create.mutate({
      projectId: projectQuery.data.id,
      code,
      name: name || undefined,
      footprint: footprint ?? undefined,
      heightFt: heightFt ? Number(heightFt) : undefined,
      clearHeightFt: clearHeightFt ? Number(clearHeightFt) : undefined,
      officeSf: officeSf ? Number(officeSf) : 0,
      warehouseSf: warehouseSf ? Number(warehouseSf) : 0,
      numFloors: 1,
    });
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <Link
            href={`/app/projects/${projectCode.toUpperCase()}`}
            className="text-sm text-blue-600 hover:underline"
          >
            ← {projectCode.toUpperCase()}
          </Link>
          <h1 className="mt-1 text-lg font-semibold">New building</h1>
          <p className="text-sm text-neutral-500">
            Draw the footprint on the map, then enter the height and SF.
          </p>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto bg-white p-6"
        >
          <Field label="Building code" hint="1-10 uppercase letters or digits. E.g. A.">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={10}
              pattern="[A-Z0-9]{1,10}"
              className={inputClass}
            />
          </Field>

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (ft)">
              <input
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </Field>
            <Field label="Clear height (ft)">
              <input
                value={clearHeightFt}
                onChange={(e) => setClearHeightFt(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Office SF">
              <input
                value={officeSf}
                onChange={(e) => setOfficeSf(e.target.value)}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field label="Warehouse SF">
              <input
                value={warehouseSf}
                onChange={(e) => setWarehouseSf(e.target.value)}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-600">
            {footprint
              ? `Footprint captured (${footprint.coordinates[0]?.length ?? 0} points).`
              : "Use the polygon tool on the map to trace the footprint."}
          </div>

          {create.error && (
            <p className="text-sm text-red-600">{create.error.message}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              href={`/app/projects/${projectCode.toUpperCase()}`}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={create.isPending || !projectQuery.data?.id}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create building"}
            </button>
          </div>
        </form>

        <div className="relative">
          <FootprintEditor
            center={center}
            value={footprint}
            onChange={setFootprint}
          />
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}
