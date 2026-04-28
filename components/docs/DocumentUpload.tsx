"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/trpc/react";

interface DocumentUploadProps {
  entityType: "project" | "building" | "space" | "tenant" | "lease";
  entityId: string;
}

const DOC_KINDS = [
  { value: "lease", label: "Lease" },
  { value: "site_plan", label: "Site plan" },
  { value: "floor_plan", label: "Floor plan" },
  { value: "photo", label: "Photo" },
  { value: "survey", label: "Survey" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
] as const;

type DocKind = (typeof DOC_KINDS)[number]["value"];

/**
 * Drop-zone style uploader that puts the file in the "documents" Supabase
 * Storage bucket under ORG_ID/ENTITY_TYPE/ENTITY_ID/FILENAME, then records
 * metadata via api.document.create. The bucket and its RLS policies are
 * expected to exist (see supabase/migrations/0003_storage.sql).
 */
export function DocumentUpload({ entityType, entityId }: DocumentUploadProps) {
  const utils = api.useUtils();
  const list = api.document.listByEntity.useQuery(
    { entityType, entityId },
    { retry: false },
  );
  const record = api.document.create.useMutation({
    onSuccess: () => utils.document.listByEntity.invalidate({ entityType, entityId }),
  });

  const [kind, setKind] = useState<DocKind>("other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const orgId = (auth?.user?.app_metadata as { org_id?: string })?.org_id;
      if (!orgId) {
        throw new Error(
          "No org_id on session. Make sure the signed-in user has an app_metadata.org_id claim.",
        );
      }
      const path = `${orgId}/${entityType}/${entityId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { upsert: false });
      if (uploadErr) throw uploadErr;

      await record.mutateAsync({
        entityType,
        entityId,
        kind,
        filePath: path,
        fileName: file.name,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DocKind)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        >
          {DOC_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <label className="cursor-pointer rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          {uploading ? "Uploading…" : "Upload file"}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={uploading}
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {list.isLoading ? (
        <p className="text-sm text-neutral-500">Loading documents…</p>
      ) : list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
          {list.data.map(
            (d: {
              id: string;
              kind: string;
              file_name: string | null;
              file_path: string;
              uploaded_at: string;
            }) => (
              <li
                key={d.id}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{d.file_name ?? d.file_path}</p>
                  <p className="text-xs text-neutral-500">
                    {d.kind} · {new Date(d.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
                <DocLink filePath={d.file_path} />
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">No documents yet.</p>
      )}
    </div>
  );
}

function DocLink({ filePath }: { filePath: string }) {
  const [loading, setLoading] = useState(false);
  const utils = api.useUtils();

  async function handleOpen() {
    setLoading(true);
    try {
      const data = await utils.document.signedUrl.fetch({ filePath });
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={loading}
      className="text-xs text-blue-600 hover:underline"
    >
      {loading ? "Opening…" : "Open"}
    </button>
  );
}
