// Shift handoff writer: one call over the desk's state and the last hours of events, for
// whoever takes over. Claude Opus 5.5 at medium effort: rare, long input, quality matters.
// Written as the questions an incoming coordinator asks (LLM situation-report study, Sci Rep 2026),
// plus a public notice draft from confirmed facts only (DisasTeller); nothing is published from here.

import { pilot } from "@/lib/pilot";
import { desk } from "../desk";
import { askDesk } from "../desk/view";
import { modelFor, send } from "../shared/llm";

const SYSTEM = `You write the shift handoff note for the incoming coordinator of a disaster coordination desk (${pilot.name}, February 2023 earthquake replay; synthetic data).
Use only the desk state you are given. Never invent a number, a name, an id or an outcome.

Write it as the questions an incoming coordinator asks first, each answered from the data. Plain text, at most 250 words for the questions, in this order:
1. "What did the last shift get done?" Counts from the data, one line.
2. "What needs my decision now?" Open incidents and tasks waiting for approval, most urgent first, each with its id.
3. "Who is still in danger with nobody on it?" Danger-to-life sites with no team, each with its id, source and age.
4. "What is running short?" Open needs and shelters near full, with ids, sources and ages.
5. "What should I not trust yet?" Stale numbers, unconfirmed roads and sites, reports that still need a call.
If the data has nothing for a question, answer "Nothing on the desk."

Then a line "PUBLIC NOTICE (draft, publish only after you approve):" and at most 60 words for citizens, in Turkish and then in English. Use only facts marked confirmed: shelters with free beds and closed roads. Never a rescue site address, a person's name or a phone number. If nothing is confirmed, write "No confirmed facts yet. Do not publish."

No headings with #, no bold. Short lines.`;

export async function writeHandoff(deskId: string, now: Date): Promise<{ ok: boolean; text: string }> {
  const d = desk();
  const [board, events] = await Promise.all([d.getBoard(deskId), d.recentEvents(deskId, 8 * 60)]);
  const view = (topic: Parameters<typeof askDesk>[0]["topic"]) =>
    askDesk({ board, events, role: "coordinator", topic, now });
  const state = [
    "SUMMARY\n" + view("summary"),
    "SITES\n" + view("sites"),
    "NEEDS\n" + view("needs"),
    "SHELTERS\n" + view("shelters"),
    "TASKS\n" + view("tasks"),
  ].join("\n\n");

  const { model, effort } = modelFor("summary");
  const res = await send("shift-handoff", {
    model, max_tokens: 16000, system: SYSTEM,
    output_config: { effort },
    messages: [{ role: "user", content: `Now: ${now.toISOString()}\n\n<desk_state>\n${state}\n</desk_state>` }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens" || !text) {
    return { ok: false, text: "The handoff could not be written this time. Use ask_desk with topic summary instead." };
  }
  return { ok: true, text };
}
