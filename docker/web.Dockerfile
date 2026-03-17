FROM oven/bun:1 AS builder

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

RUN bun install --frozen-lockfile

COPY . .

ENV VITE_SERVER_URL=${VITE_SERVER_URL}

RUN bun run --cwd apps/web build

FROM caddy:2-alpine

ARG APP_DOMAIN
ENV APP_DOMAIN=${APP_DOMAIN}
ENV API_DOMAIN=
ENV ACME_EMAIL=

COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /usr/share/caddy

EXPOSE 80
EXPOSE 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 CMD wget -q --header="Host: ${APP_DOMAIN}" -O - http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
