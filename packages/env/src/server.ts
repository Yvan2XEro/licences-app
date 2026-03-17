import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ADMIN_ALLOWLIST: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    LICENSE_TOKEN_PRIVATE_KEY: z.string().optional(),
    LICENSE_TOKEN_PUBLIC_KEY: z.string().optional(),
    LICENSE_OFFLINE_DAYS: z.coerce.number().int().positive().default(7),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
