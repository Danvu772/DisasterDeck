"use client";
// usePolled, plus a demo switch: with ?demo=1 the screen stays on the fixture desk and never polls,
// so a presenter can show the full story even when the live desk is empty.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePolled } from "../map/usePolled";

export function useDemo(): boolean {
  return useSearchParams().get("demo") === "1";
}

export function useDesk<T>(url: string, initial: T, everyMs = 1000) {
  const demo = useDemo();
  // A url that never answers is not polled fast: usePolled backs off to 10 s. In demo mode we skip it entirely.
  const polled = usePolled<T>(demo ? "/api/health" : url, initial, demo ? 60000 : everyMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!demo) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [demo]);
  return demo ? { data: initial, live: false, now, demo: true } : { ...polled, demo: false };
}
