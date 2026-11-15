import { ChatLine } from "disaster-desk";

export const Exchange = () => (
  <div className="space-y-1 rounded-card border border-line bg-card p-3" style={{ maxWidth: 420 }}>
    <ChatLine name="Zeynep" m={{ from: "agent", text: "Please call this number about Çınar St. 3. One person posted, nobody has called yet." }} />
    <ChatLine name="Zeynep" m={{ from: "user", text: "called, voices heard" }} />
    <ChatLine name="Zeynep" m={{ from: "agent", text: "Marked Çınar St. 3 as verified. Asking Mehmet to send a team." }} />
  </div>
);
// People speak in sans, the agent in mono. Same exchange as /lab.
