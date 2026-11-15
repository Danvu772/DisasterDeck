---
id: t15-nav-phone
effort: low
checkpoint: CP3
files: components/Nav.tsx
---
# The top bar fits a phone

`components/Nav.tsx` puts Desk, Agent, Map, Coordinator, Field, Design lab and the account in one row. At 390 px wide it overflows, and `/field` is a phone screen.

Make the link row scroll sideways inside the bar on narrow screens (`overflow-x-auto`, `whitespace-nowrap`, no visible scrollbar needed), keep "Disaster Desk" fixed on the left, and hide "Malatya" and "Design lab" below the `sm` breakpoint. Do not change the links, the current-page style, or the `account` prop.
