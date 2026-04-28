import type { Metadata } from "next";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "PortViz — 3D Portfolio & Lease Visualization",
  description:
    "Visualize your commercial real estate portfolio on a 3D map. Model buildings, demise spaces, and manage leases.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>
          {children}
          <CommandPalette />
          <Toaster />
        </TRPCReactProvider>
      </body>
    </html>
  );
}
