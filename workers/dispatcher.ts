// Owned by Role 1. The dispatcher: reacts to what the memory keeper changed, and is the only
// writer of tasks and inboxes. Called from the Brain loop right after each event.
// CP2 adds the rules: a site that is not called → a call task for a volunteer, and so on.
import type { Change } from "./memory-keeper";

export async function react(changes: Change[]): Promise<void> {
  void changes; // CP2: tasks and inbox items from these changes
}
