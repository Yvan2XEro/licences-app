import {
	activationLog,
	customer,
	db,
	license,
	licenseFeature,
	machine,
	product,
	productFeature,
} from "@licences-app/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { generateLicenseKey, hashLicenseKey } from "./license-service";

export async function listProducts(input: {
	search?: string | null;
	page: number;
	pageSize: number;
}) {
	const search = input.search?.trim() || null;
	const whereClause = search
		? or(ilike(product.name, `%${search}%`), ilike(product.slug, `%${search}%`))
		: undefined;
	const offset = Math.max(0, (input.page - 1) * input.pageSize);

	const [productCount] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(product)
		.where(whereClause);

	const items = await db
		.select()
		.from(product)
		.where(whereClause)
		.orderBy(desc(product.createdAt))
		.limit(input.pageSize)
		.offset(offset);

	return { items, total: productCount?.count ?? 0 };
}

export async function createProduct(input: {
	name: string;
	slug: string;
	defaultMaxActivations: number;
	features?: {
		key: string;
		name: string;
		description?: string | null;
		enabledByDefault: boolean;
	}[];
}) {
	// Product and its initial features are created atomically: a bad feature
	// payload must not leave a half-created product behind.
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(product)
			.values({
				name: input.name,
				slug: input.slug,
				defaultMaxActivations: input.defaultMaxActivations,
			})
			.returning();

		if (!row) {
			return null;
		}

		if (input.features && input.features.length > 0) {
			await tx.insert(productFeature).values(
				input.features.map((feature) => ({
					productId: row.id,
					key: feature.key,
					name: feature.name,
					description: feature.description || null,
					enabledByDefault: feature.enabledByDefault,
				})),
			);
		}

		return row;
	});
}

export async function updateProduct(input: {
	id: string;
	name: string;
	slug: string;
	defaultMaxActivations: number;
}) {
	const [row] = await db
		.update(product)
		.set({
			name: input.name,
			slug: input.slug,
			defaultMaxActivations: input.defaultMaxActivations,
		})
		.where(eq(product.id, input.id))
		.returning();

	return row ?? null;
}

export async function getProductDetail(productId: string) {
	const [productRow] = await db
		.select()
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!productRow) {
		return null;
	}

	const [features, [licenseStats]] = await Promise.all([
		listProductFeatures(productId),
		db
			.select({
				total: sql<number>`count(*)`.mapWith(Number),
				active:
					sql<number>`count(*) filter (where ${license.status} = 'active')`.mapWith(
						Number,
					),
			})
			.from(license)
			.where(eq(license.productId, productId)),
	]);

	return {
		product: productRow,
		features,
		stats: {
			totalLicenses: licenseStats?.total ?? 0,
			activeLicenses: licenseStats?.active ?? 0,
		},
	};
}

export async function deleteProduct(productId: string) {
	const [row] = await db
		.delete(product)
		.where(eq(product.id, productId))
		.returning();

	return row ?? null;
}

export async function listCustomers(input: {
	search?: string | null;
	page: number;
	pageSize: number;
}) {
	const search = input.search?.trim() || null;
	const pattern = search ? `%${search}%` : "";
	const whereClause = search
		? or(
				ilike(customer.name, pattern),
				sql`${customer.companySlug} ILIKE ${pattern}`,
				sql`${customer.companyName} ILIKE ${pattern}`,
				sql`${customer.email} ILIKE ${pattern}`,
				sql`${customer.phone} ILIKE ${pattern}`,
				sql`${customer.address} ILIKE ${pattern}`,
			)
		: undefined;
	const offset = Math.max(0, (input.page - 1) * input.pageSize);

	const [customerCount] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(customer)
		.where(whereClause);

	const items = await db
		.select()
		.from(customer)
		.where(whereClause)
		.orderBy(desc(customer.createdAt))
		.limit(input.pageSize)
		.offset(offset);

	return { items, total: customerCount?.count ?? 0 };
}

export async function createCustomer(input: {
	name: string;
	email?: string | null;
	companySlug?: string | null;
	companyName?: string | null;
	phone?: string | null;
	address?: string | null;
}) {
	const [row] = await db
		.insert(customer)
		.values({
			name: input.name,
			email: input.email || null,
			companySlug: input.companySlug || null,
			companyName: input.companyName || null,
			phone: input.phone || null,
			address: input.address || null,
		})
		.returning();

	return row ?? null;
}

export async function updateCustomer(input: {
	id: string;
	name: string;
	email?: string | null;
	companySlug?: string | null;
	companyName?: string | null;
	phone?: string | null;
	address?: string | null;
}) {
	const [row] = await db
		.update(customer)
		.set({
			name: input.name,
			email: input.email || null,
			companySlug: input.companySlug || null,
			companyName: input.companyName || null,
			phone: input.phone || null,
			address: input.address || null,
		})
		.where(eq(customer.id, input.id))
		.returning();

	return row ?? null;
}

