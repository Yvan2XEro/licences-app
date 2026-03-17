FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.json biome.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json

RUN bun install --frozen-lockfile

FROM deps AS builder

COPY . .

RUN bun run --cwd apps/server build

FROM deps AS migrate

COPY . .

CMD ["bun", "run", "--cwd", "packages/db", "db:migrate"]

FROM oven/bun:1 AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock turbo.json tsconfig.json biome.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json

RUN bun install --frozen-lockfile --production

COPY --from=builder /app/apps/server/dist /app/apps/server/dist

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/server/dist/index.mjs"]
