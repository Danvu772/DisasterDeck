import type { Message } from "@/lib/types";

// People speak in sans, the agent in mono. That is the multiplayer cue.
export function ChatLine({ m, name }: { m: Pick<Message, "from" | "text">; name: string }) {
  const agent = m.from === "agent";
  return (
    <p className={`text-sm ${agent ? "font-mono" : ""}`}>
      <span className="text-muted">{agent ? "agent" : name}:</span> {m.text}
    </p>
  );
}