export async function listLicenses(input: {
	search?: string | null;
	page: number;
	pageSize: number;
	status?: "active" | "suspended" | "expired" | "revoked";
	type?: "trial" | "monthly" | "yearly" | "lifetime";
	expiringInDays?: number | null;
	activationsReached?: boolean;
	productId?: string;
}) {
	const search = input.search?.trim() || null;
	const pattern = search ? `%${search}%` : "";
	const now = new Date();
	const expiringUntil =
		typeof input.expiringInDays === "number"
			? new Date(now.getTime() + input.expiringInDays * 24 * 60 * 60 * 1000)
			: null;
	const whereClause = search
		? or(
				ilike(license.key, pattern),
				ilike(product.name, pattern),
				ilike(product.slug, pattern),
				sql`${customer.companySlug} ILIKE ${pattern}`,
				sql`${customer.companyName} ILIKE ${pattern}`,
				sql`${customer.email} ILIKE ${pattern}`,
				sql`${customer.phone} ILIKE ${pattern}`,
				ilike(customer.name, pattern),
			)
		: undefined;
	const filters = [
		input.productId ? eq(license.productId, input.productId) : undefined,
		input.status ? eq(license.status, input.status) : undefined,
		input.type ? eq(license.type, input.type) : undefined,
		expiringUntil
			? and(
					sql`${license.expiresAt} is not null`,
					sql`${license.expiresAt} <= ${expiringUntil}`,
				)
			: undefined,
		input.activationsReached
			? sql`(select count(*) from ${machine} m where m.license_id = ${license.id} and m.revoked_at is null) >= coalesce(${license.maxActivations}, ${product.defaultMaxActivations})`
			: undefined,
	];
	let combinedWhere = whereClause;
	for (const clause of filters) {
		if (!clause) continue;
		combinedWhere = combinedWhere ? and(combinedWhere, clause) : clause;
	}
	const offset = Math.max(0, (input.page - 1) * input.pageSize);

	const [licenseCount] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(license)
		.innerJoin(product, eq(license.productId, product.id))
		.innerJoin(customer, eq(license.customerId, customer.id))
		.where(combinedWhere);

	const items = await db
		.select({
			license,
			productSlug: product.slug,
			productName: product.name,
			customerEmail: customer.email,
			customerName: customer.name,
			customerCompanySlug: customer.companySlug,
			customerCompanyName: customer.companyName,
			customerPhone: customer.phone,
		})
		.from(license)
		.innerJoin(product, eq(license.productId, product.id))
		.innerJoin(customer, eq(license.customerId, customer.id))
		.where(combinedWhere)
		.orderBy(desc(license.createdAt))
		.limit(input.pageSize)
		.offset(offset);

	return { items, total: licenseCount?.count ?? 0 };
}

export async function createLicense(input: {
	productId: string;
	customerId: string;
	type: "trial" | "monthly" | "yearly" | "lifetime";
	expiresAt: Date | null;
	maxActivations: number | null;
	status: "active" | "suspended" | "expired" | "revoked";
	// Only the deviations from the product defaults; the rest is inherited.
	features?: { featureId: string; enabled: boolean }[];
}) {
	const key = generateLicenseKey();
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(license)
			.values({
				key,
				keyHash: hashLicenseKey(key),
				productId: input.productId,
				customerId: input.customerId,
				type: input.type,
				expiresAt: input.expiresAt,
				maxActivations: input.maxActivations,
				status: input.status,
			})
			.returning();

		if (!row) {
			return null;
		}

		if (input.features && input.features.length > 0) {
			await tx.insert(licenseFeature).values(
				input.features.map((feature) => ({
					licenseId: row.id,
					featureId: feature.featureId,
					enabled: feature.enabled,
				})),
			);
		}

		return row;
	});
}

export async function updateLicense(input: {
	id: string;
	status: "active" | "suspended" | "expired" | "revoked";
	expiresAt: Date | null;
	maxActivations: number | null;
}) {
	const [row] = await db
		.update(license)
		.set({
			status: input.status,
			expiresAt: input.expiresAt,
			maxActivations: input.maxActivations,
			updatedAt: new Date(),
		})
		.where(eq(license.id, input.id))
		.returning();

	return row ?? null;
}

export async function listProductFeatures(productId: string) {
	return db
		.select()
		.from(productFeature)
		.where(eq(productFeature.productId, productId))
		.orderBy(asc(productFeature.key));
}

export async function createProductFeature(input: {
	productId: string;
	key: string;
	name: string;
	description?: string | null;
	enabledByDefault: boolean;
}) {
	const [row] = await db
		.insert(productFeature)
		.values({
			productId: input.productId,
			key: input.key,
			name: input.name,
			description: input.description || null,
			enabledByDefault: input.enabledByDefault,
		})
		.returning();

	return row ?? null;
}

export async function updateProductFeature(input: {
	id: string;
	name: string;
	description?: string | null;
	enabledByDefault: boolean;
}) {
	const [row] = await db
		.update(productFeature)
		.set({
			name: input.name,
			description: input.description || null,
			enabledByDefault: input.enabledByDefault,
		})
		.where(eq(productFeature.id, input.id))
		.returning();

	return row ?? null;
}

