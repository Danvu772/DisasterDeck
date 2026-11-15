import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Disaster Desk</h1>
      <p className="mt-2 text-muted">Skeleton. Login and role screens come next.</p>
      <p className="mt-6">
        <Link href="/lab" className="underline">
          /lab
        </Link>{" "}
        <span className="text-muted">every component in every state</span>
      </p>
    </main>
  );
}
