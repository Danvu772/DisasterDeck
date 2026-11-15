import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Account } from "@/components/Account";

// USWDS component face: Source Sans for all text, headings included.
const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Disaster Desk",
  description: "One desk, one memory, every group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sourceSans.variable} flex h-dvh flex-col antialiased`}
      >
        <Nav account={<Account />} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
