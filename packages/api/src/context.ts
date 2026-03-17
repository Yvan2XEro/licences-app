import type { Context as HonoContext } from "hono";

import { auth } from "@licences-app/auth";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	const forwardedFor = context.req.header("x-forwarded-for");
	const realIp = context.req.header("x-real-ip");
	const ip =
		forwardedFor?.split(",")[0]?.trim() ||
		realIp?.trim() ||
		context.req.header("cf-connecting-ip")?.trim() ||
		"unknown";
	const userAgent = context.req.header("user-agent");
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	return {
		session,
		ip,
		userAgent,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
