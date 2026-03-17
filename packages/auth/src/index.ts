import { db } from "@licences-app/db";
import * as schema from "@licences-app/db/schema/auth";
import { env } from "@licences-app/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  // Local LAN Dokploy deployments may run over plain HTTP.
  // Keep secure cookies by default, but allow an explicit override.
  ...(function () {
    const secureCookies =
      env.BETTER_AUTH_SECURE_COOKIES ?? env.BETTER_AUTH_URL.startsWith("https://");

    return {
      trustedOrigins: [env.CORS_ORIGIN],
      emailAndPassword: {
        enabled: true,
      },
      advanced: {
        defaultCookieAttributes: {
          sameSite: secureCookies ? "none" : "lax",
          secure: secureCookies,
          httpOnly: true,
        },
      },
      plugins: [],
    };
  })(),
});
