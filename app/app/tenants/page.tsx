"use client";

import Link from "next/link";
import { useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

export default function TenantsPage() {
  const tenantsQuery = api.tenant.list.useQuery(undefined, { retry: false });
  const [creating, setCreating] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <Breadcrumb crumbs={[{ label: "Tenants" }]} />

      <header className="mt-4 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Every tenant across your portfolio, with a brand color used to
            shade their spaces on the 3D map.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New tenant
        </button>
      </header>

      {tenantsQuery.isLoading && (
        <p className="mt-8 text-sm text-neutral-500">Loading tenants…</p>
      )}

      {tenantsQuery.isError && (
        <p className="mt-8 text-sm text-red-600">
          Couldn&rsquo;t load tenants. {tenantsQuery.error.message}
        </p>
      )}

      {tenantsQuery.data && tenantsQuery.data.length === 0 && (
        <p className="mt-8 text-sm text-neutral-500">
          No tenants yet. Create one to attach to a lease.
        </p>
      )}

      {tenantsQuery.data && tenantsQuery.data.length > 0 && (
        <ul className="mt-8 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
          {tenantsQuery.data.map(
            (t: {
              id: string;
              code: string;
              name: string;
              contact_name: string | null;
              contact_email: string | null;
              brand_color: string | null;
            }) => (
              <li key={t.id} className="flex items-center gap-4 px-4 py-3">
                <span
                  className="inline-block h-6 w-6 flex-shrink-0 rounded-full border border-neutral-200"
                  style={{ background: t.brand_color ?? "#e5e7eb" }}
                />
                <div className="flex-1">
                  <p className="font-mono text-xs text-neutral-500">
                    {t.code}
                  </p>
                  <p className="text-sm font-medium">{t.name}</p>
                </div>
                <div className="text-right text-xs text-neutral-600">
                  {t.contact_name && <p>{t.contact_name}</p>}
                  {t.contact_email && <p>{t.contact_email}</p>}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <NewTenantDialog open={creating} onClose={() => setCreating(false)} />
    </main>
  );
}

function NewTenantDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const create = api.tenant.create.useMutation({
    onSuccess: async (t) => {
      await utils.tenant.list.invalidate();
      toastSuccess(`Created tenant ${t.code}`);
      onClose();
    },
    onError: (e) => toastError(e.message),
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      code,
      name,
      contactName: contactName || undefined,
      contactEmail: contactEmail || undefined,
      contactPhone: contactPhone || undefined,
      brandColor: brandColor || undefined,
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
        <h2 className="text-lg font-semibold">New tenant</h2>

        <Field label="Code" hint="1-10 uppercase letters or digits. E.g. ACME.">
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
            required
            className={inputClass}
          />
        </Field>

        <Field label="Contact name">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Brand color">
          <input
            type="color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-10 w-20 rounded-md border border-neutral-300"
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
            {create.isPending ? "Creating…" : "Create tenant"}
          </button>
        </div>
      </form>
    </div>
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
