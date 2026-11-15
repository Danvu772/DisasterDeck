import { FamilyCall } from "@/components/voice/FamilyCall";

export default function FamilyPage() {
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <header><p className="text-sm font-bold text-primary">Disaster Desk · Family information</p>
      <h1 className="mt-2 text-3xl font-bold">Get information about a loved one</h1>
      <p className="mt-3 text-muted">Search by name, read the published update or ask a question by voice. No sign-in or access code is required. Missing information does not tell us what has happened to a person.</p></header>
    <FamilyCall />
    <aside className="rounded-card border border-line bg-card p-4 text-sm text-muted">
      This is an AI information assistant, not an emergency service or a live operator. Calls use your browser microphone; no telephone number is dialed.
      ElevenLabs processes your voice. Your question and the published update are sent to Claude to generate an answer. This application does not save audio or conversation history.
      ElevenLabs audio recording is disabled and transcript retention is set to one day. Do not share private documents or identity credentials.
    </aside>
  </main>;
}
