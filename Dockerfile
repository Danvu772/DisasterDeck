# One image, two entrypoints. The web service runs `npm run start` (next start) and the Brain
# service runs `npx tsx workers/brain.ts`. Both need the full source, node_modules and the .next
# build, so this is a full-app image, not a standalone-server output.
#
# The Brain runs `tsx` at runtime, so dev dependencies stay in. Build runs with DEMO_MODE=0 (no
# demo shortcuts, and `next build` swaps motion for the static stand-in) and a placeholder
# AUTH_SECRET just so Auth.js can load, the same as ci.yml. The real secrets are injected by ECS
# from Secrets Manager at run time, never baked in.
FROM node:22-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    DEMO_MODE=0 \
    AUTH_SECRET=ci-build-placeholder-not-a-secret

# Deps first so they layer-cache when the lockfile is unchanged.
COPY package.json package-lock.json ./
RUN npm ci

# Source, then the production build.
COPY . .
RUN npx next build

# `next start` serves on :3000 and is the web service's command; the Brain overrides CMD with
# `npx tsx workers/brain.ts` in the task definition.
EXPOSE 3000

CMD ["npm", "run", "start"]