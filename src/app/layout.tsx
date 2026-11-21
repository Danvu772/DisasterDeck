import type { Metadata } from "next";
import "./globals.css";
import "./uswds.scss";
import { Account } from "@/components/Account";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { THEME_SCRIPT } from "@/components/theme/script";

// Fonts come from USWDS (app/uswds.scss), served from this app: Public Sans, and Roboto Mono for
// ids, times, scores and counts. No request to Google Fonts.

export const metadata: Metadata = {
  title: "Disaster Deck",
  description: "One shared desk for disaster response: every report, task and shelter in one place.",
};

// The shell (D-0001): skip link, USWDS header, the screen, USWDS footer. The screen and the footer
// scroll together under the header, so full-height screens (map, desk) still fill the window.
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
      <body className="flex h-dvh flex-col antialiased">
        <a className="usa-skipnav" href="#main-content">Skip to main content</a>
        <SiteHeader account={<Account />} />
        <div id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
