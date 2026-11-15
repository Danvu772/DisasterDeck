import type { Message } from "@/lib/types";

// Who said it is a bold label, "Agent" or the person's name. That is the multiplayer cue.
export function ChatLine({ m, name }: { m: Pick<Message, "from" | "text">; name: string }) {
  const agent = m.from === "agent";
  return (
    <p className="text-sm">
      <span className="font-bold">{agent ? "Agent" : name}:</span> {m.text}
    </p>
  );
}
