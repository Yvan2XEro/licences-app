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
let product: typeof import("@licences-app/db").product;
let productFeature: typeof import("@licences-app/db").productFeature;
let activateLicense: typeof import("@licences-app/api/license-service").activateLicense;
let validateLicense: typeof import("@licences-app/api/license-service").validateLicense;
let resolveLicenseFeatures: typeof import("@licences-app/api/license-service").resolveLicenseFeatures;
let generateLicenseKey: typeof import("@licences-app/api/license-service").generateLicenseKey;
let hashLicenseKey: typeof import("@licences-app/api/license-service").hashLicenseKey;
let verifyLicenseToken: typeof import("@licences-app/api/license-service").verifyLicenseToken;
let createLicense: typeof import("@licences-app/api/admin-service").createLicense;
let createProductFeature: typeof import("@licences-app/api/admin-service").createProductFeature;
let getLicenseFeatures: typeof import("@licences-app/api/admin-service").getLicenseFeatures;
let setLicenseFeature: typeof import("@licences-app/api/admin-service").setLicenseFeature;

beforeAll(async () => {
	const dbModule = await import("@licences-app/db");
	db = dbModule.db;
	customer = dbModule.customer;
	license = dbModule.license;
	product = dbModule.product;
	productFeature = dbModule.productFeature;

	const licenseService = await import("@licences-app/api/license-service");
	activateLicense = licenseService.activateLicense;
	validateLicense = licenseService.validateLicense;
	resolveLicenseFeatures = licenseService.resolveLicenseFeatures;
	generateLicenseKey = licenseService.generateLicenseKey;
	hashLicenseKey = licenseService.hashLicenseKey;
	verifyLicenseToken = licenseService.verifyLicenseToken;

	const adminService = await import("@licences-app/api/admin-service");
	createLicense = adminService.createLicense;
	createProductFeature = adminService.createProductFeature;
	getLicenseFeatures = adminService.getLicenseFeatures;
	setLicenseFeature = adminService.setLicenseFeature;
});

const baseMeta = () => ({
	ip: `127.0.1.${Math.floor(Math.random() * 200) + 1}`,
	userAgent: "bun-test",
});

async function resetTables() {
	await db.execute(
		sql`TRUNCATE "license_feature", "product_feature", "activation_log", "machine", "license", "product", "customer" RESTART IDENTITY CASCADE`,
	);
}

async function seedLicenseWithFeatures() {
	const [createdProduct] = await db
		.insert(product)
		.values({
			name: "Feature Product",
			slug: "feature-product",
			defaultMaxActivations: 3,
		})
		.returning();
	const [createdCustomer] = await db
		.insert(customer)
		.values({
			email: "features@example.com",
			name: "Feature Customer",
		})
		.returning();
	if (!createdProduct || !createdCustomer) {
		throw new Error("Failed to seed product/customer");
	}

	const [defaultOn] = await db
		.insert(productFeature)
		.values({
			productId: createdProduct.id,
			key: "offline-mode",
			name: "Offline mode",
			enabledByDefault: true,
		})
		.returning();
	const [defaultOff] = await db
		.insert(productFeature)
		.values({
			productId: createdProduct.id,
			key: "export-pdf",
			name: "PDF export",
			enabledByDefault: false,
		})
		.returning();
	if (!defaultOn || !defaultOff) {
		throw new Error("Failed to seed features");
	}

	const licenseKey = generateLicenseKey();
	const [createdLicense] = await db
		.insert(license)
		.values({
			key: licenseKey,
			keyHash: hashLicenseKey(licenseKey),
			status: "active",
			type: "monthly",
			productId: createdProduct.id,
			customerId: createdCustomer.id,
		})
		.returning();
	if (!createdLicense) {
		throw new Error("Failed to seed license");
	}

	return {
		product: createdProduct,
		license: createdLicense,
		licenseKey,
		defaultOn,
		defaultOff,
	};
}

beforeEach(async () => {
	await resetTables();
});

