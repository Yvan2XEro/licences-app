import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		// Optional: when the SPA is served by the API itself (e.g. under
		// /admin), it falls back to window.location.origin at runtime.
		VITE_SERVER_URL: z.url().optional(),
	},
	runtimeEnv: (import.meta as any).env,
	emptyStringAsUndefined: true,
});
