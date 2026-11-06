import { env } from "@licences-app/env/web";
import { createAuthClient } from "better-auth/react";

const baseURL = env.VITE_SERVER_URL ?? window.location.origin;

export const authClient = createAuthClient({
	baseURL,
});
