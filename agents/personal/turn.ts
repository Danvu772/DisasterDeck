// One turn of a personal agent (Final system design §7):
// load the person's context from the desk → one Claude call with tools → run the tools
// (each posts one event) → loop until Claude answers → save both chat lines → reply.
// The agent keeps nothing between turns. Everything comes from the desk each time.

import type Anthropic from "@anthropic-ai/sdk";
import { desk, type UserContext } from "../desk";
import { age, incidentLine, needLine, roadLine, shelterLine, siteLine, taskLine } from "../desk/view";
import { quakeLine, recentQuakesNear, type NearbyQuake } from "../research/quakes";
import { BudgetError } from "../shared/cost";
import { modelFor, send } from "../shared/llm";
import { maskPhones } from "../shared/privacy";
import { systemPrompt } from "./prompts";
import { runTool, toolsFor } from "./tools";

export interface TurnInput {
  userId: string;
  text?: string;
  image?: { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };
  coords?: [number, number];
}
export interface TurnResult {
  reply: string;
  eventIds: string[];
  actions: { tool: string; summary: string; ok: boolean }[];   // for the screen: what the agent filed
  model?: string;
}

const MAX_ROUNDS = 5;        // model calls per turn
const MAX_TOOL_CALLS = 8;    // "blankets, a doctor and a report" is 3; leave room, but stop loops

type Msg = Anthropic.Beta.BetaMessageParam;

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const d = desk();
  const ctx = await d.getUserContext(input.userId);
  if (input.coords) ctx.user = { ...ctx.user, coords: input.coords };
  const said = maskPhones(input.text?.trim() ?? "").text;
  if (!said && !input.image) return { reply: "Say or send something and I will take it from there.", eventIds: [], actions: [] };

  const { model, effort } = modelFor("chat");
  let tools = toolsFor(ctx);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // Stable per role → cached after the first turn (tools + system are the prefix).
    { type: "text", text: systemPrompt(ctx.user.role), cache_control: { type: "ephemeral" } },
  ];
  // Aftershocks near this person (scenario clock during a replay). Plain code, no model call.
  const quakes = await recentQuakesNear(ctx.user.coords, 60).catch(() => undefined);
  const messages: Msg[] = [...history(ctx), { role: "user", content: userContent(ctx, said, input.image, quakes) }];

  const eventIds: string[] = [];
  const actions: TurnResult["actions"] = [];
  let toolCalls = 0;
  let searches = 0;
  let reply = "";
  let servedBy: string | undefined;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await send(`chat:${ctx.user.role}`, {
        model, max_tokens: 8000, system, tools, messages, output_config: { effort },
        // Later rounds of the same turn re-send everything: cache the growing tail too.
        cache_control: { type: "ephemeral" },
      });
      servedBy = res.model;
      searches += res.usage.server_tool_use?.web_search_requests ?? 0;
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      reply = text || reply;   // never let an empty last round wipe an earlier answer

      if (res.stop_reason === "refusal") {
        reply = "I can't help with that one here. If someone is in danger, call 112.";
        break;
      }
      if (res.stop_reason === "pause_turn") {           // web search ran long: resume as is
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || calls.length === 0) break;

      messages.push({ role: "assistant", content: res.content });
      // Every tool_use needs a tool_result in the same message. Past the cap, answer with an error.
      const results = await Promise.all(calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        if (toolCalls >= MAX_TOOL_CALLS) {
          actions.push({ tool: c.name, summary: "skipped: too many actions in one message", ok: false });
          return { type: "tool_result", tool_use_id: c.id, is_error: true,
            content: "Skipped: too many actions in one message. Tell the person what was not filed and ask them to repeat it." };
        }
        toolCalls++;
        const out = await runTool(c.name, (c.input ?? {}) as Record<string, unknown>, ctx)
          .catch((e: Error) => ({ content: `Tool failed: ${e.message}`, isError: true, eventId: undefined, summary: undefined }));
        if (out.eventId) eventIds.push(out.eventId);
        if (c.name !== "ask_desk") actions.push({ tool: c.name, summary: out.summary ?? out.content.slice(0, 120), ok: !out.isError });
        return { type: "tool_result", tool_use_id: c.id, content: out.content, is_error: out.isError || undefined };
      }));
      messages.push({ role: "user", content: results });
      // Help-desk web search: at most 2 per turn (max_uses counts per request, not per turn).
      if (searches >= 2) tools = tools.filter((t) => !("type" in t && t.type === "web_search_20260209"));
    }
  } catch (e) {
    if (e instanceof BudgetError) {
      reply = "The agent is paused: the team's AI budget is used up. Your task buttons still work.";
    } else if (eventIds.length === 0) {
      throw e;
    } else {
      // Something was already filed: report it rather than fail, so the person does not repeat it.
      console.error("[agent turn] error after filing", e);
      reply = "";
    }
  }

  if (!reply) {
    const done = actions.filter((a) => a.ok).map((a) => a.summary);
    reply = done.length ? `Filed: ${done.join("; ")}.` : "Sorry, I could not finish that. Try again in a moment.";
  }
  const now = new Date();
  await d.saveMessage({ userId: ctx.user._id, from: "user", text: said || "(photo)", ts: now });
  await d.saveMessage({ userId: ctx.user._id, from: "agent", text: reply, ts: new Date(+now + 1), eventIds });
  return { reply, eventIds, actions, model: servedBy };
}

