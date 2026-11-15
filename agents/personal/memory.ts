// Folds old chat lines into a short running summary (agents/desk/chat-memory.ts has the rules).
// Runs after the reply is sent (Next's after() in /api/chat), so the person never waits for it.
// One cheap call (Claude Haiku 5.5) every ~6 messages, only once a chat is longer than 12 lines.

import { CHAT_FOLD_AT, CHAT_KEEP, memoryCol } from "../desk/chat-memory";
import { cols } from "../../lib/db";
import { modelFor, send } from "../shared/llm";

const SYSTEM = `You keep the memory of a chat between one person and their personal agent on a disaster-response desk.
You get the summary so far and the next chat lines. Write the new summary that replaces the old one.
Keep: what the person reported, asked for or promised; what the agent filed or told them (with ids); their situation (place, people with them, injuries, supplies, vehicle); anything still open.
Drop greetings, thanks and repeats. Never add facts that are not in the input. Never write a full phone number.
At most 120 words, plain English sentences, no headings or lists. Output only the summary.`;

const running = new Set<string>(); // one fold per person at a time, in this process

/** Fold the oldest unsummarized lines into the summary when there are too many. Never throws. */
export async function refreshChatSummary(userId: string): Promise<void> {
  if (running.has(userId)) return;
  running.add(userId);
  try {
    const [{ messages }, mem] = await Promise.all([cols(), memoryCol()]);
    const memo = await mem.findOne({ _id: userId });
    const lines = await messages
      .find(memo ? { userId, ts: { $gt: memo.upTo } } : { userId })
      .sort({ ts: 1 }).limit(60).toArray();
    if (lines.length <= CHAT_FOLD_AT) return;

    const fold = lines.slice(0, lines.length - CHAT_KEEP);
    const { model, effort } = modelFor("digest");
    const res = await send("chat:digest", {
      model, max_tokens: 2000, output_config: { effort },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Summary so far: ${memo?.summary ?? "(none yet)"}\n\nNext chat lines, oldest first:\n` +
          fold.map((m) => `${m.from === "user" ? "Person" : "Agent"}: ${m.text}`).join("\n"),
      }],
    });
    const summary = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (res.stop_reason !== "end_turn" || !summary) {
      console.warn(`[chat memory] ${userId}: no summary (${res.stop_reason}); keeping the old one`);
      return;
    }
    const upTo = fold[fold.length - 1].ts;
    // Only move forward from the memo we read: if another process folded meanwhile, skip.
    const r = memo
      ? await mem.updateOne({ _id: userId, upTo: memo.upTo }, { $set: { summary, upTo, updatedAt: new Date() } })
      : await mem.insertOne({ _id: userId, summary, upTo, updatedAt: new Date() }).catch(() => undefined);
    if (r === undefined || ("matchedCount" in r && r.matchedCount === 0)) {
      console.warn(`[chat memory] ${userId}: another fold won; dropped this one`);
    }
  } catch (e) {
    console.error(`[chat memory] ${userId}:`, e instanceof Error ? e.message : e);
  } finally {
    running.delete(userId);
  }
}
