import {
	createHash,
	createPrivateKey,
	createPublicKey,
	randomBytes,
	randomUUID,
	sign,
	verify,
} from "crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { env } from "@licences-app/env/server";
import {
	activationLog,
	customer,
	license,
	machine,
	product,
} from "@licences-app/db";
import { db } from "@licences-app/db";

type LicenseStatus = "active" | "suspended" | "expired" | "revoked";

export type LicenseErrorCode =
	| "LICENSE_NOT_FOUND"
	| "PRODUCT_MISMATCH"
	| "LICENSE_REVOKED"
	| "LICENSE_SUSPENDED"
	| "LICENSE_EXPIRED"
	| "MAX_ACTIVATIONS_REACHED"
	| "MACHINE_NOT_FOUND"
	| "RATE_LIMITED";

export type LicenseResult =
	| {
			ok: true;
			license: {
				status: LicenseStatus;
				type: "trial" | "monthly" | "yearly" | "lifetime";
				expiresAt: string | null;
				maxActivations: number;
				productSlug: string;
			};
			machine: {
				fingerprint: string;
				revokedAt: string | null;
			};
			token?: string;
			tokenExpiresAt?: string;
	  }
	| {
			ok: false;
			error: {
				code: LicenseErrorCode;
				message: string;
				details?: Record<string, unknown>;
			};
	  };

type RequestMeta = {
	ip: string;
	userAgent: string | null;
};

type LicenseLookup = {
	license: typeof license.$inferSelect;
	productSlug: string;
	defaultMaxActivations: number;
	customerCompanySlug: string | null;
};

export type LicenseTokenPayload = {
	version: 2;
	iss: "licences-app";
	aud: "licences-app-client";
	sub: string;
	jti: string;
	licenseId: string;
	productSlug: string;
	companySlug: string | null;
	machineFingerprint: string;
	installationId: string | null;
	licenseExpiresAt: string | null;
	offlineUntil: string;
	issuedAt: string;
};

const rateLimitStore = new Map<
	string,
	{
		count: number;
		resetAt: number;
	}
>();

const RATE_LIMIT_PREFIX = "public-license";
const RATE_LIMIT_SWEEP_INTERVAL = 250;
const DEFAULT_DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJxQvCy45M1LZQnIGlkHZC/XWnurKGG9623v/yXaK6Fv
-----END PRIVATE KEY-----`;
const DEFAULT_DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEACrhJ8hY+ANIgHTyjPtY5kAnTKbX11y8jdJzr8s+SfZE=
-----END PUBLIC KEY-----`;
let rateLimitChecks = 0;

function normalizePem(value: string | undefined) {
	return value?.replace(/\\n/g, "\n").trim();
}

function resolveLicensePrivateKey() {
	const configuredKey = normalizePem(env.LICENSE_TOKEN_PRIVATE_KEY);
	if (configuredKey) {
		return createPrivateKey(configuredKey);
	}

	if (env.NODE_ENV === "production") {
		throw new Error("LICENSE_TOKEN_PRIVATE_KEY is required in production.");
	}

	return createPrivateKey(DEFAULT_DEV_PRIVATE_KEY);
}

function resolveLicensePublicKey() {
	const configuredKey = normalizePem(env.LICENSE_TOKEN_PUBLIC_KEY);
	if (configuredKey) {
		return createPublicKey(configuredKey);
	}

	const privateKey = normalizePem(env.LICENSE_TOKEN_PRIVATE_KEY);
	if (privateKey) {
		return createPublicKey(privateKey);
	}

	if (env.NODE_ENV === "production") {
		throw new Error("LICENSE_TOKEN_PUBLIC_KEY is required in production.");
	}

	return createPublicKey(DEFAULT_DEV_PUBLIC_KEY);
}

export function getLicenseTokenPublicKeyPem() {
	const configuredKey = normalizePem(env.LICENSE_TOKEN_PUBLIC_KEY);
	if (configuredKey) {
		return configuredKey;
	}

	if (normalizePem(env.LICENSE_TOKEN_PRIVATE_KEY)) {
		return resolveLicensePublicKey().export({ format: "pem", type: "spki" }).toString();
	}

	return DEFAULT_DEV_PUBLIC_KEY;
}

function pruneRateLimitStore(now: number) {
	for (const [key, value] of rateLimitStore.entries()) {
		if (now > value.resetAt) {
			rateLimitStore.delete(key);
		}
	}
}

function encodeBase32Crockford(input: Uint8Array) {
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	let bits = 0;
	let value = 0;
	let output = "";

	for (const byte of input) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		output += alphabet[(value << (5 - bits)) & 31];
	}

	return output;
}

