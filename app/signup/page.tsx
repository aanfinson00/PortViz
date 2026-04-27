"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
      });
      if (err) throw err;
      // If email confirmation is on, session will be null until user clicks
      // the link. Otherwise we have a session and can route into onboarding.
      if (data.session) {
        router.push("/onboarding");
        router.refresh();
      } else {
        setConfirmSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Create account</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Already have one?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
        .
      </p>

      {confirmSent ? (
        <div className="mt-8 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Check your inbox for a confirmation link, then{" "}
          <Link href="/login" className="underline">sign in</Link>.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field label="Password" hint="At least 6 characters.">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create account"}
          </button>
        </form>
      )}
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
