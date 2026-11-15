"use client";
// /voice: the voice agent, an audio control for the person's own agent. One big control turns it on.
// Then it listens, sends each sentence to /api/chat, speaks the answer and listens again (useVoiceAgent).
// It answers questions about the desk out loud and acts on commands: answer a task, report a problem,
// file a report, a need or a closed road. The screen shows the state, and a log of what was said and done.
// Needs ElevenLabs on the server and a microphone on an HTTPS page. Hold to talk on /field works without.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { ChatLine } from "../ChatLine";
import { chip } from "../encode";
import { canRecord, serverHasVoice } from "../field/voiceClient";
import { useVoiceAgent, type AgentState, type Exchange } from "./useVoiceAgent";
import "./voice.css";

const LOG = 20;

// The control's words and motion per state.
const STATE: Record<AgentState, { label: string; hint: string; motion: string }> = {
  off: { label: "Start", hint: "Tap to start the voice agent", motion: "" },
  starting: { label: "Starting", hint: "Measuring the room. Stay quiet for a moment", motion: "" },
  listening: { label: "Listening", hint: "Say what you need", motion: "voice-listening" },
  hearing: { label: "Hearing you", hint: "Pause when you are done", motion: "voice-hearing" },
  thinking: { label: "Working", hint: "Your agent is reading the desk", motion: "voice-thinking" },
  speaking: { label: "Speaking", hint: "Your agent is answering", motion: "voice-speaking" },
  waiting: { label: "Waiting", hint: "Too many messages. It listens again in a minute", motion: "" },
};

const EXAMPLES = [
  "What is my top task?",
  "Where did the collapses first hit?",
  "How full are the shelters?",
  "We are on our way, 20 minutes.",
  "The road to Kale is blocked.",
  "We need 20 blankets at Örnek Sokak 12.",
];

function Said({ x }: { x: Exchange }) {
  return (
    <li className="space-y-2 border-t border-line pt-3">
      {x.said && <div className="flex justify-end"><ChatLine m={{ from: "user", text: x.said }} name="You" /></div>}
      <ChatLine m={{ from: "agent", text: x.reply }} name="" />
      {x.actions.length > 0 && (
        <ul className="space-y-1 text-sm">
          {x.actions.map((a, i) => <li key={i}><span className="font-bold">{a.ok ? "Done" : "Not done"}:</span> {a.summary}</li>)}
        </ul>
      )}
    </li>
  );
}

export function VoiceAgent({ user, users }: { user: User; users: User[] }) {
  const agent = useVoiceAgent(user._id);
  // null until checked: the server's ElevenLabs, and a microphone on a secure page.
  const [ready, setReady] = useState<{ voice: boolean; mic: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    serverHasVoice().then((voice) => { if (alive) setReady({ voice, mic: canRecord() }); });
    return () => { alive = false; };
  }, []);

  // Every finished exchange goes on top of the log.
  const [log, setLog] = useState<Exchange[]>([]);
  const [seen, setSeen] = useState(agent.last);
  if (agent.last !== seen) {
    setSeen(agent.last);
    if (agent.last) setLog((xs) => [agent.last!, ...xs].slice(0, LOG));
  }

  const s = STATE[agent.state];
  const blocked = ready === null ? "Checking the voice service."
    : !ready.voice ? "The voice agent needs ElevenLabs on the server. Hold to talk on Field works without it."
    : !ready.mic ? "The microphone only works on an HTTPS page. Open this page through the tunnel, or use Field."
    : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-4 md:p-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Demo. Talk as:</span>
        {users.map((u) => (
          <Link key={u._id} href={`/voice?user=${u._id}`} aria-current={u._id === user._id ? "true" : undefined}
            className={chip(u._id === user._id)}>
            {u.name}
          </Link>
        ))}
      </nav>

      <header>
        <h1 className="text-2xl font-bold">Voice agent</h1>
        <p className="text-muted">
          Your own agent, hands-free. Ask what the desk knows and it answers out loud. Tell it what happened
          and it files it for you. It turns itself off after 2 minutes without speech.
        </p>
      </header>

      <section aria-label="Voice control" className="flex flex-col items-center gap-4 rounded-card border border-line bg-card p-6">
        <button type="button" aria-pressed={agent.on} onClick={agent.toggle} disabled={!!blocked && !agent.on}
          className={`flex h-44 w-44 flex-col items-center justify-center rounded-full text-2xl font-bold
            disabled:opacity-50 ${agent.on ? "bg-primary text-card" : "bg-card text-primary shadow-[inset_0_0_0_4px_var(--color-primary)]"} ${s.motion}`}>
          {s.label}
          {agent.on && <span className="mt-1 text-sm font-normal">Tap to stop</span>}
        </button>
        <p role="status" className="text-center text-lg">{blocked ?? s.hint}</p>
        <p aria-live="polite" className="text-center text-sm text-muted">{agent.note}</p>
      </section>

      <section aria-label="Conversation" className="rounded-card border border-line bg-card p-4">
        <h2 className="text-xl font-bold">What was said</h2>
        {log.length === 0
          ? (
            <div className="mt-2 text-sm text-muted">
              <p>Nothing yet. Things you can say:</p>
              <ul className="mt-1 list-inside list-disc">{EXAMPLES.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )
          : <ul className="mt-2 space-y-3">{log.map((x, i) => <Said key={log.length - i} x={x} />)}</ul>}
      </section>
    </main>
  );
}
