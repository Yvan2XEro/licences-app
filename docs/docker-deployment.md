# Docker deployment

This repository now has two production-oriented Docker stacks:

- `docker-compose.yml`: direct deployment with Caddy terminating TLS itself
- `docker-compose.dokploy.yml`: Dokploy deployment using Traefik labels on `licences.ultradepot.tech` and `api-licences.ultradepot.tech`
- `docker-compose.dokploy.lan.yml`: Dokploy deployment for local/private DNS over HTTP

## What changed versus the old stack

- database changes are applied by a dedicated `migrate` service
- the API no longer runs `db:push` on startup
- Drizzle SQL migrations are versioned under `packages/db/src/migrations`
- `server` and `web` have healthchecks
- the server image is split into build, migrate, and runtime targets
- security headers are set at the web proxy layer

## Topology

### Public app domain

`https://licences.ultradepot.tech`

- serves the React admin UI
- proxies `/rpc`, `/api/auth/*`, and `/api-reference` to the internal API
- remains the canonical origin for Better Auth cookies

### Public API domain

`https://api-licences.ultradepot.tech`

- proxies directly to the same backend API
- useful for API consumers, docs, and non-browser integrations
- should not become the browser admin origin; keep `PUBLIC_URL` on the main app domain

## Files

- `docker-compose.yml`
- `docker-compose.dokploy.yml`
- `docker/server.Dockerfile`
- `docker/web.Dockerfile`
- `docker/Caddyfile`
- `.env.docker.example`
- `packages/db/src/migrations/*`

## Required environment variables

Start from `.env.docker.example` and set at least:

- `APP_DOMAIN`
- `API_DOMAIN`
- `PUBLIC_URL`
- `ACME_EMAIL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ADMIN_ALLOWLIST`
- `LICENSE_TOKEN_PRIVATE_KEY`
- `LICENSE_TOKEN_PUBLIC_KEY`

`PUBLIC_URL` must stay equal to the main browser origin, for example:

```env
PUBLIC_URL=https://licences.ultradepot.tech
```

## Direct deployment

1. Copy `.env.docker.example` to `.env.docker`
2. Replace all placeholders
3. Deploy:

```bash
docker compose --env-file .env.docker up -d --build
```

Flow:

1. `postgres` becomes healthy
2. `migrate` applies versioned Drizzle migrations and exits
3. `server` starts only if migration succeeded
4. `web` starts only if the API is healthy

## Dokploy deployment

Dokploy officially recommends configuring domains from the UI, but it also supports Docker Compose labels when you need infrastructure-as-code routing rules.

Use `docker-compose.dokploy.yml` with the same `.env.docker` file. The compose already includes Traefik labels for:

- `licences.ultradepot.tech`
- `api-licences.ultradepot.tech`

Recommended Dokploy values:

```env
APP_DOMAIN=licences.ultradepot.tech
API_DOMAIN=api-licences.ultradepot.tech
PUBLIC_URL=https://licences.ultradepot.tech
```

The `web` service joins an external `dokploy-network`, which must exist in the Dokploy host environment.

Deploy with:

```bash
docker compose -f docker-compose.dokploy.yml --env-file .env.docker up -d --build
```

## Dokploy LAN deployment

For private LAN domains such as `licences.ust.lan` and `api-licences.ust.lan`, use the LAN compose variant.

Reason:

- `.lan` domains do not get public Let's Encrypt certificates
- Dokploy routing should therefore use the `web` entrypoint instead of `websecure`
- Better Auth cookies must be downgraded from secure cookies for plain HTTP LAN testing

Recommended env values:

```env
APP_DOMAIN=licences.ust.lan
API_DOMAIN=api-licences.ust.lan
PUBLIC_URL=http://licences.ust.lan
BETTER_AUTH_SECURE_COOKIES=false
```

Deploy with:

```bash
docker compose -f docker-compose.dokploy.lan.yml --env-file test/.env.dokploy.lan up -d --build
```

Routing model:

- `licences.ust.lan` -> `web` service on port `80`
- `api-licences.ust.lan` -> `server` service on port `3000`

This mirrors how Dokploy examples usually expose separate frontend and backend routers.

## Operational notes

- Keep Postgres on persistent storage; only `postgres_data` must survive redeploys.
- Rotate `BETTER_AUTH_SECRET` and the Ed25519 key pair with a planned maintenance window.
- Keep `PUBLIC_URL`, `BETTER_AUTH_URL`, and `CORS_ORIGIN` aligned on the main app domain.
- For schema changes, generate SQL with `bun run db:generate`, commit the migration, then let `migrate` apply it in production.
