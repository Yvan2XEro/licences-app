import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
	activationLog,
	customer,
	license,
	machine,
	product,
} from "@licences-app/db";
import { db } from "@licences-app/db";

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
}) {
	const [row] = await db
		.insert(product)
		.values({
			name: input.name,
			slug: input.slug,
			defaultMaxActivations: input.defaultMaxActivations,
		})
		.returning();

	return row ?? null;
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
		input.status ? eq(license.status, input.status) : undefined,
		input.type ? eq(license.type, input.type) : undefined,
		expiringUntil
			? and(sql`${license.expiresAt} is not null`, sql`${license.expiresAt} <= ${expiringUntil}`)
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
}) {
	const key = generateLicenseKey();
	const [row] = await db
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

	return row ?? null;
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

	return {
		...licenseRow,
		machines,
		logs,
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

	const [productsCount, customersCount, licensesCount, statusCounts, expiringCount, reachedCount] =
		await Promise.all([
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
