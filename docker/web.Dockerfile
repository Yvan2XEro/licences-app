FROM oven/bun:1.3.10 AS builder

WORKDIR /app

ARG VITE_SERVER_URL

COPY package.json bun.lock turbo.json tsconfig.json biome.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json

RUN bun install --frozen-lockfile --force --no-cache

COPY . .

ENV VITE_SERVER_URL=${VITE_SERVER_URL}

RUN bun run --cwd apps/web build

FROM node:20-alpine

RUN npm install -g serve && apk add --no-cache wget

COPY --from=builder /app/apps/web/dist /app

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 CMD wget -q -O - http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["serve", "-s", "/app", "-l", "80"]