function checkRateLimit(key: string) {
	const now = Date.now();
	const windowMs = env.RATE_LIMIT_WINDOW_MS;
	const max = env.RATE_LIMIT_MAX;
	rateLimitChecks += 1;
	if (rateLimitChecks % RATE_LIMIT_SWEEP_INTERVAL === 0) {
		pruneRateLimitStore(now);
	}

	const state = rateLimitStore.get(key);
	if (!state || now > state.resetAt) {
		rateLimitStore.set(key, {
			count: 1,
			resetAt: now + windowMs,
		});
		return { ok: true, resetAt: now + windowMs, remaining: max - 1 };
	}

	if (state.count >= max) {
		return { ok: false, resetAt: state.resetAt, remaining: 0 };
	}

	state.count += 1;
	return { ok: true, resetAt: state.resetAt, remaining: max - state.count };
}

async function recordLog({
	licenseId,
	machineId,
	ip,
	userAgent,
	eventType,
	reason,
}: {
	licenseId: string | null;
	machineId: string | null;
	ip: string;
	userAgent: string | null;
	eventType: "activate" | "validate" | "deactivate" | "blocked";
	reason?: string;
}) {
	await db.insert(activationLog).values({
		licenseId,
		machineId,
		ip,
		userAgent,
		eventType,
		reason,
	});
}

function formatLicenseResponse(row: LicenseLookup) {
	const maxActivations =
		row.license.maxActivations ?? row.defaultMaxActivations;

	return {
		status: row.license.status,
		type: row.license.type,
		expiresAt: row.license.expiresAt?.toISOString() ?? null,
		maxActivations,
		productSlug: row.productSlug,
	};
}

export function hashLicenseKey(licenseKey: string) {
	return createHash("sha256").update(licenseKey).digest("hex");
}

export function generateLicenseKey() {
	const encoded = encodeBase32Crockford(randomBytes(16));
	const groups = encoded.match(/.{1,5}/g) ?? [encoded];
	return `LIC-${groups.join("-")}`;
}

