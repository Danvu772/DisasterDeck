# One image, two entrypoints. The web service runs `npm run start` (next start) and the Brain
# service runs `npx tsx workers/brain.ts`. Both need the full source, node_modules and the .next
# build, so this is a full-app image, not a standalone-server output.
#
# The Brain runs `tsx` at runtime and `next build` needs typescript, so dev dependencies stay in:
# NODE_ENV=production is set only after `npm ci`. Build runs with DEMO_MODE=0 (no demo shortcuts,
# `next build` swaps motion for the static stand-in). Auth.js needs some AUTH_SECRET to load during
# the build, so a placeholder is set inline on that one RUN (same as ci.yml); it is not an ENV and
# never reaches the runtime image. The real secrets are injected by ECS from Secrets Manager.
FROM node:22-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    DEMO_MODE=0

# Deps first so they layer-cache when the lockfile is unchanged.
COPY package.json package-lock.json ./
RUN npm ci

# Source, then the production build.
COPY . .
RUN AUTH_SECRET=ci-build-placeholder-not-a-secret npx next build

ENV NODE_ENV=production

# `next start` serves on :3000 and is the web service's command; the Brain overrides CMD with
# `npx tsx workers/brain.ts` in the task definition.
EXPOSE 3000

CMD ["npm", "run", "start"]