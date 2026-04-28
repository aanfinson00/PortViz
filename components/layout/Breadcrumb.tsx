"use client";

import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Persistent crumb trail for /app/* pages. Pass each level as a Crumb; the
 * last crumb renders as plain text (current page). Earlier crumbs render as
 * Links so the user can always pop up one level without hunting for a back
 * button.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
      <Link href="/app" className="hover:text-neutral-900 hover:underline">
        Portfolio
      </Link>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            <span className="text-neutral-300">/</span>
            {c.href && !isLast ? (
              <Link
                href={c.href}
                className="hover:text-neutral-900 hover:underline"
              >
                {c.label}
              </Link>
            ) : (
              <span className="font-medium text-neutral-700">{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
