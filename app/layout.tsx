import type { Metadata } from "next";
import { Public_Sans, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Account } from "@/components/Account";

// USWDS faces: Public Sans for all text, headings included.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin", "latin-ext"],
});

// Roboto Mono for ids, times, scores, counts in pills and machine output. Nothing else.
const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
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
        className={`${publicSans.variable} ${robotoMono.variable} flex h-dvh flex-col antialiased`}
      >
        <Nav account={<Account />} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
