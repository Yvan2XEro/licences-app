import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Both src/ and dist/ live one level below the package root, so ../public
// resolves to apps/server/public in dev, in the built output and in Docker.
const adminUiDir =
	process.env.ADMIN_UI_DIR ?? path.resolve(moduleDir, "../public");

/**
 * Serves the built web SPA under /admin. The frontend uses hash routing, so
 * only /admin/ itself and its assets need to resolve; no SPA fallback is
 * required for deep links.
 */
export function mountAdminUi(app: Hono) {
	if (!existsSync(path.join(adminUiDir, "index.html"))) {
		console.warn(
			`[admin-ui] no frontend build found at ${adminUiDir}; /admin is disabled (run \`bun run build:ui\` in apps/server)`,
		);
		return;
	}

	// serveStatic resolves `root` against the process working directory.
	const root = path.relative(process.cwd(), adminUiDir) || ".";

	// Without the trailing slash the browser would resolve the build's
	// relative asset URLs against "/", not "/admin/".
	app.get("/admin", (c) => c.redirect("/admin/"));
	app.use(
		"/admin/*",
		serveStatic({
			root,
			rewriteRequestPath: (requestPath) =>
				requestPath.replace(/^\/admin/, "") || "/",
		}),
	);

	console.log(`[admin-ui] serving ${adminUiDir} at /admin`);
}
