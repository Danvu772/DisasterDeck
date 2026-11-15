# Reproduce the shared English family voice demo

All application code, English voice configuration, seven fictional records and the loader are in Git. The active ElevenLabs agent is an external service; `voice:setup` reproduces its settings. API credentials and temporary server memory are not Git files.

## First setup

Use Node 22.18+ or 24 with npm. From the repository root:

```sh
git pull --ff-only origin main
npm ci
```

If `.env.local` does not exist, copy `.env.example` to it. Preserve existing settings. Configure these values privately:

- `ANTHROPIC_API_KEY`: your authorized Claude API key.
- `ELEVENLABS_API_KEY`: your authorized ElevenLabs key with Agents permission.
- `FAMILY_VOICE_SECRET`: a random string of at least 32 characters. Generate one locally with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` and paste it into `.env.local`.

To reproduce the isolated example demo, leave `MONGODB_URI`, `DESK_API_URL` and `DESK_BACKEND` empty. Use a separate checkout if your normal workspace connects to the shared database. The examples loader deliberately does not write to shared MongoDB.

Configure the English provider agent and start the application:

```sh
npm run voice:setup
npm run demo -- --port 3675
```

Keep that terminal open. In a second terminal in the same repository:

```sh
npm run voice:examples
```

Open [the family screen](http://127.0.0.1:3675/family). You should see **Demo Ayşe, Emma Wilson, Daniel Brooks, Olivia Bennett, Noah Carter, Sophia Reed and James Parker**. All summaries are English and fictional. Search, select a record and click **Start voice call**. No visitor sign-in, reference or PIN is required. The greeting, spoken answer, controls and dates are English.

## After updates or restarts

- After pulling voice configuration changes, run `npm run voice:setup` again and begin a new call. It updates your configured agent instead of creating another one.
- Restart the app after pulling application changes. Stop the old server before launching the new one.
- Reload the examples after each memory-demo server restart. Rerunning the loader skips existing active matching names.
- With another port, use `npm run demo -- --port 3672`, then `npm run voice:examples -- --url http://127.0.0.1:3672`.
- The same scenario content is reproducible on each machine; generated record IDs and observation timestamps are local to each load. Independently running local demo servers do not share later edits. Persistent shared publications require the team's configured MongoDB backend and coordinator publishing.

The browser microphone needs localhost or HTTPS. Voice calls consume provider credits. The page works for reading examples without making a voice call. No normal inbound telephone number is connected.

For manual publication and integration details, see [the full runbook](family-voice.md).
