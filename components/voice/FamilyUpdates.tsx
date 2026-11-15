"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Update = { _id: string; alias: string; summary: string; sourceAt: string; expiresAt: string; revoked: boolean; demo: boolean };
export function FamilyUpdates({ userId }: { userId: string }) {
  const url = "/api/voice/updates?user=" + encodeURIComponent(userId);
  const [sites, setSites] = useState<{ _id: string; address: string }[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [storage, setStorage] = useState("");
  const [credentials, setCredentials] = useState<{ reference: string; pin: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "mt-1 block w-full rounded-button border border-line bg-paper p-3";

  useEffect(() => {
    let disposed = false;
    fetch(url).then(async u => {
      const data = await u.json();
      if (!u.ok) throw new Error(data.error);
      if (disposed) return;
      setUpdates(data.updates); setStorage(data.storage); setSites(data.sites ?? []);
    }).catch(() => { if (!disposed) setError("Coordinator access or board unavailable. Sign in as a coordinator, or use the local demo."); });
    return () => { disposed = true; };
  }, [url, userId]);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setCredentials(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId: form.get("siteId"), alias: form.get("alias"), summary: form.get("summary"), sourceAt: new Date(String(form.get("sourceAt"))).toISOString() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setCredentials(data);
      const list = await fetch(url); if (list.ok) setUpdates((await list.json()).updates);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish update"); }
    finally { setBusy(false); }
  }
  async function revoke(reference: string) {
    setBusy(true); setError("");
    try {
      const result = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference, revoke: true }) });
      if (!result.ok) throw new Error("Could not revoke access");
      setUpdates(old => old.map(u => u._id === reference ? { ...u, revoked: true } : u));
      if (credentials?.reference === reference) setCredentials(null);
    } catch { setError("Could not revoke access. Try again."); }
    finally { setBusy(false); }
  }
  return <>
    <p className="text-sm font-bold">Storage: {storage || "checking…"}{storage.includes("temporary") && " · Synthetic exercise only; updates disappear on server restart."}</p>
    <form onSubmit={publish} className="space-y-4 rounded-card border border-line bg-card p-5">
      <label className="block font-bold">Existing case<select name="siteId" required className={field}><option value="">Select a case</option>{sites.map(s => <option key={s._id} value={s._id}>{s.address} ({s._id})</option>)}</select></label>
      <label className="block font-bold">Family-facing display name<input name="alias" required maxLength={80} placeholder="Demo family case A" className={field} /></label>
      <label className="block font-bold">Approved update<textarea name="summary" required maxLength={1500} rows={4} placeholder="State only verified, shareable facts. In the demo, use a clearly fictional example." className={field} /></label>
      <label className="block font-bold">When was this information observed?<input name="sourceAt" type="datetime-local" required className={field} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1" />I verified this update, have permission to share it, and will give access only to the intended recipient. A site alone does not establish a person’s identity.</label>
      <button disabled={busy || sites.length === 0} className="rounded-button bg-primary px-5 py-3 font-bold text-card disabled:opacity-50">Publish approved update</button>
    </form>
    {credentials && <div role="status" className="space-y-2 rounded-card border border-line bg-card p-5"><p className="font-bold">PIN is shown only now. Share privately with the intended family.</p><p>Reference: <code>{credentials.reference}</code></p><p>PIN: <code>{credentials.pin}</code></p><Link href="/family" className="font-bold text-primary underline">Open the family voice portal</Link><button onClick={() => setCredentials(null)} className="ml-4 underline">Hide credentials</button></div>}
    {error && <p role="alert">{error}</p>}
    <h2 className="text-xl font-bold">Published updates</h2>
    {updates.map(u => <article key={u._id} className="space-y-2 rounded-card border border-line bg-card p-4"><h3 className="font-bold">{u.alias}{u.demo && " · DEMO"}</h3><p>{u.summary}</p><p className="text-sm text-muted">Source: {u.sourceAt} · Expires: {u.expiresAt}</p><p className="font-mono text-sm">{u._id}</p>{u.revoked ? <p>Revoked</p> : <button disabled={busy} onClick={() => void revoke(u._id)} className="rounded-button border border-line px-4 py-2">Revoke access</button>}</article>)}
  </>;
}