/** Earlier chat lines as plain alternating turns. Must start with a user turn. */
function history(ctx: UserContext): Msg[] {
  const out: Msg[] = [];
  for (const m of ctx.messages) {
    const role = m.from === "user" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n${m.text}`;
    else out.push({ role, content: m.text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  // The new user turn comes next, so history must end with the assistant.
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

type Quakes = { quakes: NearbyQuake[]; now: Date; replay: boolean } | undefined;

function userContent(ctx: UserContext, said: string, image: TurnInput["image"], quakes: Quakes): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: contextBlock(ctx, quakes) }];
  if (image) blocks.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
  blocks.push({ type: "text", text: `${ctx.user.name} says: ${said || "(sent a photo, no text)"}` });
  return blocks;
}

/** The volatile part of the prompt: this person's slice of the desk, right now. */
export function contextBlock(ctx: UserContext, quakes?: Quakes): string {
  const { user: u, now } = ctx;
  const p = u.profile ?? {};
  const lines: string[] = [
    `<desk_context generated="${now.toISOString()}">`,
    `Person: ${u.name} (id ${u._id}) · role ${u.role} · trust ${u.trust} · region ${u.region}` +
      (u.coords ? ` · position ${u.coords[0].toFixed(3)},${u.coords[1].toFixed(3)}` : ""),
    `Profile: skills ${p.skills?.join(", ") || "none"} · vehicle ${p.vehicle ?? "unknown"}` +
      (p.stock ? ` · stock ${Object.entries(p.stock).map(([k, v]) => `${v} ${k}`).join(", ")}` : "") +
      (p.notes ? ` · notes: ${p.notes}` : ""),
  ];
  const section = (title: string, xs: string[]) => {
    lines.push(`${title}:`);
    lines.push(...(xs.length ? xs.map((x) => `  ${x}`) : ["  none"]));
  };
  section("Their open tasks, top first", ctx.tasks.map((t) => taskLine(t, now, { showDetail: true })));
  if (u.role === "coordinator") {
    section("Open incidents, most severe first", ctx.openIncidents.map((i) => incidentLine(i, now)));
    section("Waiting for their approval", ctx.approvals.map((t) => taskLine(t, now, { showDetail: true })));
  }
  section("Needs they filed", ctx.myNeeds.map((n) => needLine(n, now)));
  section("Their open problems", ctx.myIncidents.map((i) => incidentLine(i, now)));
  if (u.role !== "public") {
    section("Records their tasks touch", [
      ...ctx.records.sites.map((s) => siteLine(s, now, u.role)),
      ...ctx.records.needs.map((n) => needLine(n, now)),
    ]);
  }
  section("Roads not open", ctx.records.roads.map((r) => roadLine(r, now)));
  if (u.role === "shelter" || u.role === "public") {
    section("Shelters", ctx.records.shelters.map((s) => shelterLine(s, now)));
  }
  if (quakes) {
    lines.push(quakes.replay ? `Scenario time (replay): ${quakes.now.toISOString().slice(0, 16)} UTC` : "Earthquake feed: live (AFAD, USGS)");
    section("Earthquakes worth a warning near this person, last 60 min, newest first", quakes.quakes.map(quakeLine));
  }
  section("Unread inbox", ctx.inbox.map((i) => `${i.kind} · ${i.message}${i.taskId ? ` (task ${i.taskId})` : ""} · ${age(i.ts, now)}`));
  section("Already filed this session by this agent", ctx.postedThisSession.map((e) =>
    `${e.type} ${e._id} · ${JSON.stringify(e.payload).slice(0, 140)} · ${age(e.ts, now)}`));
  lines.push("</desk_context>");
  return lines.join("\n");
}
