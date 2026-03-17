# Repository Guidelines

## Project Structure & Module Organization
- `apps/web`: React + TanStack Router frontend (Vite).
- `apps/server`: Hono API server (Bun runtime).
- `packages/`: shared workspace packages (`api`, `auth`, `config`, `db`, `env`).
- `packages/db`: Drizzle schema and database tooling.

## Build, Test, and Development Commands
- `bun install`: install workspace dependencies.
- `bun run dev`: start all apps via Turborepo.
- `bun run dev:web`: start only the web app (Vite).
- `bun run dev:server`: start only the API server (Bun).
- `bun run build`: build all apps.
- `bun run check-types`: typecheck all apps.
- `bun run check`: run Biome format + lint fixes.
- `bun run db:push`: push Drizzle schema to the database.
- `bun run db:studio`: open the Drizzle Studio UI.

## Coding Style & Naming Conventions
- Formatting is enforced by Biome (`bun run check`).
- Indentation: tabs. Quotes: double quotes (JS/TS).
- Keep TypeScript `type: module` imports explicit and use workspace package names (e.g., `@licences-app/db`).

## Testing Guidelines
- No dedicated test runner is configured yet (no `vitest/jest` scripts).
- If you add tests, keep them near the feature (e.g., `apps/web/src/...`) and document the command in `package.json`.

## Commit & Pull Request Guidelines
- Git history currently only includes “initial commit”; no established convention yet.
- Prefer short, present-tense summaries (e.g., “Add licence form validation”).
- PRs should include a brief description, linked issue (if any), and screenshots for UI changes.

## Security & Configuration Tips
- Configure database credentials in `apps/server/.env` before running migrations.
- Avoid committing secrets; prefer `.env` files and document required keys.

## Agent-Specific Notes
- Use Bun and Turborepo commands shown above; avoid npm/yarn unless required.
- Keep changes scoped to the relevant workspace package or app.
