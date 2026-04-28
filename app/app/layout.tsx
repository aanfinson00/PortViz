import { CommandPalette } from "@/components/layout/CommandPalette";

/**
 * Layout for the authenticated app shell. The Cmd-K command palette mounts
 * here (rather than in the root layout) so it doesn't fire org-scoped tRPC
 * queries on public surfaces like /share/[token] and /login.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <CommandPalette />
    </>
  );
}
