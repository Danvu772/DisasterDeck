import { Sparkles } from "lucide-react";
import type { Message } from "@/lib/types";

// The agent speaks in info blue on the left; people speak in grey on the right.
// The hidden colon keeps "Agent: …" as one readable line for screen readers.
export function ChatLine({ m, name }: { m: Pick<Message, "from" | "text">; name: string }) {
  const agent = m.from === "agent";
  return (
    <div className={`flex max-w-[88%] flex-col gap-1 ${agent ? "self-start" : "self-end items-end"}`}>
      <p className={`whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
        agent ? "rounded-tl-md bg-info-soft text-foreground" : "rounded-tr-md bg-secondary text-secondary-foreground"}`}>
        <span className={`mb-0.5 flex items-center gap-1 text-xs font-medium ${agent ? "text-info" : "text-muted-foreground"}`}>
          {agent && <Sparkles className="size-3" aria-hidden />}
          {agent ? "Agent" : name || "You"}<span className="sr-only">:</span>
        </span>
        {" "}{m.text}
      </p>
    </div>
  );
}
