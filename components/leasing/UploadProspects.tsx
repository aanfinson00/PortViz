"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc/react";

interface RowError {
  sheet: string;
  rowIndex: number;
  message: string;
}

type Result =
  | { ok: true; stage: "committed"; summary: Record<string, number> }
  | {
      ok: false;
      stage: "validation" | "commit";
      errors: RowError[];
      summary?: Record<string, number>;
      failedSheet?: string;
    };

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal uploader for the leasing-prospect XLSX. Mirrors the bulk-import
 * page's UX: download → fill in → upload, with a per-row validation
 * report when anything's off. Embedded as a dialog rather than a separate
 * route since the leasing tracker page is the focus.
 */
export function UploadProspects({ open, onClose }: Props) {
  const utils = api.useUtils();
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
      const res = await fetch("/api/leasing-prospects/import", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as Result | { error: string };
      if ("error" in json) {
        setGenericError(json.error);
      } else {
        setResult(json);
        if (json.ok) {
          await utils.leasingProspect.list.invalidate();
          await utils.leasingProspect.summary.invalidate();
        }
      }
    } catch (e) {
      setGenericError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-neutral-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Upload pipeline (Excel)</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Bulk import or refresh your leasing prospects from Excel.
              Re-uploading the same file is safe — rows with a matching{" "}
              <code className="font-mono">code</code> are updated in place.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Close
          </button>
        </header>

        <section className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold">1. Download the template</h3>
          <p className="mt-1 text-xs text-neutral-500">
            One Prospects sheet plus an Instructions sheet and a Stages
            reference. Row 1 is column headers, row 2 is hint text
            (auto-skipped by the parser).
          </p>
          <a
            href="/api/leasing-prospects/template"
            download="portviz-leasing-pipeline-template.xlsx"
            className="mt-3 inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Download template (.xlsx)
          </a>
        </section>

        <section className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold">2. Upload the filled-in file</h3>
          <p className="mt-1 text-xs text-neutral-500">
            We validate every row first. Any error halts the import — fix the
            rows we flag and re-upload.
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
            <h3 className="text-sm font-semibold text-emerald-800">
              Imported successfully
            </h3>
            <ul className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-sm text-emerald-900">
              {Object.entries(result.summary).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="capitalize">{k}</span>
                  <span className="font-mono font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result && !result.ok && (
          <section className="rounded-md border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-800">
              {result.stage === "validation"
                ? "Validation failed — nothing was imported"
                : "Import failed — partial state may exist"}
            </h3>
            <p className="mt-1 text-xs text-red-700">
              Fix the rows below in your file and re-upload.
            </p>
            <div className="mt-3 max-h-[50vh] overflow-y-auto rounded border border-red-200 bg-white">
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
      </div>
    </div>
  );
}
