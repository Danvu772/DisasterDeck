// Sign in, in USWDS (D-0001). SSOJet handles Google, Microsoft and an agency's own sign-in
// (SAML/OIDC), so one button covers all of them. The Auth.js wiring (auth.ts) is unchanged;
// Cognito replaces SSOJet in #12 (D-0004).
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertHeading, AlertText, Button } from "@trussworks/react-uswds";
import { auth, signIn } from "@/auth";
import { isLocalDemo } from "@/lib/localDemo";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  Configuration: "Sign-in is not configured on this server.",
  AccessDenied: "Your account is not allowed to sign in to this desk.",
  Verification: "This sign-in link has expired. Try again.",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const next = callbackUrl?.startsWith("/") ? callbackUrl : "/";
  if (await auth()) redirect(next);

  // Only this laptop gets the shortcut. isLocalDemo also checks DEMO_MODE=1.
  const h = await headers();
  const localDemo = isLocalDemo({ headers: h, url: `http://${h.get("host") ?? "localhost"}/login` });

  async function signInWithSSOJet() {
    "use server";
    await signIn("ssojet", { redirectTo: next });
  }

  return (
    <main className="dd-login">
      <div className="dd-login__card">
        <h1 className="usa-heading m-0 text-2xl">Sign in to Disaster Deck</h1>
        <p className="usa-intro mt-2 mb-0 text-base">Use your work or agency account.</p>

        {error && (
          <Alert type="error" className="mt-4" role="alert">
            <AlertHeading level="h2">Sign-in failed</AlertHeading>
            <AlertText>{ERRORS[error] ?? "Something went wrong. Try again."}</AlertText>
          </Alert>
        )}

        <form action={signInWithSSOJet} className="mt-6">
          <Button type="submit" size="big" className="w-full">Continue with SSOJet</Button>
        </form>

        {localDemo && (
          <>
            <p className="my-4 text-center text-sm">or</p>
            <Link href="/" className="usa-button usa-button--outline usa-button--big w-full">
              Continue without signing in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
