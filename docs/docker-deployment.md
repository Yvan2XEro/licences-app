# Docker deployment

The deployment is now intentionally simple:

- `web` is a static frontend container served by `serve`
- `server` is the API container
- Dokploy/Traefik routes each public domain directly to the matching service
- there is no internal reverse proxy between `web` and `server`

## Files

- `docker-compose.yml`
- `docker-compose.dokploy.yml`
- `docker-compose.dokploy.lan.yml`
- `docker/server.Dockerfile`
- `docker/web.Dockerfile`
- `.env.docker.example`
- `packages/db/src/migrations/*`

## Required environment variables

Start from `.env.docker.example` and set at least:

- `APP_DOMAIN`
- `API_DOMAIN`
- `PUBLIC_URL`
- `API_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ADMIN_ALLOWLIST`
- `LICENSE_TOKEN_PRIVATE_KEY`
- `LICENSE_TOKEN_PUBLIC_KEY`

Keep these aligned:

```env
PUBLIC_URL=https://licences.ultradepot.tech
API_URL=https://api-licences.ultradepot.tech
```

The frontend build uses `API_URL` directly for:

- oRPC requests
- Better Auth client requests

## Direct compose deployment

This is the simplest non-Dokploy setup:

- `web` is exposed on port `80`
- `server` is exposed on port `3000`

Deploy:

```bash
docker compose --env-file .env.docker up -d --build
```

Flow:

1. `postgres` becomes healthy
2. `migrate` applies committed Drizzle migrations and exits
3. `server` starts
4. `web` starts

If you need TLS or a single public ingress in this mode, place your own edge proxy in front of these two services.

## Dokploy deployment

Use `docker-compose.dokploy.yml` for public HTTPS domains.

Recommended values:

```env
APP_DOMAIN=licences.ultradepot.tech
API_DOMAIN=api-licences.ultradepot.tech
PUBLIC_URL=https://licences.ultradepot.tech
API_URL=https://api-licences.ultradepot.tech
BETTER_AUTH_SECURE_COOKIES=true
```

Deploy:

```bash
docker compose -f docker-compose.dokploy.yml --env-file .env.docker up -d --build
```

Routing:

- `https://licences.ultradepot.tech` -> `web:80`
- `https://api-licences.ultradepot.tech` -> `server:3000`

Notes:

- `dokploy-network` must already exist on the host
- Traefik is the only public ingress layer
- the API reference is served directly by `server` on the API domain

## Dokploy LAN deployment

Use `docker-compose.dokploy.lan.yml` for private HTTP testing.

Recommended values:

```env
APP_DOMAIN=licences.ust.lan
API_DOMAIN=api-licences.ust.lan
PUBLIC_URL=http://licences.ust.lan
API_URL=http://api-licences.ust.lan
BETTER_AUTH_SECURE_COOKIES=false
```

Deploy:

```bash
docker compose -f docker-compose.dokploy.lan.yml --env-file test/.env.dokploy.lan up -d --build
```

Routing:

- `http://licences.ust.lan` -> `web:80`
- `http://api-licences.ust.lan` -> `server:3000`

## Operational notes

- Keep Postgres on persistent storage.
- Rotate `BETTER_AUTH_SECRET` and the Ed25519 key pair with a maintenance window.
- `PUBLIC_URL` must match the browser origin.
- `API_URL` must match the public API origin.
- For schema changes, commit SQL migrations and let `migrate` apply them during deploy.