export async function deleteProductFeature(featureId: string) {
	const [row] = await db
		.delete(productFeature)
		.where(eq(productFeature.id, featureId))
		.returning();

	return row ?? null;
}

export async function setLicenseFeature(input: {
	licenseId: string;
	featureId: string;
	enabled: boolean | null;
}) {
	if (input.enabled === null) {
		await db
			.delete(licenseFeature)
			.where(
				and(
					eq(licenseFeature.licenseId, input.licenseId),
					eq(licenseFeature.featureId, input.featureId),
				),
			);
		return {
			licenseId: input.licenseId,
			featureId: input.featureId,
			enabled: null,
		};
	}

	const [row] = await db
		.insert(licenseFeature)
		.values({
			licenseId: input.licenseId,
			featureId: input.featureId,
			enabled: input.enabled,
		})
		.onConflictDoUpdate({
			target: [licenseFeature.licenseId, licenseFeature.featureId],
			set: { enabled: input.enabled, updatedAt: new Date() },
		})
		.returning();

	return row ?? null;
}

export async function getLicenseFeatures(licenseId: string, productId: string) {
	const rows = await db
		.select({
			id: productFeature.id,
			key: productFeature.key,
			name: productFeature.name,
			description: productFeature.description,
			enabledByDefault: productFeature.enabledByDefault,
			override: licenseFeature.enabled,
		})
		.from(productFeature)
		.leftJoin(
			licenseFeature,
			and(
				eq(licenseFeature.featureId, productFeature.id),
				eq(licenseFeature.licenseId, licenseId),
			),
		)
		.where(eq(productFeature.productId, productId))
		.orderBy(asc(productFeature.key));

	return rows.map((row) => ({
		...row,
		effective: row.override ?? row.enabledByDefault,
	}));
}

export async function getLicenseDetail(licenseId: string) {
	const [licenseRow] = await db
		.select({
			license,
			product,
			customer,
		})
		.from(license)
		.innerJoin(product, eq(license.productId, product.id))
		.innerJoin(customer, eq(license.customerId, customer.id))
		.where(eq(license.id, licenseId))
		.limit(1);

	if (!licenseRow) {
		return null;
	}

	const machines = await db
		.select()
		.from(machine)
		.where(eq(machine.licenseId, licenseId))
		.orderBy(desc(machine.activatedAt));

	const logs = await db
		.select()
		.from(activationLog)
		.where(eq(activationLog.licenseId, licenseId))
		.orderBy(desc(activationLog.createdAt));

	const features = await getLicenseFeatures(
		licenseId,
		licenseRow.license.productId,
	);

	return {
		...licenseRow,
		machines,
		logs,
		features,
	};
}

export async function revokeMachine(machineId: string) {
	const [row] = await db
		.update(machine)
		.set({
			revokedAt: new Date(),
			lastSeenAt: new Date(),
		})
		.where(eq(machine.id, machineId))
		.returning();

	return row ?? null;
}

export async function restoreMachine(machineId: string) {
	const [row] = await db
		.update(machine)
		.set({
			revokedAt: null,
			lastSeenAt: new Date(),
		})
		.where(eq(machine.id, machineId))
		.returning();

	return row ?? null;
}

export async function getDashboardStats() {
	const now = new Date();
	const expiringSoon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

	const [
		productsCount,
		customersCount,
		licensesCount,
		statusCounts,
		expiringCount,
		reachedCount,
	] = await Promise.all([
		db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(product),
		db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(customer),
		db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(license),
		db
			.select({
				status: license.status,
				count: sql<number>`count(*)`.mapWith(Number),
			})
			.from(license)
			.groupBy(license.status),
		db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(license)
			.where(
				and(
					eq(license.status, "active"),
					sql`${license.expiresAt} is not null`,
					sql`${license.expiresAt} <= ${expiringSoon}`,
				),
			),
		db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(license)
			.innerJoin(product, eq(license.productId, product.id))
			.where(
				and(
					eq(license.status, "active"),
					sql`(select count(*) from ${machine} m where m.license_id = ${license.id} and m.revoked_at is null) >= coalesce(${license.maxActivations}, ${product.defaultMaxActivations})`,
				),
			),
	]);

	const statusMap = statusCounts.reduce<Record<string, number>>((acc, row) => {
		acc[row.status] = row.count;
		return acc;
	}, {});

	return {
		products: productsCount[0]?.count ?? 0,
		customers: customersCount[0]?.count ?? 0,
		licenses: licensesCount[0]?.count ?? 0,
		licensesActive: statusMap.active ?? 0,
		licensesSuspended: statusMap.suspended ?? 0,
		licensesExpired: statusMap.expired ?? 0,
		licensesRevoked: statusMap.revoked ?? 0,
		licensesExpiringSoon: expiringCount[0]?.count ?? 0,
		activationsReached: reachedCount[0]?.count ?? 0,
	};
}
