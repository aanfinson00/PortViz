import Link from "next/link";
import { AppNav } from "@/components/layout/AppNav";

/**
 * Persistent top navigation strip rendered on every authenticated page
 * via app/app/layout.tsx. Houses the brand link (back to portfolio) and
 * the existing AppNav (Portfolio / Tenants / Bulk import / Settings +
 * the Cmd-K hint chip + sign out).
 *
 * Pages used to mount AppNav inline inside their own headers — only the
 * Portfolio page actually did so, which meant clicking into a project
 * stranded users with no nav at all. Lifting it here makes the nav
 * visible at every depth.
 */
export function TopNav() {
  return (
    <header className="flex flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-4">
        <Link
          href="/app"
          className="text-sm font-semibold tracking-tight text-neutral-900 hover:text-neutral-700"
        >
          PortViz
        </Link>
        <AppNav />
      </div>
    </header>
  );
}
