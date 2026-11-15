import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Account } from "@/components/Account";
import { THEME_SCRIPT } from "@/components/theme/script";

// Geist and Geist Mono, shadcn/ui's faces (theme v5). Mono ONLY for ids, times, scores, counts.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Disaster Deck",
  description: "One shared desk for disaster response: every report, task and shelter in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Dark before first paint, so a dark page never flashes white. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex h-dvh flex-col antialiased`}
      >
        <Nav account={<Account />} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
