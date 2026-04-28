"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/app", label: "Portfolio" },
  { href: "/app/tenants", label: "Tenants" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-1 border-r border-neutral-200 pr-3 text-sm">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2.5 py-1 ${
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
      <span className="ml-2 hidden items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] text-neutral-500 md:inline-flex">
        ⌘K to search
      </span>
      <button
        onClick={handleSignOut}
        className="ml-1 rounded-md px-2.5 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        Sign out
      </button>
    </nav>
  );
}
