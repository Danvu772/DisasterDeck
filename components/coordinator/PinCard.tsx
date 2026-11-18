"use client";
import { useId, useState } from "react";
import { Check, LoaderCircle, MapPin } from "lucide-react";
import { Alert, Button, Label, Textarea } from "@trussworks/react-uswds";
import { cn } from "@/lib/utils";
import { statusWord } from "../detail/fields";
import { card, KindGlyph, TierTag } from "./parts";
import type { Rankable } from "./coordinatorItems";

type Sent = { busy: boolean; text?: string; ok?: boolean };

const PIN_DIR = { top: "Pin to top", down: "Push down" } as const;
type Dir = keyof typeof PIN_DIR;

// A site or need the coordinator can re-rank inside its tier (§5.1). Pin and push down need a
// reason (the keeper refuses one without it); removing a pin does not.
export function PinCard({ item, userId, nameOf }: { item: Rankable; userId: string; nameOf: (id: string) => string }) {
  const [dir, setDir] = useState<Dir | null>(null);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState<Sent>({ busy: false });
  const reasonId = useId();
  const ready = dir === null || reason.trim().length > 0;
  const current = item.pin?.dir;

  async function pin(next: Dir | null) {
    setSent({ busy: true, text: "Sending" });
    try {
      const r = await fetch(`/api/events?user=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "correction", source: "person",
          payload: {
            action: "edit", recordType: item.kind, recordId: item.id,
            fields: { pin: next }, reason: next ? reason.trim() : "pin removed",
          },
        }),
      });
      if (r.ok) {
        setSent({ busy: false, ok: true, text: next === "top" ? "Pinned, sent" : next === "down" ? "Pushed down, sent" : "Pin removed, sent" });
        setDir(null);
        setReason("");
      } else {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setSent({ busy: false, ok: false, text: `Not sent: ${body?.error ?? `the desk answered ${r.status}`}` });
      }
    } catch {
      setSent({ busy: false, ok: false, text: "Not sent: the desk did not answer" });
    }
  }

  return (
    <article className={cn(card, "p-4")}>
      <header className="flex items-start gap-3">
        <KindGlyph kind={item.kind} tier={item.tier} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-usa-ink">{item.title}</h3>
          {item.detail && <p className="mt-0.5 text-xs text-usa-base-dark">{item.detail}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <TierTag tier={item.tier} />
          <span className="text-xs text-usa-base-dark">score <span className="font-mono">{item.priority}</span></span>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="usa-tag bg-usa-base-lightest text-usa-ink">{statusWord(item.status)}</span>
        {item.pin && (
          <span className="usa-tag bg-usa-primary-lighter text-usa-ink">
            {item.pin.dir === "top" ? "Pinned to top" : "Pushed down"} by {nameOf(item.pin.by)}
          </span>
        )}
      </div>
      {item.pin && <p className="mt-1 text-xs text-usa-base-dark">{item.pin.reason}</p>}

      {dir === null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-usa-base-lighter pt-3">
          {current !== "top" && <Button type="button" onClick={() => setDir("top")}>Pin to top</Button>}
          {current !== "down" && <Button type="button" outline onClick={() => setDir("down")}>Push down</Button>}
          {item.pin && <Button type="button" outline onClick={() => pin(null)}>Remove pin</Button>}
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2 rounded-md bg-usa-base-lightest p-3"
          onSubmit={(e) => { e.preventDefault(); if (!ready || sent.busy) return; void pin(dir); }}
        >
          <Label htmlFor={reasonId} requiredMarker>Why {PIN_DIR[dir].toLowerCase()} this {item.kind}?</Label>
          <Textarea id={reasonId} name="reason" value={reason} onChange={(e) => setReason(e.target.value)}
            className="bg-usa-white" aria-describedby={`${reasonId}-hint`}
            placeholder="A short reason the desk keeps, e.g. &quot;family called twice&quot;" />
          <p id={`${reasonId}-hint`} className="text-xs text-usa-base-dark">The reason is logged on the record. People in the field will not see it.</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={sent.busy || !ready}>
              <MapPin aria-hidden />{PIN_DIR[dir]} the {item.kind}
            </Button>
            <Button type="button" outline disabled={sent.busy} onClick={() => { setDir(null); setReason(""); }}>Cancel</Button>
          </div>
        </form>
      )}

      {sent.text && (
        !sent.busy && !sent.ok ? (
          <Alert type="error" slim role="status" className="mt-3">{sent.text}</Alert>
        ) : (
          <p role="status" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-usa-ink">
            {sent.busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4 text-usa-success" aria-hidden />}
            {sent.text}
          </p>
        )
      )}
    </article>
  );
}