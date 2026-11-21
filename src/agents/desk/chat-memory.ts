// Chat memory for the personal agents, on MongoDB (collection `agent_memory`, one doc per person).
// Owned by Role 2. The agent sees the last few chat lines word for word, plus a short summary of
// everything older. The summary is written after a turn (agents/personal/memory.ts), never while
// the person waits.
//
//   lines newer than the summary  shown word for word, at most CHAT_SHOW_MAX
//   once there are more than CHAT_FOLD_AT of them, the oldest are folded into the summary,
//   leaving CHAT_KEEP word for word
// If the summarizer fails, the agent still sees the newest CHAT_SHOW_MAX lines (as before).

import { cols, getDb } from "../../lib/db";
import type { Message } from "../../lib/types";

export const CHAT_KEEP = 6;
export const CHAT_FOLD_AT = 12;
export const CHAT_SHOW_MAX = 12;

export interface ChatMemoryDoc {
  _id: string;          // user id
  summary: string;      // English, at most ~120 words
  upTo: Date;           // ts of the last chat line the summary covers
  updatedAt: Date;
}

export async function memoryCol() {
  return (await getDb()).collection<ChatMemoryDoc>("agent_memory");
}

/** The summary and the chat lines after it, oldest first. Two queries, run side by side. */
export async function loadChat(userId: string): Promise<{ summary?: string; lines: Message[] }> {
  const [{ messages }, mem] = await Promise.all([cols(), memoryCol()]);
  const [memo, newest] = await Promise.all([
    mem.findOne({ _id: userId }),
    messages.find({ userId }).sort({ ts: -1 }).limit(CHAT_SHOW_MAX).toArray(),
  ]);
  const lines = memo ? newest.filter((m) => m.ts > memo.upTo) : newest;
  return { summary: memo?.summary, lines: lines.reverse() };
}
