// The content tests run on the repo's own fixtures, whatever the live desk holds right now
// (it can be empty after a reset). The board, the feed and the people list answer from fixtures/,
// and every other non-GET call to /api is refused here, so no click can reach the real desk.
// /api/health and /api/inbox stay live, they only read.
import type { Page } from "@playwright/test";
import { makeBoard } from "../../src/fixtures/board";
import { makeCoordinatorTasks } from "../../src/fixtures/coordinator";
import { makeEvents, users } from "../../src/fixtures/desk";
import { makeFieldBoard } from "../../src/fixtures/field";

const BOARDS = {
  board: (now: number) => makeBoard(now),
  field: (now: number) => makeFieldBoard(now),
  coordinator: (now: number) => {
    const b = makeBoard(now);
    return { ...b, tasks: [...b.tasks, ...makeCoordinatorTasks(now)] };
  },
};

export async function fixtureDesk(page: Page, which: keyof typeof BOARDS = "board") {
  const now = Date.now();
  const board = BOARDS[which](now);
  const events = makeEvents(now);
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    // Chat is answered by stubChat (chat.ts), registered after this and so asked first.
    if (req.method() !== "GET") return url.pathname === "/api/chat" ? route.fallback() : route.abort();
    switch (url.pathname) {
      case "/api/board": return route.fulfill({ json: board });
      case "/api/events": return route.fulfill({ json: url.searchParams.has("since") ? [] : events });
      case "/api/users": return route.fulfill({ json: users });
      default: return route.fallback();
    }
  });
}
