// Stand-in for POST /api/chat until Role 2's agent is up. Shows the idea only: the reply comes
// from the person's context (role, profile, top task), never from the agent's own memory.
import type { Task, User } from "@/lib/types";

export function stubReply(user: User, topTask: Task | undefined, text: string): string {
  const t = text.toLowerCase();
  const parts: string[] = []; // most important first
  if (topTask && /called|done|finished|delivered|arrived/.test(t)) {
    parts.push(`Got it, marking "${topTask.title}" as done.`, "I'll tell everyone waiting on it.");
  } else if (/flat|broke|stuck|problem/.test(t)) {
    parts.push(`Logging a problem on ${topTask ? `"${topTask.title}"` : "your current work"}.`,
      "The desk will find a replacement and send help.");
  } else if (topTask) {
    parts.push(`Your top task: ${topTask.title}.`, topTask.detail);
  } else {
    parts.push(`No open tasks for you right now, ${user.name}.`);
  }
  if (user.role === "supplier" && user.profile?.stock) {
    parts.push(`Your stock on file: ${Object.entries(user.profile.stock).map(([k, v]) => `${v} ${k}`).join(", ")}.`);
  }
  // The context file sets the voice: "keep replies to one line" keeps only the first part.
  return /one line/i.test(user.profile?.notes ?? "") ? parts[0] : parts.join(" ");
}
