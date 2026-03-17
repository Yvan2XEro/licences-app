# Code of Conduct

## Our Pledge
We are committed to creating a respectful, collaborative, and safe environment for everyone working on this project. We value constructive feedback, shared ownership, and reliable engineering practices.

## Expected Behavior
- Be respectful and inclusive in all interactions.
- Assume good intent and communicate clearly.
- Provide helpful, actionable feedback during reviews.
- Take responsibility for mistakes and fix them promptly.
- Keep discussions focused on project outcomes.

## Unacceptable Behavior
- Harassment, discrimination, or hostile behavior.
- Personal attacks, insults, or intimidation.
- Unwelcome sexual attention or inappropriate comments.
- Deliberate disruption of collaboration or review processes.

## Engineering Conduct
We expect every contributor to uphold quality standards that keep the codebase stable and maintainable.

### Testing Responsibilities (Emphasis on Backend)
The backend lives in `apps/server` (Hono on Bun). Backend changes have a high risk of breaking production workflows, so testing is mandatory for any server-side change.

Minimum expectations for backend changes:
- Validate core endpoints affected by your change (manual or automated).
- Verify database interactions and migrations if applicable.
- Run type checks and lint/format fixes before requesting review.
- Document any test gaps or follow-up tasks in the PR description.

Recommended checks before requesting review:
- `bun run check-types`
- `bun run check`
- `bun run dev:server` (smoke test affected routes)

If you add tests, keep them close to the feature area (e.g., `apps/server/src/...`) and update `package.json` with any new test command.

### Frontend Changes
Frontend changes should include:
- A quick manual smoke test in `apps/web` for affected flows.
- Screenshots for UI changes in the PR description.

## Reporting & Enforcement
If you experience or witness unacceptable behavior, report it to the project maintainers. Maintainers will respond promptly and take appropriate action, which may include a warning, temporary restriction, or removal from the project.

## Scope
This Code of Conduct applies to all project spaces, including pull requests, code reviews, issues, and chat or discussion channels used for collaboration.

## Acknowledgment
By contributing to this project, you agree to follow this Code of Conduct.
