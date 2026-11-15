// Sign in. SSOJet handles Google, Microsoft and an agency's own sign-in (SAML/OIDC),
// so one button covers all of them. Owner: Role 3.
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { CircleAlert, LifeBuoy, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
    <main className="flex h-full items-center justify-center bg-paper p-4 md:p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xs">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LifeBuoy aria-hidden className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Disaster Desk</h1>
            <p className="text-sm text-muted-foreground">Use your work or agency account.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive-soft p-3 text-sm">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Sign-in failed</p>
              <p className="text-muted-foreground">{ERRORS[error] ?? "Something went wrong. Try again."}</p>
            </div>
          </div>
        )}

        <form action={signInWithSSOJet} className="mt-6">
          <Button type="submit" size="lg" className="w-full">
            <LogIn aria-hidden />
            Continue with SSOJet
          </Button>
        </form>

        {localDemo && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />or<Separator className="flex-1" />
            </div>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/">Continue without signing in</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
