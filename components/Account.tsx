// Who is signed in, and a way out. Server component: reads the session itself.
import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Account() {
  const session = await auth();
  if (!session?.user) {
    return <Link href="/login" className="text-primary underline hover:text-primary-dark">Sign in</Link>;
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <form action={signOutAction} className="flex items-baseline gap-2">
      <span className="text-muted">Signed in as <span className="font-bold text-ink">{session.user.name ?? session.user.email}</span></span>
      <button type="submit" className="text-primary underline hover:text-primary-dark">Sign out</button>
    </form>
  );
}
