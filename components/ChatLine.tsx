import type { Message } from "@/lib/types";

// Who said it is a bold label, "Agent" or the person's name. That is the multiplayer cue.
// Agent lines are machine output, so they go in mono. People stay in Public Sans.
export function ChatLine({ m, name }: { m: Pick<Message, "from" | "text">; name: string }) {
  const agent = m.from === "agent";
  return (
    <p className={`max-w-[85%] whitespace-pre-line rounded-card border border-line px-3 py-2 text-sm ${
      agent ? "self-start bg-card font-mono" : "self-end bg-line font-sans"}`}>
      <span className="font-bold">{agent ? "Agent" : name}:</span> {m.text}
    </p>
  );
}
