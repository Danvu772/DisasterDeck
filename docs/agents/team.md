# Team and role lanes

Every Claude session in this repo starts with the open task list (`node scripts/team-tasks.mjs`, run by the SessionStart hook in `.claude/settings.json`). The list is the same for everyone. The role lane tells you which tasks are normally yours.

| GitHub login | Role lane | Source |
|---|---|---|
| Danvu772 | `role:3-frontend` | the label's description ("Role 3, Dan") |
| DarshalShetty | `role:1-backend` | the label's description ("Role 1, Darshal") |
| bicakciogluu | `role:2-agents` | the label's description ("Role 2, Ömer") |
| GokturkUnlu | `role:4-data` | inferred from the issues he holds, to confirm |

Confirm or correct the last row. A new member adds a row here with the label they own.
