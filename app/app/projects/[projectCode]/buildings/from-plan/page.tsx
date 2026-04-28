"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { PlaceOnMap } from "@/components/site-plan/PlaceOnMap";
import { TraceCanvas } from "@/components/site-plan/TraceCanvas";
import { codeSchema } from "@/lib/codes";
import { polygonAreaSqFt } from "@/lib/polygonArea";
import { computeScale } from "@/lib/sitePlanScale";
import { squareOffPolygon, type Point } from "@/lib/squareOff";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/trpc/react";

type Step = "upload" | "trace" | "place";

export default function FromPlanWizardPage({
  params,
}: {
  params: Promise<{ projectCode: string }>;
}) {
  const router = useRouter();
  const { projectCode } = use(params);
  const project = api.project.byCode.useQuery(
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

  const [step, setStep] = useState<Step>("upload");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [closed, setClosed] = useState(false);
  const [diagonalEdges, setDiagonalEdges] = useState<Set<number>>(new Set());

  // Form fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [targetSf, setTargetSf] = useState("");
  const [heightFt, setHeightFt] = useState("32");

  // Place step
  const [placedGeom, setPlacedGeom] = useState<Polygon | null>(null);

  const feetPerPixel = closed && targetSf
    ? computeScale(points, Number(targetSf))
    : 0;

  function reset() {
    setImage(null);
    setImageBlob(null);
    setImageDims(null);
    setPoints([]);
    setClosed(false);
    setDiagonalEdges(new Set());
    setPlacedGeom(null);
    setStep("upload");
  }

  async function handleFile(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    let blob: Blob;
    if (isPdf) {
      blob = await renderPdfFirstPage(file);
    } else {
      blob = file;
    }
    const img = await blobToImage(blob);
    setImage(img);
    setImageBlob(blob);
    setImageDims({ w: img.width, h: img.height });
    setStep("trace");
  }

  async function handleSubmit() {
    if (!project.data?.id || !placedGeom || !imageBlob) return;

    // 1. Upload the rendered site plan to Storage.
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const orgId = (auth?.user?.app_metadata as { org_id?: string })?.org_id;
    if (!orgId) {
      alert("No org_id on session — sign out and back in.");
      return;
    }
    const path = `${orgId}/building/incoming/${Date.now()}-trace.png`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, imageBlob, { upsert: false });
    if (upErr) {
      alert(`Site plan upload failed: ${upErr.message}`);
      return;
    }

    // 2. Create the building with footprint + trace metadata.
    create.mutate({
      projectId: project.data.id,
      code,
      name: name || undefined,
      footprint: placedGeom,
      heightFt: heightFt ? Number(heightFt) : undefined,
      numFloors: 1,
      officeSf: 0,
      warehouseSf: targetSf ? Number(targetSf) : 0,
    });
    // Note: site_plan_doc_id linkage and trace_image_dims persistence land
    // in Phase B's router update; for now the upload is preserved and the
    // building is created with the projected footprint.
  }

  // Force-square button.
  function squareOff() {
    setPoints((prev) => squareOffPolygon(prev, { diagonalEdges }));
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
          <h1 className="mt-1 text-lg font-semibold">
            New building from site plan
          </h1>
          <p className="text-sm text-neutral-500">
            Step {step === "upload" ? 1 : step === "trace" ? 2 : 3} of 3 —{" "}
            {step === "upload"
              ? "upload"
              : step === "trace"
                ? "trace + scale"
                : "place on map"}
          </p>
        </div>
        <div className="flex gap-2">
          {step !== "upload" && (
            <button
              onClick={reset}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      {step === "upload" && (
        <UploadStep onFile={handleFile} />
      )}

      {step === "trace" && (
        <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-4 overflow-y-auto bg-white p-6">
            <div>
              <h2 className="text-sm font-semibold">Trace the building outline</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Click corners around the building. Right angles snap by
                default; hold Shift to disable. Click the first point to close.
              </p>
            </div>
            <Field label="Total building SF" hint="Used to calibrate the scale.">
              <input
                value={targetSf}
                onChange={(e) => setTargetSf(e.target.value)}
                inputMode="numeric"
                placeholder="100000"
                className={inputClass}
              />
            </Field>
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
              <p>Vertices: {points.length}{closed ? " (closed)" : ""}</p>
              {feetPerPixel > 0 && (
                <p>Scale: {feetPerPixel.toFixed(3)} ft / pixel</p>
              )}
              {diagonalEdges.size > 0 && (
                <p>Diagonal-locked edges: {diagonalEdges.size}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setPoints((p) => p.slice(0, -1))}
                disabled={points.length === 0 || closed}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Undo last vertex
              </button>
              {!closed && points.length >= 3 && (
                <button
                  type="button"
                  onClick={() => setClosed(true)}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Close polygon
                </button>
              )}
              {closed && (
                <button
                  type="button"
                  onClick={squareOff}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Square off (skip diagonal-locked)
                </button>
              )}
            </div>
            <div className="mt-auto flex gap-2">
              <button
                onClick={() => setStep("upload")}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep("place")}
                disabled={!closed || !targetSf || feetPerPixel <= 0}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Continue →
              </button>
            </div>
          </aside>

          <div className="bg-white">
            <TraceCanvas
              image={image}
              points={points}
              onChange={setPoints}
              closed={closed}
              onClose={() => setClosed(true)}
              diagonalEdges={diagonalEdges}
              onToggleDiagonal={(idx) =>
                setDiagonalEdges((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                })
              }
            />
          </div>
        </section>
      )}

      {step === "place" && project.data && (
        <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-4 overflow-y-auto bg-white p-6">
            <div>
              <h2 className="text-sm font-semibold">Place on the map</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Drag the blue polygon to position it; drag the orange dot to
                rotate.
              </p>
            </div>
            <Field label="Building code">
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
            <Field label="Height (ft)">
              <input
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </Field>
            {placedGeom && (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                Computed area: {polygonAreaSqFt(placedGeom).toFixed(0)} SF
                {targetSf && (
                  <span>
                    {" "}
                    (target: {Number(targetSf).toLocaleString()} SF, Δ{" "}
                    {(
                      ((polygonAreaSqFt(placedGeom) - Number(targetSf)) /
                        Number(targetSf)) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                )}
              </div>
            )}
            {create.error && (
              <p className="text-sm text-red-600">{create.error.message}</p>
            )}
            <div className="mt-auto flex gap-2">
              <button
                onClick={() => setStep("trace")}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={create.isPending || !code || !placedGeom}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {create.isPending ? "Creating…" : "Create building"}
              </button>
            </div>
          </aside>

          <PlaceOnMap
            polygonPx={points}
            feetPerPixel={feetPerPixel}
            initialCenter={
              project.data.lng != null && project.data.lat != null
                ? [project.data.lng, project.data.lat]
                : [-98.5795, 39.8283]
            }
            onChange={(geom) => setPlacedGeom(geom)}
          />
        </section>
      )}
    </main>
  );
}

function UploadStep({ onFile }: { onFile: (f: File) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-1 items-center justify-center bg-neutral-50 p-12">
      <label className="flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-lg border-2 border-dashed border-neutral-300 bg-white p-12 text-center hover:bg-neutral-50">
        <p className="text-base font-medium">Upload a site plan</p>
        <p className="text-sm text-neutral-600">
          PDF, PNG, or JPG. We&rsquo;ll render the first page so you can trace
          on top of it.
        </p>
        <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
          {busy ? "Loading…" : "Choose file"}
        </span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,image/png,image/jpeg"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try {
              await onFile(f);
            } catch (err) {
              alert(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </section>
  );
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });
  return img;
}

async function renderPdfFirstPage(pdf: File): Promise<Blob> {
  // Dynamically import pdfjs only when actually needed.
  const pdfjs = await import("pdfjs-dist");
  // Worker via CDN keeps the bundle slim and avoids needing a custom loader.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const arr = await pdf.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arr }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png");
  });
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

// Suppress codeSchema unused-import warning while keeping it available for
// future client-side validation parity with the router.
codeSchema;
