"use client";

import { useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { api } from "@/lib/trpc/react";

export default function SettingsPage() {
  const org = api.org.current.useQuery(undefined, { retry: false });
  const members = api.org.members.useQuery(undefined, { retry: false });
  const invites = api.org.listInvites.useQuery(undefined, { retry: false });

  const utils = api.useUtils();
  const invite = api.org.createInvite.useMutation({
    onSuccess: () => utils.org.listInvites.invalidate(),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      <Breadcrumb crumbs={[{ label: "Settings" }]} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Settings</h1>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Organization</h2>
        {org.isLoading && (
          <p className="mt-2 text-sm text-neutral-500">Loading…</p>
        )}
        {org.data && (
          <p className="mt-2 text-sm text-neutral-600">
            {org.data.name}{" "}
            <span className="font-mono text-xs text-neutral-500">
              ({org.data.slug})
            </span>
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Members</h2>
        {members.isLoading && (
          <p className="mt-2 text-sm text-neutral-500">Loading members…</p>
        )}
        {members.data && (
          <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
            {members.data.map(
              (m: { user_id: string; role: string; created_at: string }) => (
                <li key={m.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-mono text-xs">{m.user_id}</span>
                  <span className="capitalize">{m.role}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Invites</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Generate an invite link. Email delivery is your responsibility — copy
          the URL from the list below and send it however you like.
        </p>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            invite.mutate({ email, role });
            setEmail("");
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className={inputClass}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={invite.isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {invite.isPending ? "Inviting…" : "Generate invite"}
          </button>
        </form>

        {invites.data && invites.data.length > 0 && (
          <ul className="mt-6 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
            {invites.data.map(
              (inv: {
                id: string;
                email: string;
                role: string;
                created_at: string;
                accepted_at: string | null;
              }) => (
                <li key={inv.id} className="px-4 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{inv.email}</span>
                    <span className="text-xs text-neutral-500">
                      {inv.accepted_at
                        ? `accepted ${new Date(inv.accepted_at).toLocaleDateString()}`
                        : `invited ${new Date(inv.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 capitalize">
                    {inv.role}
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}

const inputClass =
  "w-full min-w-[16rem] rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
