"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Portfolio" },
  { href: "/app/tenants", label: "Tenants" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();
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
    </nav>
  );
}
