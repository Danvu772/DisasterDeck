// Who is signed in, and a way out. Server component: reads the session itself.
import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { auth, signOut } from "@/auth";

// It sits in the USWDS header (light in both themes), so its colours are USWDS tokens.
const ghost = "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-usa-base-dark transition-colors hover:bg-usa-base-lightest hover:text-usa-ink";

export async function Account() {
  const session = await auth();
  if (!session?.user) {
    return <Link href="/login" className={ghost}><LogIn className="size-3.5" aria-hidden /><span className="sr-only sm:not-sr-only">Sign in</span></Link>;
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const name = session.user.name ?? session.user.email ?? "";
  return (
    <form action={signOutAction} className="flex items-center gap-1">
      <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs font-medium text-usa-ink sm:inline-flex">
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-usa-primary-lighter text-[10px] font-semibold text-usa-primary-darker">
          {name.charAt(0).toUpperCase()}
        </span>
        {name}
      </span>
      <button type="submit" className={ghost} aria-label="Sign out"><LogOut className="size-3.5" aria-hidden /><span className="sr-only sm:not-sr-only">Sign out</span></button>
    </form>
  );
}
