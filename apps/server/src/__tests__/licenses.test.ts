import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";

process.env.LICENSE_TOKEN_PRIVATE_KEY ??=
	"-----BEGIN PRIVATE KEY-----\\nMC4CAQAwBQYDK2VwBCIEIJxQvCy45M1LZQnIGlkHZC/XWnurKGG9623v/yXaK6Fv\\n-----END PRIVATE KEY-----";
process.env.LICENSE_TOKEN_PUBLIC_KEY ??=
	"-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEACrhJ8hY+ANIgHTyjPtY5kAnTKbX11y8jdJzr8s+SfZE=\\n-----END PUBLIC KEY-----";
process.env.LICENSE_OFFLINE_DAYS ??= "5";

let db: typeof import("@licences-app/db").db;
let customer: typeof import("@licences-app/db").customer;
let license: typeof import("@licences-app/db").license;
let machine: typeof import("@licences-app/db").machine;
let product: typeof import("@licences-app/db").product;
let activateLicense: typeof import("@licences-app/api/license-service").activateLicense;
let deactivateLicense: typeof import("@licences-app/api/license-service").deactivateLicense;
let generateLicenseKey: typeof import("@licences-app/api/license-service").generateLicenseKey;
let hashLicenseKey: typeof import("@licences-app/api/license-service").hashLicenseKey;
let validateLicense: typeof import("@licences-app/api/license-service").validateLicense;
let verifyLicenseToken: typeof import("@licences-app/api/license-service").verifyLicenseToken;

beforeAll(async () => {
	const dbModule = await import("@licences-app/db");
	db = dbModule.db;
	customer = dbModule.customer;
	license = dbModule.license;
	machine = dbModule.machine;
	product = dbModule.product;

	const service = await import("@licences-app/api/license-service");
	activateLicense = service.activateLicense;
	deactivateLicense = service.deactivateLicense;
	generateLicenseKey = service.generateLicenseKey;
	hashLicenseKey = service.hashLicenseKey;
	validateLicense = service.validateLicense;
	verifyLicenseToken = service.verifyLicenseToken;
});

const baseMeta = () => ({
	ip: `127.0.0.${Math.floor(Math.random() * 200) + 1}`,
	userAgent: "bun-test",
});

async function resetTables() {
	await db.execute(
		sql`TRUNCATE "activation_log", "machine", "license", "product", "customer" RESTART IDENTITY CASCADE`,
	);
}