describe("license features", () => {
	it("resolves product defaults when the license has no overrides", async () => {
		const seed = await seedLicenseWithFeatures();

		const features = await resolveLicenseFeatures(
			seed.license.id,
			seed.product.id,
		);

		expect(features).toEqual(["offline-mode"]);
	}, 30_000);

	it("exposes effective features in the activation response and signed token", async () => {
		const seed = await seedLicenseWithFeatures();

		const result = await activateLicense({
			licenseKey: seed.licenseKey,
			productSlug: "feature-product",
			machineId: "machine-features-1",
			meta: baseMeta(),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.license.features).toEqual(["offline-mode"]);
		expect(result.token).toBeDefined();
		const payload = verifyLicenseToken(result.token ?? "");
		expect(payload).not.toBeNull();
		expect(payload?.features).toEqual(["offline-mode"]);
	}, 30_000);

	it("enables a non-default feature through a license override", async () => {
		const seed = await seedLicenseWithFeatures();

		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOff.id,
			enabled: true,
		});

		const features = await resolveLicenseFeatures(
			seed.license.id,
			seed.product.id,
		);
		expect(features).toEqual(["export-pdf", "offline-mode"]);
	}, 30_000);

	it("disables a default feature through a license override", async () => {
		const seed = await seedLicenseWithFeatures();

		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOn.id,
			enabled: false,
		});

		const features = await resolveLicenseFeatures(
			seed.license.id,
			seed.product.id,
		);
		expect(features).toEqual([]);
	}, 30_000);

	it("falls back to the product default when an override is cleared", async () => {
		const seed = await seedLicenseWithFeatures();

		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOn.id,
			enabled: false,
		});
		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOn.id,
			enabled: null,
		});

		const features = await resolveLicenseFeatures(
			seed.license.id,
			seed.product.id,
		);
		expect(features).toEqual(["offline-mode"]);
	}, 30_000);

	it("updates an existing override in place (upsert)", async () => {
		const seed = await seedLicenseWithFeatures();

		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOff.id,
			enabled: true,
		});
		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOff.id,
			enabled: false,
		});

		const features = await resolveLicenseFeatures(
			seed.license.id,
			seed.product.id,
		);
		expect(features).toEqual(["offline-mode"]);
	}, 30_000);

	it("reports override and effective state for the admin detail view", async () => {
		const seed = await seedLicenseWithFeatures();

		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOn.id,
			enabled: false,
		});

		const rows = await getLicenseFeatures(seed.license.id, seed.product.id);
		const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

		expect(byKey["offline-mode"]?.enabledByDefault).toBe(true);
		expect(byKey["offline-mode"]?.override).toBe(false);
		expect(byKey["offline-mode"]?.effective).toBe(false);
		expect(byKey["export-pdf"]?.enabledByDefault).toBe(false);
		expect(byKey["export-pdf"]?.override).toBeNull();
		expect(byKey["export-pdf"]?.effective).toBe(false);
	}, 30_000);

	it("reflects feature changes on the next validate", async () => {
		const seed = await seedLicenseWithFeatures();

		const activation = await activateLicense({
			licenseKey: seed.licenseKey,
			productSlug: "feature-product",
			machineId: "machine-features-2",
			meta: baseMeta(),
		});
		expect(activation.ok).toBe(true);

		await setLicenseFeature({
			licenseId: seed.license.id,
			featureId: seed.defaultOff.id,
			enabled: true,
		});

		const validation = await validateLicense({
			licenseKey: seed.licenseKey,
			productSlug: "feature-product",
			machineId: "machine-features-2",
			meta: baseMeta(),
		});
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		expect(validation.license.features).toEqual(["export-pdf", "offline-mode"]);
		const payload = verifyLicenseToken(validation.token ?? "");
		expect(payload?.features).toEqual(["export-pdf", "offline-mode"]);
	}, 30_000);

	it("applies checked features as overrides at license creation", async () => {
		const seed = await seedLicenseWithFeatures();

		const [testCustomer] = await db.select().from(customer).limit(1);
		if (!testCustomer) throw new Error("Missing seeded customer");

		const created = await createLicense({
			productId: seed.product.id,
			customerId: testCustomer.id,
			type: "monthly",
			expiresAt: null,
			maxActivations: null,
			status: "active",
			features: [
				// Deviations from defaults: enable export-pdf, disable offline-mode.
				{ featureId: seed.defaultOff.id, enabled: true },
				{ featureId: seed.defaultOn.id, enabled: false },
			],
		});

		expect(created).not.toBeNull();
		if (!created) return;
		const features = await resolveLicenseFeatures(created.id, seed.product.id);
		expect(features).toEqual(["export-pdf"]);
	}, 30_000);

	it("rejects a duplicate feature key on the same product", async () => {
		const seed = await seedLicenseWithFeatures();

		await expect(
			createProductFeature({
				productId: seed.product.id,
				key: "offline-mode",
				name: "Duplicate",
				enabledByDefault: false,
			}),
		).rejects.toThrow();
	}, 30_000);
});
