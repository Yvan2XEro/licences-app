import { ORPCError, os } from "@orpc/server";

import { env } from "@licences-app/env/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({ context });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireAdmin = o.middleware(async ({ context, next }) => {
	const email = context.session?.user?.email?.toLowerCase();
	const allowlist = env.ADMIN_ALLOWLIST?.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);

	if (!email || !allowlist || allowlist.length === 0) {
		throw new ORPCError("FORBIDDEN");
	}

	if (!allowlist.includes(email)) {
		throw new ORPCError("FORBIDDEN");
	}

	return next({ context });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
