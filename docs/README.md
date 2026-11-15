# Team notes

The [live pipeline completion plan](completion-plan.md) reviews main at `5fb51ba` and gives the implementation order, owners, recovery requirements and live acceptance checks for the remaining work.

Start with [Multiplayer Disaster Desk](Multiplayer%20Disaster%20Desk/Multiplayer%20Disaster%20Desk.md). It explains the whole idea, the main flow and the demo plan.

**Before you write code,** read [Team contracts](Multiplayer%20Disaster%20Desk/Roles/Team%20contracts.md): the data shapes, the API and who owns which folder.

| Note | What it covers |
|---|---|
| [Multiplayer Disaster Desk](Multiplayer%20Disaster%20Desk/Multiplayer%20Disaster%20Desk.md) | The idea, roles, the life of one case, NASA silent zones, demo plan |
| [Personal agents](Multiplayer%20Disaster%20Desk/Personal%20agents.md) | **New.** Every user has an agent. What asking it (summaries) and telling it (personal needs) does, and what each role must build for it |
| [Final system design](Multiplayer%20Disaster%20Desk/Final%20system%20design.md) | The only system design (version 2): components, data model, lifecycles, dispatcher rules, help desk, flows, build plan |
| [Design review 2026-11-14](Multiplayer%20Disaster%20Desk/Design%20review%202026-11-14.md) | What changed between version 1 and version 2 of the design, and why |
| [Team contracts](Multiplayer%20Disaster%20Desk/Roles/Team%20contracts.md) | TypeScript data shapes, API routes, folder ownership, keys, checkpoints |
| [Role 1: Backend and Brain](Multiplayer%20Disaster%20Desk/Roles/Role%201%20-%20Backend%20and%20Brain.md) | MongoDB, event queue, memory keeper, dispatcher, help desk playbook |
| [Role 2: Agents](Multiplayer%20Disaster%20Desk/Roles/Role%202%20-%20Agents.md) | Research agents, personal agents, chat, voice and photo |
| [Role 3: Frontend](Multiplayer%20Disaster%20Desk/Roles/Role%203%20-%20Frontend.md) | Login, role screens, shared board, map |
| [Frontend visual language](Multiplayer%20Disaster%20Desk/Roles/Frontend%20visual%20language.md) | How every screen encodes tier, confidence, age, source. Tokens, `/lab` |
| [Role 4: Data, NASA and pitch](Multiplayer%20Disaster%20Desk/Roles/Role%204%20-%20Data%2C%20NASA%20and%20pitch.md) | Tweet replay, seed data, NASA layers, scenario player, Devpost |
| [Data sources](Multiplayer%20Disaster%20Desk/Data%20sources.md) | Tweet dataset, NASA data with tested requests, links, open questions |
| [Hackathon info](Multiplayer%20Disaster%20Desk/Hackathon%20info.md) | Deadlines, submission rules, track fit, resources, checklists |
| [Whiteboard 2026-11-14](Multiplayer%20Disaster%20Desk/Whiteboard%202026-11-14.md) | The whiteboard session the design came from |
| `System map.canvas` | Older visual overview, from before the final design. Replaced by Final system design. Opens in Obsidian only |

**How to read them**
- **On GitHub:** the notes and Mermaid diagrams render here. Obsidian-only parts (`[[links]]`, colored callouts, the canvas) show as plain text.
- **In Obsidian:** open this `docs` folder as a vault ("Open folder as vault").

The live version of these notes is in the shared Obsidian folder (Relay). This folder is a snapshot, taken on 14 Nov at 19:00.
