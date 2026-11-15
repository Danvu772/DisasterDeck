// Sign in. SSOJet handles Google, Microsoft and an agency's own sign-in (SAML/OIDC),
// so one button covers all of them. Owner: Role 3.
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { button } from "@/components/encode";
import { isLocalDemo } from "@/lib/localDemo";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  Configuration: "Sign-in is not set up correctly on the server. Check the SSOJet settings in .env.local.",
  AccessDenied: "Your account is not allowed to sign in to this desk.",
  Verification: "The sign-in link expired or was already used. Try again.",
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
    <main className="flex h-full items-center justify-center bg-paper p-6">
     <div className="w-full max-w-md rounded-card border border-line bg-card p-6">
      <h1 className="text-2xl font-bold">Sign in to Disaster Desk</h1>
      <p className="mt-2 text-muted">
        Use your work account. Agencies sign in with their own organization account.
        A new account starts as a citizen, and a coordinator grants any other role.
      </p>

      {error && (
        <div role="alert" className="mt-4 border-l-8 border-act bg-act-soft p-3 text-sm">
          <p className="font-bold">Sign-in failed</p>
          <p>{ERRORS[error] ?? "Something went wrong during sign-in. Try again."}</p>
        </div>
      )}

      <form action={signInWithSSOJet} className="mt-6">
        <button type="submit" className={button.primary}>Sign in with SSOJet</button>
      </form>

      {localDemo && (
        <p className="mt-6 text-sm text-muted">
          Demo laptop? <Link href="/" className="text-primary underline hover:text-primary-dark">Continue without signing in</Link>.
        </p>
      )}
     </div>
    </main>
  );
}
