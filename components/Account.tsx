// Who is signed in, and a way out. Server component: reads the session itself.
// Lives on the dark header, so it uses the night tokens. Links stay underlined white there.
import Link from "next/link";
import { auth, signOut } from "@/auth";

const nightLink = "text-night-ink underline hover:no-underline";

export async function Account() {
  const session = await auth();
  if (!session?.user) {
    return <Link href="/login" className={`whitespace-nowrap ${nightLink}`}>Sign in</Link>;
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <form action={signOutAction} className="flex items-center gap-2">
      <span className="hidden whitespace-nowrap rounded-pill border border-night-muted px-2.5 py-1 text-xs text-night-ink sm:inline">
        {session.user.name ?? session.user.email}
      </span>
      <button type="submit" className={`whitespace-nowrap ${nightLink}`}>Sign out</button>
    </form>
  );
}