function base64UrlEncode(input: string) {
	return Buffer.from(input)
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function base64UrlDecode(input: string) {
	const padded = input.replace(/-/g, "+").replace(/_/g, "/");
	const padLength = 4 - (padded.length % 4 || 4);
	const normalized = padded + "=".repeat(padLength);
	return Buffer.from(normalized, "base64").toString("utf8");
}

function signTokenPayload(payload: LicenseTokenPayload) {
	const header = base64UrlEncode(JSON.stringify({ alg: "EdDSA", typ: "LJWT", kid: "v2" }));
	const body = base64UrlEncode(JSON.stringify(payload));
	const data = `${header}.${body}`;
	const signature = sign(null, Buffer.from(data), resolveLicensePrivateKey())
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
	return `${data}.${signature}`;
}

export function verifyLicenseToken(token: string) {
	const parts = token.split(".");
	if (parts.length !== 3) {
		return null;
	}
	try {
		const [header, body, signature] = parts;
		if (!header || !body || !signature) {
			return null;
		}
		const data = `${header}.${body}`;
		const headerPayload = JSON.parse(base64UrlDecode(header)) as {
			alg?: string;
			kid?: string;
			typ?: string;
		};
		if (headerPayload.alg !== "EdDSA" || headerPayload.typ !== "LJWT") {
			return null;
		}
		const signatureBuffer = Buffer.from(
			signature.replace(/-/g, "+").replace(/_/g, "/"),
			"base64",
		);
		const isValid = verify(
			null,
			Buffer.from(data),
			resolveLicensePublicKey(),
			signatureBuffer,
		);
		if (!isValid) {
			return null;
		}
		const payload = JSON.parse(base64UrlDecode(body)) as LicenseTokenPayload;
		if (
			payload.version !== 2 ||
			payload.iss !== "licences-app" ||
			payload.aud !== "licences-app-client"
		) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}

function createLicenseToken(params: {
	licenseId: string;
	productSlug: string;
	companySlug: string | null;
	machineFingerprint: string;
	installationId?: string | null;
	licenseExpiresAt: Date | null;
}) {
	const issuedAt = new Date();
	const offlineUntil = new Date(
		issuedAt.getTime() + env.LICENSE_OFFLINE_DAYS * 24 * 60 * 60 * 1000,
	);
	const payload: LicenseTokenPayload = {
		version: 2,
		iss: "licences-app",
		aud: "licences-app-client",
		sub: params.licenseId,
		jti: randomUUID(),
		licenseId: params.licenseId,
		productSlug: params.productSlug,
		companySlug: params.companySlug,
		machineFingerprint: params.machineFingerprint,
		installationId: params.installationId ?? null,
		licenseExpiresAt: params.licenseExpiresAt?.toISOString() ?? null,
		offlineUntil: offlineUntil.toISOString(),
		issuedAt: issuedAt.toISOString(),
	};
	return {
		token: signTokenPayload(payload),
		tokenExpiresAt: payload.offlineUntil,
	};
}

async function getLicenseByKey(licenseKey: string) {
	const keyHash = hashLicenseKey(licenseKey);
	const rows = await db
		.select({
			license,
			productSlug: product.slug,
			defaultMaxActivations: product.defaultMaxActivations,
			customerCompanySlug: customer.companySlug,
		})
		.from(license)
		.innerJoin(product, eq(license.productId, product.id))
		.innerJoin(customer, eq(license.customerId, customer.id))
		.where(or(eq(license.keyHash, keyHash), eq(license.key, licenseKey)))
		.limit(1);

	return rows[0] ?? null;
}

async function ensureActiveLicense(row: LicenseLookup) {
	if (row.license.status === "revoked") {
		return licenseError("LICENSE_REVOKED", "License is revoked.");
	}
	if (row.license.status === "suspended") {
		return licenseError("LICENSE_SUSPENDED", "License is suspended.");
	}
	if (row.license.status === "expired") {
		return licenseError("LICENSE_EXPIRED", "License is expired.");
	}

	if (row.license.expiresAt && row.license.expiresAt <= new Date()) {
		await db
			.update(license)
			.set({ status: "expired", updatedAt: new Date() })
			.where(eq(license.id, row.license.id));
		return licenseError("LICENSE_EXPIRED", "License is expired.");
	}

	return null;
}

function licenseError(code: LicenseErrorCode, message: string): LicenseResult {
	return {
		ok: false,
		error: {
			code,
			message,
		},
	};
}

async function enforceRateLimit(meta: RequestMeta, action: string) {
	const key = `${RATE_LIMIT_PREFIX}:${action}:${meta.ip}`;
	const result = checkRateLimit(key);

	if (!result.ok) {
		await recordLog({
			licenseId: null,
			machineId: null,
			ip: meta.ip,
			userAgent: meta.userAgent,
			eventType: "blocked",
			reason: "RATE_LIMITED",
		});
	}

	return result.ok;
}

export async function activateLicense({
	licenseKey,
	productSlug,
	machineId,
	installationId,
	meta,
}: {
	licenseKey: string;
	productSlug: string;
	machineId: string;
	installationId?: string | null;
	meta: RequestMeta;
}): Promise<LicenseResult> {
	const allowed = await enforceRateLimit(meta, "activate");
	if (!allowed) {
		return licenseError("RATE_LIMITED", "Too many requests.");
	}

	const row = await getLicenseByKey(licenseKey);
	if (!row) {
		return licenseError("LICENSE_NOT_FOUND", "License not found.");
	}
	if (row.productSlug !== productSlug) {
		return licenseError("PRODUCT_MISMATCH", "Product does not match.");
	}

	const activeError = await ensureActiveLicense(row);
	if (activeError) {
		return activeError;
	}

	const existingMachine = await db
		.select()
		.from(machine)
		.where(and(eq(machine.licenseId, row.license.id), eq(machine.fingerprint, machineId)))
		.limit(1);
	const machineRecord = existingMachine[0];

	if (machineRecord && !machineRecord.revokedAt) {
		await db
			.update(machine)
			.set({ lastSeenAt: new Date() })
			.where(eq(machine.id, machineRecord.id));

		await recordLog({
			licenseId: row.license.id,
			machineId: machineRecord.id,
			ip: meta.ip,
			userAgent: meta.userAgent,
			eventType: "activate",
		});

		return {
			ok: true,
			license: formatLicenseResponse(row),
			machine: {
				fingerprint: machineRecord.fingerprint,
				revokedAt: null,
			},
			...createLicenseToken({
				licenseId: row.license.id,
				productSlug: row.productSlug,
				companySlug: row.customerCompanySlug,
				machineFingerprint: machineRecord.fingerprint,
				installationId,
				licenseExpiresAt: row.license.expiresAt,
			}),
		};
	}

	const maxActivations =
		row.license.maxActivations ?? row.defaultMaxActivations;
	const [activeMachineCount] = await db
		.select({
			count: sql<number>`count(*)`.mapWith(Number),
		})
		.from(machine)
		.where(
			and(eq(machine.licenseId, row.license.id), isNull(machine.revokedAt)),
		);
	const count = activeMachineCount?.count ?? 0;

	if (count >= maxActivations) {
		await recordLog({
			licenseId: row.license.id,
			machineId: machineRecord?.id ?? null,
			ip: meta.ip,
			userAgent: meta.userAgent,
			eventType: "blocked",
			reason: "MAX_ACTIVATIONS_REACHED",
		});
		return licenseError(
			"MAX_ACTIVATIONS_REACHED",
			"Maximum activations reached.",
		);
	}

	let currentMachineId = machineRecord?.id ?? null;
	if (machineRecord) {
		await db
			.update(machine)
			.set({
				revokedAt: null,
				activatedAt: new Date(),
				lastSeenAt: new Date(),
			})
			.where(eq(machine.id, machineRecord.id));
		currentMachineId = machineRecord.id;
	} else {
		const [created] = await db
			.insert(machine)
			.values({
				licenseId: row.license.id,
				fingerprint: machineId,
			})
			.returning();
		currentMachineId = created?.id ?? null;
	}

	await recordLog({
		licenseId: row.license.id,
		machineId: currentMachineId,
		ip: meta.ip,
		userAgent: meta.userAgent,
		eventType: "activate",
	});

	return {
		ok: true,
		license: formatLicenseResponse(row),
		machine: {
			fingerprint: machineId,
			revokedAt: null,
		},
		...createLicenseToken({
			licenseId: row.license.id,
			productSlug: row.productSlug,
			companySlug: row.customerCompanySlug,
			machineFingerprint: machineId,
			installationId,
			licenseExpiresAt: row.license.expiresAt,
		}),
	};
}

export async function validateLicense({
	licenseKey,
	productSlug,
	machineId,
	installationId,
	meta,
}: {
	licenseKey: string;
	productSlug: string;
	machineId: string;
	installationId?: string | null;
	meta: RequestMeta;
}): Promise<LicenseResult> {
	const allowed = await enforceRateLimit(meta, "validate");
	if (!allowed) {
		return licenseError("RATE_LIMITED", "Too many requests.");
	}

	const row = await getLicenseByKey(licenseKey);
	if (!row) {
		return licenseError("LICENSE_NOT_FOUND", "License not found.");
	}
	if (row.productSlug !== productSlug) {
		return licenseError("PRODUCT_MISMATCH", "Product does not match.");
	}

	const activeError = await ensureActiveLicense(row);
	if (activeError) {
		return activeError;
	}

	const existingMachine = await db
		.select()
		.from(machine)
		.where(and(eq(machine.licenseId, row.license.id), eq(machine.fingerprint, machineId)))
		.limit(1);
	const machineRecord = existingMachine[0];

	if (!machineRecord || machineRecord.revokedAt) {
		return licenseError("MACHINE_NOT_FOUND", "Machine not found.");
	}

	await db
		.update(machine)
		.set({ lastSeenAt: new Date() })
		.where(eq(machine.id, machineRecord.id));

	await recordLog({
		licenseId: row.license.id,
		machineId: machineRecord.id,
		ip: meta.ip,
		userAgent: meta.userAgent,
		eventType: "validate",
	});

	return {
		ok: true,
		license: formatLicenseResponse(row),
		machine: {
			fingerprint: machineRecord.fingerprint,
			revokedAt: null,
		},
		...createLicenseToken({
			licenseId: row.license.id,
			productSlug: row.productSlug,
			companySlug: row.customerCompanySlug,
			machineFingerprint: machineRecord.fingerprint,
			installationId,
			licenseExpiresAt: row.license.expiresAt,
		}),
	};
}

export async function deactivateLicense({
	licenseKey,
	productSlug,
	machineId,
	installationId: _installationId,
	meta,
}: {
	licenseKey: string;
	productSlug: string;
	machineId: string;
	installationId?: string | null;
	meta: RequestMeta;
}): Promise<LicenseResult> {
	const allowed = await enforceRateLimit(meta, "deactivate");
	if (!allowed) {
		return licenseError("RATE_LIMITED", "Too many requests.");
	}

	const row = await getLicenseByKey(licenseKey);
	if (!row) {
		return licenseError("LICENSE_NOT_FOUND", "License not found.");
	}
	if (row.productSlug !== productSlug) {
		return licenseError("PRODUCT_MISMATCH", "Product does not match.");
	}

	const activeError = await ensureActiveLicense(row);
	if (activeError) {
		return activeError;
	}

	const existingMachine = await db
		.select()
		.from(machine)
		.where(and(eq(machine.licenseId, row.license.id), eq(machine.fingerprint, machineId)))
		.limit(1);

	if (!existingMachine[0] || existingMachine[0].revokedAt) {
		return licenseError("MACHINE_NOT_FOUND", "Machine not found.");
	}

	const now = new Date();
	await db
		.update(machine)
		.set({ revokedAt: now, lastSeenAt: now })
		.where(eq(machine.id, existingMachine[0].id));

	await recordLog({
		licenseId: row.license.id,
		machineId: existingMachine[0].id,
		ip: meta.ip,
		userAgent: meta.userAgent,
		eventType: "deactivate",
	});

	return {
		ok: true,
		license: formatLicenseResponse(row),
		machine: {
			fingerprint: existingMachine[0].fingerprint,
			revokedAt: now.toISOString(),
		},
	};
}
