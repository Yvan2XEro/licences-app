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
let generateLicenseKey: typeof import("@licences-app/api/license-service").generateLicenseKey;
let hashLicenseKey: typeof import("@licences-app/api/license-service").hashLicenseKey;
let createProduct: typeof import("@licences-app/api/admin-service").createProduct;
let getProductDetail: typeof import("@licences-app/api/admin-service").getProductDetail;
let deleteProduct: typeof import("@licences-app/api/admin-service").deleteProduct;
let listLicenses: typeof import("@licences-app/api/admin-service").listLicenses;
let listProductFeatures: typeof import("@licences-app/api/admin-service").listProductFeatures;

beforeAll(async () => {
	const dbModule = await import("@licences-app/db");
	db = dbModule.db;
	customer = dbModule.customer;
	license = dbModule.license;
	product = dbModule.product;
	productFeature = dbModule.productFeature;

	const licenseService = await import("@licences-app/api/license-service");
	generateLicenseKey = licenseService.generateLicenseKey;
	hashLicenseKey = licenseService.hashLicenseKey;

	const adminService = await import("@licences-app/api/admin-service");
	createProduct = adminService.createProduct;
	getProductDetail = adminService.getProductDetail;
	deleteProduct = adminService.deleteProduct;
	listLicenses = adminService.listLicenses;
	listProductFeatures = adminService.listProductFeatures;
});

async function resetTables() {
	await db.execute(
		sql`TRUNCATE "license_feature", "product_feature", "activation_log", "machine", "license", "product", "customer" RESTART IDENTITY CASCADE`,
	);
}

async function seedProducts() {
	const [productA] = await db
		.insert(product)
		.values({ name: "Product A", slug: "product-a", defaultMaxActivations: 1 })
		.returning();
	const [productB] = await db
		.insert(product)
		.values({ name: "Product B", slug: "product-b", defaultMaxActivations: 1 })
		.returning();
	const [testCustomer] = await db
		.insert(customer)
		.values({ name: "Customer", email: "customer@example.com" })
		.returning();
	if (!productA || !productB || !testCustomer) {
		throw new Error("Failed to seed products");
	}
	const customerId = testCustomer.id;

	await db.insert(productFeature).values({
		productId: productA.id,
		key: "offline-mode",
		name: "Offline mode",
		enabledByDefault: true,
	});

	async function insertLicense(
		productId: string,
		status: "active" | "suspended" = "active",
	) {
		const key = generateLicenseKey();
		const [row] = await db
			.insert(license)
			.values({
				key,
				keyHash: hashLicenseKey(key),
				status,
				type: "monthly",
				productId,
				customerId,
			})
			.returning();
		if (!row) throw new Error("Failed to seed license");
		return row;
	}

	const licenseA1 = await insertLicense(productA.id, "active");
	const licenseA2 = await insertLicense(productA.id, "suspended");
	const licenseB1 = await insertLicense(productB.id, "active");

	return { productA, productB, licenseA1, licenseA2, licenseB1 };
}

beforeEach(async () => {
	await resetTables();
});

describe("product detail and deletion", () => {
	it("returns product, features and license stats", async () => {
		const seed = await seedProducts();

		const detail = await getProductDetail(seed.productA.id);

		expect(detail).not.toBeNull();
		expect(detail?.product.slug).toBe("product-a");
		expect(detail?.features.map((feature) => feature.key)).toEqual([
			"offline-mode",
		]);
		expect(detail?.stats.totalLicenses).toBe(2);
		expect(detail?.stats.activeLicenses).toBe(1);
	}, 30_000);

	it("returns null for an unknown product", async () => {
		await seedProducts();

		const detail = await getProductDetail(
			"00000000-0000-0000-0000-000000000000",
		);

		expect(detail).toBeNull();
	}, 30_000);

	it("filters licenses by product", async () => {
		const seed = await seedProducts();

		const result = await listLicenses({
			page: 1,
			pageSize: 10,
			productId: seed.productA.id,
		});

		expect(result.total).toBe(2);
		expect(result.items.every((item) => item.productSlug === "product-a")).toBe(
			true,
		);
	}, 30_000);

	it("deletes a product and cascades its licenses and features", async () => {
		const seed = await seedProducts();

		const deleted = await deleteProduct(seed.productA.id);
		expect(deleted?.id).toBe(seed.productA.id);

		expect(await getProductDetail(seed.productA.id)).toBeNull();
		expect(await listProductFeatures(seed.productA.id)).toEqual([]);

		const remainingLicenses = await listLicenses({ page: 1, pageSize: 10 });
		expect(remainingLicenses.total).toBe(1);
		expect(remainingLicenses.items[0]?.productSlug).toBe("product-b");
	}, 30_000);
});

describe("product creation with initial features", () => {
	it("creates the product and its features atomically", async () => {
		const created = await createProduct({
			name: "Bundle",
			slug: "bundle",
			defaultMaxActivations: 2,
			features: [
				{ key: "offline-mode", name: "Offline mode", enabledByDefault: true },
				{ key: "export-pdf", name: "PDF export", enabledByDefault: false },
			],
		});

		expect(created).not.toBeNull();
		if (!created) return;
		const features = await listProductFeatures(created.id);
		expect(features.map((feature) => feature.key)).toEqual([
			"export-pdf",
			"offline-mode",
		]);
		expect(
			features.find((feature) => feature.key === "offline-mode")
				?.enabledByDefault,
		).toBe(true);
	}, 30_000);

	it("rolls back the product when a feature insert fails", async () => {
		await expect(
			createProduct({
				name: "Broken",
				slug: "broken",
				defaultMaxActivations: 1,
				features: [
					{ key: "dup", name: "A", enabledByDefault: false },
					{ key: "dup", name: "B", enabledByDefault: false },
				],
			}),
		).rejects.toThrow();

		const detailAfter = await db.select().from(product);
		expect(detailAfter.some((row) => row.slug === "broken")).toBe(false);
	}, 30_000);
});
