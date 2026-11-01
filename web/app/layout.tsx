import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { brandingInitScript } from "@/lib/branding";
import { themeInitScript } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

// No static <title>: the organisation's product name is applied at runtime (lib/branding.tsx)
export const metadata: Metadata = {
  description: "Payroll, attendance and leave management system",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: brandingInitScript + themeInitScript }} />
      </head>
      {/* Browser extensions (e.g. Grammarly) inject attributes into <body> before React loads;
          this ignores attribute differences on <body> only — children are still checked */}
      <body className="font-sans antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
