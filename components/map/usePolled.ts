"use client";
import { useEffect, useState } from "react";

// Poll any JSON endpoint. Until it answers, show `initial` (fixtures) and say so.
// A failing endpoint is asked every 10 s instead of every second, so a missing route
// does not flood the server log.
export function usePolled<T>(url: string, initial: T, everyMs = 1000) {
  const [data, setData] = useState<T>(initial);
  const [live, setLive] = useState(false);
  const [checked, setChecked] = useState(false); // false until the first answer or failure
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      let ok = false;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const body = (await r.json()) as T;
          if (!stop) setData(body);
          ok = true;
        }
      } catch {
        // offline or route missing: keep the last good data
      }
      if (stop) return;
      setLive(ok);
      setChecked(true);
      setNow(Date.now());
      timer = setTimeout(tick, ok ? everyMs : 10000);
    }
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [url, everyMs]);

  return { data, live, now, checked };
}
