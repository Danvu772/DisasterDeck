# D-0005 Voice: Transcribe + Polly, dictation on-device only

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (design owner). Ömer to sign off on `docs/SYSTEM_DESIGN.md`
- **Dissent:** none recorded

## Context
`/talk` streams audio to ElevenLabs. `/field` uses the browser's Web Speech API, and the README says no audio leaves the phone. In Chrome that is wrong by default: Web Speech sends audio to Google. Chrome's on-device mode (`processLocally: true`) keeps audio and text on the device.

## Decision
Amazon Transcribe and Polly are the defaults, behind a voice provider port. ElevenLabs for Government (Zero Retention Mode, US residency) is an upgrade an agency can approve. Field dictation runs on-device only with `processLocally: true`, with typing as the fallback where it isn't supported. Never Google's cloud path.

## Consequences
Fix the README claim. Check language coverage for the pilot area. Settles upstream #13.
