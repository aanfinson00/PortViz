"use client";

import { useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

interface NewProjectDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Pre-filled from a map click. User can still edit. */
  droppedPin?: { lng: number; lat: number } | null;
  onCreated?: (projectCode: string) => void;
}

export function NewProjectDrawer({
  open,
  onClose,
  droppedPin,
  onCreated,
}: NewProjectDrawerProps) {
  const utils = api.useUtils();
  const create = api.project.create.useMutation({
    onSuccess: async (created) => {
      await utils.project.list.invalidate();
      toastSuccess(`Created project ${created.code}`);
      onCreated?.(created.code);
      onClose();
    },
    onError: (e) => toastError(e.message),
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (droppedPin) {
      setLat(droppedPin.lat.toFixed(6));
      setLng(droppedPin.lng.toFixed(6));
    }
  }, [droppedPin]);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setCode("");
      setName("");
      setAddress("");
      setLat("");
      setLng("");
      setDescription("");
      create.reset();
    }
  }, [open, create]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      code,
      name,
      address: address || undefined,
      description: description || undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-neutral-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl"
      >
        <header>
          <h2 className="text-lg font-semibold">New project</h2>
          <p className="text-sm text-neutral-500">
            Add a project to drop a pin on the portfolio map. You can add
            buildings and bays after it&rsquo;s created.
          </p>
        </header>

        <Field label="Project code" hint="1-10 uppercase letters or digits. E.g. ATL01.">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            maxLength={10}
            pattern="[A-Z0-9]{1,10}"
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </Field>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </Field>

        <Field label="Address">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </Field>
          <Field label="Longitude">
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </Field>
        </div>
        {!droppedPin && (
          <p className="-mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Heads up:</strong> without a latitude/longitude no pin
            will appear on the map. Either type coordinates above or close
            this panel, click the map, and reopen.
          </p>
        )}
        {droppedPin && (
          <p className="-mt-2 text-xs text-emerald-700">
            Pinned at {droppedPin.lat.toFixed(4)}, {droppedPin.lng.toFixed(4)}.
          </p>
        )}

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </Field>

        {create.error && (
          <p className="text-sm text-red-600">{create.error.message}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}

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