async function seedLicense({
	productSlug = "product-1",
	companySlug = "company-1",
	companyName = "Company 1",
	defaultMaxActivations = 1,
	licenseStatus = "active",
	maxActivations = null,
	expiresAt = null,
}: {
	productSlug?: string;
	companySlug?: string | null;
	companyName?: string | null;
	defaultMaxActivations?: number;
	licenseStatus?: "active" | "suspended" | "expired" | "revoked";
	maxActivations?: number | null;
	expiresAt?: Date | null;
}) {
	const [createdProduct] = await db
		.insert(product)
		.values({
			name: "Demo Product",
			slug: productSlug,
			defaultMaxActivations,
		})
		.returning();

	const [createdCustomer] = await db
		.insert(customer)
		.values({
			email: `${productSlug}@example.com`,
			name: "Test Customer",
			companySlug,
			companyName,
		})
		.returning();
	if (!createdProduct || !createdCustomer) {
		throw new Error("Failed to seed test license data");
	}

	const licenseKey = `LIC-${Math.random().toString(16).slice(2, 6).toUpperCase()}-${Math.random()
		.toString(16)
		.slice(2, 6)
		.toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

	await db.insert(license).values({
		key: licenseKey,
		keyHash: hashLicenseKey(licenseKey),
		status: licenseStatus,
		type: "monthly",
			expiresAt,
			maxActivations,
			productId: createdProduct.id,
			customerId: createdCustomer.id,
	});

	return {
		licenseKey,
		productSlug,
	};
}

beforeEach(async () => {
	await resetTables();
});

describe("license activation flow", () => {
	it("activates the first machine within limit", async () => {
		const { licenseKey, productSlug } = await seedLicense({});
		const result = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.machine.fingerprint).toBe("machine-1");
		}
	}, 20_000);

	it("activates same machine idempotently", async () => {
		const { licenseKey, productSlug } = await seedLicense({});
		await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		const second = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		expect(second.ok).toBe(true);
		const machines = await db.select().from(machine);
		expect(machines.length).toBe(1);
	}, 20_000);

	it("blocks second machine when limit is 1", async () => {
		const { licenseKey, productSlug } = await seedLicense({
			defaultMaxActivations: 1,
		});
		await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		const result = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-2",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("MAX_ACTIVATIONS_REACHED");
		}
	}, 20_000);

	it("deactivates and frees slot for new activation", async () => {
		const { licenseKey, productSlug } = await seedLicense({
			defaultMaxActivations: 1,
		});
		await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		const deactivated = await deactivateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});
		expect(deactivated.ok).toBe(true);

		const activated = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-2",
			meta: baseMeta(),
		});
		expect(activated.ok).toBe(true);
	}, 20_000);

	it("rejects expired licenses", async () => {
		const { licenseKey, productSlug } = await seedLicense({
			expiresAt: new Date(Date.now() - 60_000),
		});
		const result = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("LICENSE_EXPIRED");
		}
	}, 20_000);

	it("rejects suspended and revoked licenses", async () => {
		const suspended = await seedLicense({
			licenseStatus: "suspended",
			productSlug: "product-suspended",
		});
		const suspendedResult = await activateLicense({
			licenseKey: suspended.licenseKey,
			productSlug: suspended.productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});
		expect(suspendedResult.ok).toBe(false);
		if (!suspendedResult.ok) {
			expect(suspendedResult.error.code).toBe("LICENSE_SUSPENDED");
		}

		await resetTables();

		const revoked = await seedLicense({
			licenseStatus: "revoked",
			productSlug: "product-revoked",
		});
		const revokedResult = await activateLicense({
			licenseKey: revoked.licenseKey,
			productSlug: revoked.productSlug,
			machineId: "machine-2",
			meta: baseMeta(),
		});
		expect(revokedResult.ok).toBe(false);
		if (!revokedResult.ok) {
			expect(revokedResult.error.code).toBe("LICENSE_REVOKED");
		}
	}, 20_000);

	it("rejects product mismatch", async () => {
		const { licenseKey } = await seedLicense({
			productSlug: "product-original",
		});
		const result = await validateLicense({
			licenseKey,
			productSlug: "product-other",
			machineId: "machine-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("PRODUCT_MISMATCH");
		}
	}, 20_000);
});

describe("license tokens", () => {
	it("generates a high-entropy human-friendly license key", () => {
		const licenseKey = generateLicenseKey();
		expect(licenseKey).toMatch(
			/^LIC(?:-[0-9A-HJKMNPQRSTVWXYZ]{5}){5}-[0-9A-HJKMNPQRSTVWXYZ]$/,
		);
	});

	it("returns token on activate and validate", async () => {
		const { licenseKey, productSlug } = await seedLicense({});
		const activated = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			installationId: "install-1",
			meta: baseMeta(),
		});
		expect(activated.ok).toBe(true);
		if (activated.ok) {
			expect(activated.token).toBeTruthy();
			expect(activated.tokenExpiresAt).toBeTruthy();
		}

		const validated = await validateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			installationId: "install-1",
			meta: baseMeta(),
		});
		expect(validated.ok).toBe(true);
		if (validated.ok) {
			expect(validated.token).toBeTruthy();
		}
	}, 20_000);

	it("verifies token signature and offlineUntil", async () => {
		const { licenseKey, productSlug } = await seedLicense({});
		const result = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			installationId: "install-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(true);
		if (!result.ok || !result.token) {
			throw new Error("Token not returned");
		}

		const payload = verifyLicenseToken(result.token);
		expect(payload).not.toBeNull();
		if (!payload) {
			return;
		}
		expect(payload.version).toBe(2);
		expect(payload.iss).toBe("licences-app");
		expect(payload.aud).toBe("licences-app-client");
		expect(payload.sub).toBe(payload.licenseId);
		expect(payload.installationId).toBe("install-1");
		expect(payload.companySlug).toBe("company-1");
		expect(payload.jti.length).toBeGreaterThan(10);
		const issuedAt = new Date(payload.issuedAt).getTime();
		const offlineUntil = new Date(payload.offlineUntil).getTime();
		const expectedMs = 5 * 24 * 60 * 60 * 1000;
		const diff = Math.abs(offlineUntil - issuedAt - expectedMs);
		expect(diff).toBeLessThan(5_000);
	}, 20_000);

	it("rejects tampered tokens", async () => {
		const { licenseKey, productSlug } = await seedLicense({});
		const result = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			installationId: "install-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(true);
		if (!result.ok || !result.token) {
			throw new Error("Token not returned");
		}

		const [header, body] = result.token.split(".");
		const tamperedToken = `${header}.${body}.AAAA`;
		expect(verifyLicenseToken(tamperedToken)).toBeNull();
	}, 20_000);

	it("does not issue token for revoked or suspended licenses", async () => {
		const suspended = await seedLicense({
			licenseStatus: "suspended",
			productSlug: "product-suspended",
		});
		const suspendedResult = await activateLicense({
			licenseKey: suspended.licenseKey,
			productSlug: suspended.productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});
		expect(suspendedResult.ok).toBe(false);
		if (!suspendedResult.ok) {
			expect((suspendedResult as any).token).toBeUndefined();
		}

		await resetTables();

		const revoked = await seedLicense({
			licenseStatus: "revoked",
			productSlug: "product-revoked",
		});
		const revokedResult = await activateLicense({
			licenseKey: revoked.licenseKey,
			productSlug: revoked.productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});
		expect(revokedResult.ok).toBe(false);
		if (!revokedResult.ok) {
			expect((revokedResult as any).token).toBeUndefined();
		}
	}, 20_000);

	it("does not issue token for expired licenses", async () => {
		const { licenseKey, productSlug } = await seedLicense({
			expiresAt: new Date(Date.now() - 60_000),
		});
		const result = await activateLicense({
			licenseKey,
			productSlug,
			machineId: "machine-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect((result as any).token).toBeUndefined();
		}
	}, 20_000);
});
