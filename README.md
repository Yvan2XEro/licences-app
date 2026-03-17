# licences-app

This project is a modern TypeScript stack that combines React, TanStack Router, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Generate and apply migrations:

```bash
bun run db:generate
bun run db:migrate
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Project Structure

```
licences-app/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Hono, ORPC)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:generate`: Generate versioned Drizzle SQL migrations
- `bun run db:migrate`: Apply committed Drizzle migrations
- `bun run db:push`: Push schema changes to database
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Biome formatting and linting
- `bun run test:server`: Run backend tests (Bun test runner)

## License Management (Backend)

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (used by server + tests).
- `BETTER_AUTH_SECRET`: Better-Auth secret (min 32 chars).
- `BETTER_AUTH_URL`: Better-Auth base URL.
- `CORS_ORIGIN`: Allowed CORS origin for the API.
- `ADMIN_ALLOWLIST`: Comma-separated admin emails for the dashboard (e.g. `admin@example.com,ops@example.com`).
- `LICENSE_TOKEN_PRIVATE_KEY`: Ed25519 private key used to sign license tokens.
- `LICENSE_TOKEN_PUBLIC_KEY`: Ed25519 public key used by clients to verify license tokens.
- `LICENSE_OFFLINE_DAYS`: Number of days a client can run offline before re-validation (default 7).
- `RATE_LIMIT_WINDOW_MS`: Rate-limit window in milliseconds (default 60000).
- `RATE_LIMIT_MAX`: Max requests per IP per window (default 60).

### Activation Flow (Public API)

License actions are exposed via oRPC procedures:
`licenses.activate`, `licenses.validate`, `licenses.deactivate`.

Rules (simplified):

- License key must exist, match product, be active, and not expired.
- Activations are idempotent for the same machine fingerprint.
- Machine activations respect max-activation limits (`license.maxActivations` or product default).
- Deactivation revokes a machine and frees the slot.

### Token Usage (Offline Grace)

On successful `activate` or `validate`, the API returns optional fields:
`token` and `tokenExpiresAt`. The token is an Ed25519-signed payload that includes
the license, machine fingerprint, installation identifier, and an `offlineUntil`
timestamp.

Recommended client flow:

- Store the token after activation.
- Fetch the public key from `licenses.publicKey` or configure it locally in trusted clients.
- On app start, verify the signature locally and allow if `offlineUntil` is in the future.
- When `offlineUntil` expires, call `licenses.validate` to refresh the token.

### Backend Tests

Tests use the Bun test runner and a real Postgres database.
Ensure `DATABASE_URL` points to a test database with the latest schema, then run:

```bash
bun run test:server
```
