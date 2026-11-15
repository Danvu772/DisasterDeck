---
tags: [hackathon, whiteboard]
---
# Whiteboard 2026-11-14

> [!info] This is a record of the whiteboard session, not a design
> The design that came out of it is [[Final system design]]. Research, Action and Orchestration from the board became research agents, personal agents with the dispatcher, and the Brain.

Main note: [[Multiplayer Disaster Deck]]

![[whiteboard-2026-11-14.jpg]]

---

## 1. What is on the board

| On the board | How I read it |
|---|---|
| **Sources:** News, Reddit, X / Twitter, Field people, NASA | Where information comes from. Field people send files (photos, voice, text) |
| **Google Map** | Location and traffic. Not clear if it is a source or a tool the agents use |
| **Research → SA1, SA2, Subagents** | Research agents, one sub-agent per source (SA = sub-agent) |
| **MongoDB**, with **Google Sheet** next to it | The shared database. The sheet is a copy people can read and edit |
| **Brain** | Not sure. It sits between research and MongoDB. Either it decides what gets written, or it is the orchestrator |
| **"Ayşe is under building", "Missing", "X called"** | An example record in MongoDB, with a call status |
| **Agent** in the middle, arrows to people | The agent people talk to |
| **Volunteer → which calls** | A volunteer asks "which calls should I make?" |
| **Field → "I called"** | People report back what they did |
| **Action → Roads, Missing, Volunteer, Shelter, Supplier** | The kinds of work the action layer hands out |
| **Blanket** | An example supply need |
| **Sources → Road, Missing** (top right) | Road and missing-person info come from the sources |
| **Problem:** Redundancy, Geography, Traffic, Priority, Shelter | The problems this structure has to solve |
| **1) Research → gathering info, 2) Action, 3) Orchestration** | The three layers |
