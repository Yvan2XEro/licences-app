import { createContext } from "@licences-app/api/context";
import { appRouter } from "@licences-app/api/routers/index";
import { auth } from "@licences-app/auth";
import { env } from "@licences-app/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

function readHeader(headers: any, name: string) {
	if (!headers) {
		return undefined;
	}

	if (typeof headers.get === "function") {
		return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
	}

	const value = headers[name] ?? headers[name.toLowerCase()];
	if (Array.isArray(value)) {
		return value[0];
	}

	return typeof value === "string" ? value : undefined;
}

function getExternalBaseUrl(request: { url: string | URL; headers: any }) {
	const requestUrl = request.url instanceof URL ? request.url : new URL(request.url);
	const forwardedProto =
		readHeader(request.headers, "x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
	const forwardedHost =
		readHeader(request.headers, "x-forwarded-host") ??
		readHeader(request.headers, "host") ??
		requestUrl.host;

	return `${forwardedProto}://${forwardedHost}`;
}

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: ({ request }) => ({
				servers: [
					{
						url: `${getExternalBaseUrl(request)}/api-reference`,
					},
				],
			}),
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context: context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

app.get("/", (c) => {
	return c.text("OK");
});

app.get("/healthz", (c) => {
	return c.json({ status: "ok" });
});

export default app;
