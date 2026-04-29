"use client";

import { useRef, useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

interface RowError {
  sheet: string;
  rowIndex: number;
  message: string;
}

type Result =
  | {
      ok: true;
      stage: "committed";
      summary: Record<string, number>;
    }
  | {
      ok: false;
      stage: "validation" | "commit";
      errors: RowError[];
      summary?: Record<string, number>;
      failedSheet?: string;
    };

/**
 * Bulk import page: download the XLSX template, fill it in, upload it,
 * see either a success summary or a per-row error report. All-or-nothing
 * semantics — if any row fails validation, no rows are inserted.
 */
export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setBusy(true);
    setResult(null);
    setGenericError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as Result | { error: string };
      if ("error" in json) {
        setGenericError(json.error);
      } else {
        setResult(json);
      }
    } catch (e) {
      setGenericError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-8">
      <Breadcrumb crumbs={[{ label: "Bulk import" }]} />
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Bulk import</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Seed your portfolio from an Excel file — projects, buildings,
          bays, spaces, tenants, and leases in one upload. Polygons
          (footprints, parcels, parking, yards) are added afterwards in
          the app.
        </p>
      </header>

      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">1. Download the template</h2>
        <p className="mt-1 text-xs text-neutral-500">
          One sheet per entity. The first sheet is an Instructions page;
          row 1 of each data sheet is column headers; row 2 is hint text
          (auto-skipped by the parser); row 3 onward is the example to
          replace with your data.
        </p>
        <a
          href="/api/import/template"
          download="portviz-import-template.xlsx"
          className="mt-3 inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Download template (.xlsx)
        </a>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">2. Upload the filled-in file</h2>
        <p className="mt-1 text-xs text-neutral-500">
          We validate every row first. If anything's wrong, you get a
          per-row error report and nothing is inserted. If everything
          passes, all rows commit in dependency order.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <label className="cursor-pointer rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            {busy ? "Uploading…" : "Choose file"}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
          {busy && (
            <span className="text-xs text-neutral-500">
              Parsing + validating…
            </span>
          )}
        </div>
      </section>

      {genericError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {genericError}
        </p>
      )}

      {result?.ok && (
        <section className="rounded-md border border-emerald-300 bg-emerald-50 p-4">
          <h2 className="text-sm font-semibold text-emerald-800">
            Imported successfully
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-emerald-900 sm:grid-cols-3">
            {Object.entries(result.summary).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between">
                <span className="capitalize">{k}</span>
                <span className="font-mono font-medium">{v}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-emerald-800">
            Now open a property in the app to trace footprints, draw
            parking + yard polygons, and assign tenants spatially.
          </p>
        </section>
      )}

      {result && !result.ok && (
        <section className="rounded-md border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-800">
            {result.stage === "validation"
              ? "Validation failed — nothing was imported"
              : `Import failed in ${result.failedSheet ?? "an unknown sheet"} — partial state may exist`}
          </h2>
          <p className="mt-1 text-xs text-red-700">
            Fix the rows below in your file and re-upload.
          </p>
          <div className="mt-3 max-h-[60vh] overflow-y-auto rounded border border-red-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-red-50 text-red-900">
                <tr>
                  <th className="px-2 py-1">Sheet</th>
                  <th className="px-2 py-1">Row</th>
                  <th className="px-2 py-1">Problem</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i} className="border-t border-red-100">
                    <td className="px-2 py-1 font-mono">{e.sheet}</td>
                    <td className="px-2 py-1 font-mono">
                      {e.rowIndex > 0 ? e.rowIndex : "—"}
                    </td>
                    <td className="px-2 py-1">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
