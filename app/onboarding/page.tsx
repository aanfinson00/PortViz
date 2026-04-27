"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/trpc/react";

export default function OnboardingPage() {
  const router = useRouter();
  const me = api.auth.me.useQuery(undefined, { retry: false });
  const bootstrap = api.auth.bootstrapOrg.useMutation();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await bootstrap.mutateAsync({ name, slug });
      // Refresh the session so the new app_metadata.org_id claim lands in the
      // access token. Without this, the JWT keeps the old (claim-less) shape
      // until next login.
      const supabase = createClient();
      await supabase.auth.refreshSession();
      router.push("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (me.data?.signedIn === false) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <h1 className="text-2xl font-bold">Sign in first</h1>
        <p className="mt-2 text-sm text-neutral-600">
          You need to be signed in to set up your organization.
        </p>
        <a
          href="/login"
          className="mt-6 self-start rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Go to sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Set up your portfolio</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Pick a name and short code for your organization. Everything you create
        in PortViz lives inside it.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <Field label="Organization name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Holdings"
            required
            autoFocus
            className={inputClass}
          />
        </Field>
        <Field label="Short slug" hint="A-Z and 0-9, up to 10 chars. E.g. ACME.">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toUpperCase())}
            pattern="[A-Z0-9]{1,10}"
            maxLength={10}
            required
            className={inputClass}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Setting up…" : "Create organization"}
        </button>
      </form>
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
