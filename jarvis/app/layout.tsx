import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JARVIS Command Center",
  description: "Goals, ledger, and pace, computed deterministically.",
};

export const viewport: Viewport = {
  themeColor: "#07111e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
