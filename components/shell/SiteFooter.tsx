"use client";
// The USWDS slim footer on every screen (D-0001): the six screens again, and where the code lives.
import { Footer, FooterNav } from "@trussworks/react-uswds";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREENS } from "./screens";

const SOURCE = "https://github.com/Danvu772/DisasterDeck";

export function SiteFooter() {
  const path = usePathname();
  if (path.startsWith("/v2")) return null;
  return (
    <Footer
      size="slim"
      className="dd-shell-footer"
      returnToTop={
        <div className="grid-container usa-footer__return-to-top">
          <a href="#main-content">Return to top</a>
        </div>
      }
      primary={
        <div className="grid-container">
          <FooterNav
            size="slim"
            aria-label="Footer"
            links={SCREENS.map((s) => (
              <Link key={s.href} href={s.href} className="usa-footer__primary-link">{s.label}</Link>
            ))}
          />
        </div>
      }
      secondary={
        <p className="m-0">
          Disaster Deck, one shared desk for disaster response.{" "}
          <a className="usa-link" href={SOURCE}>Source code on GitHub</a>
        </p>
      }
    />
  );
}
