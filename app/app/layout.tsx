import { CommandPalette } from "@/components/layout/CommandPalette";
import { TopNav } from "@/components/layout/TopNav";

/**
 * Layout for the authenticated app shell. Mounts the persistent top
 * navigation above every /app/* page so users never lose their nav,
 * and the Cmd-K command palette as a sibling so it's only attached
 * inside the authenticated tree (not on /share/[token] or /login).
 *
 * The flex column + flex-1 child wrapper means children that want to
 * fill the remaining viewport can use h-full; children that grow
 * naturally (min-h-screen) work unchanged inside the scrollable
 * container.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <TopNav />
      <div className="flex flex-1 min-h-0 flex-col overflow-auto">
        {children}
      </div>
      <CommandPalette />
    </div>
  );
}
