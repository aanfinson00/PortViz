import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
