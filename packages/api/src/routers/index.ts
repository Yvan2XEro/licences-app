import type { RouterClient } from "@orpc/server";
import { z } from "zod";

import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
import {
	createCustomer,
	createLicense,
	createProduct,
	getLicenseDetail,
	getDashboardStats,
	listCustomers,
	listLicenses,
	listProducts,
	revokeMachine,
	restoreMachine,
	updateCustomer,
	updateLicense,
	updateProduct,
} from "../admin-service";
import {
	activateLicense,
	deactivateLicense,
	getLicenseTokenPublicKeyPem,
	validateLicense,
} from "../license-service";

const licenseInputSchema = z.object({
	licenseKey: z.string().min(1),
	productSlug: z.string().min(1),
	machineId: z.string().min(1),
	installationId: z.string().min(1).optional(),
});

const productSchema = z.object({
	name: z.string().min(1),
	slug: z.string().min(1),
	defaultMaxActivations: z.number().int().positive(),
});

const productUpdateSchema = productSchema.extend({
	id: z.string().min(1),
});

const customerSchema = z.object({
	name: z.string().min(1),
	email: z.string().email().optional().or(z.literal("")).nullable(),
	phone: z.string().optional().or(z.literal("")).nullable(),
	address: z.string().optional().or(z.literal("")).nullable(),
});

const customerUpdateSchema = customerSchema.extend({
	id: z.string().min(1),
});

const listQuerySchema = z.object({
	search: z.string().optional(),
	page: z.number().int().positive().optional(),
	pageSize: z.number().int().positive().optional(),
});

const listQuerySchemaOptional = listQuerySchema.optional();

const licenseCreateSchema = z.object({
	productId: z.string().min(1),
	customerId: z.string().min(1),
	type: z.enum(["trial", "monthly", "yearly", "lifetime"]),
	expiresAt: z.string().datetime().nullable(),
	maxActivations: z.number().int().positive().nullable(),
	status: z.enum(["active", "suspended", "expired", "revoked"]).default("active"),
});

const licenseUpdateSchema = z.object({
	id: z.string().min(1),
	status: z.enum(["active", "suspended", "expired", "revoked"]),
	expiresAt: z.string().datetime().nullable(),
	maxActivations: z.number().int().positive().nullable(),
});

const licenseIdSchema = z.object({
	licenseId: z.string().min(1),
});

const machineRevokeSchema = z.object({
	machineId: z.string().min(1),
});

const machineRestoreSchema = z.object({
	machineId: z.string().min(1),
});

const licenseFilterSchema = listQuerySchema.extend({
	status: z.enum(["active", "suspended", "expired", "revoked"]).optional(),
	type: z.enum(["trial", "monthly", "yearly", "lifetime"]).optional(),
	expiringInDays: z.number().int().positive().optional(),
	activationsReached: z.boolean().optional(),
});

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	licenses: {
		publicKey: publicProcedure.handler(() => ({
			algorithm: "Ed25519",
			publicKey: getLicenseTokenPublicKeyPem(),
		})),
		activate: publicProcedure.input(licenseInputSchema).handler(async ({ input, context }) => {
			return activateLicense({
				licenseKey: input.licenseKey,
				productSlug: input.productSlug,
				machineId: input.machineId,
				installationId: input.installationId ?? null,
				meta: {
					ip: context.ip,
					userAgent: context.userAgent ?? null,
				},
			});
		}),
		validate: publicProcedure.input(licenseInputSchema).handler(async ({ input, context }) => {
			return validateLicense({
				licenseKey: input.licenseKey,
				productSlug: input.productSlug,
				machineId: input.machineId,
				installationId: input.installationId ?? null,
				meta: {
					ip: context.ip,
					userAgent: context.userAgent ?? null,
				},
			});
		}),
		deactivate: publicProcedure.input(licenseInputSchema).handler(async ({ input, context }) => {
			return deactivateLicense({
				licenseKey: input.licenseKey,
				productSlug: input.productSlug,
				machineId: input.machineId,
				installationId: input.installationId ?? null,
				meta: {
					ip: context.ip,
					userAgent: context.userAgent ?? null,
				},
			});
		}),
	},
	admin: {
		me: adminProcedure.handler(({ context }) => {
			return {
				user: context.session?.user,
			};
		}),
		dashboard: {
			stats: adminProcedure.handler(() => getDashboardStats()),
		},
		products: {
			list: adminProcedure.input(listQuerySchemaOptional).handler(async ({ input }) => {
				const query = input ?? {};
				return listProducts({
					search: query.search,
					page: query.page ?? 1,
					pageSize: query.pageSize ?? 10,
				});
			}),
			create: adminProcedure.input(productSchema).handler(async ({ input }) => {
				return createProduct(input);
			}),
			update: adminProcedure
				.input(productUpdateSchema)
				.handler(async ({ input }) => updateProduct(input)),
		},
		customers: {
			list: adminProcedure.input(listQuerySchemaOptional).handler(async ({ input }) => {
				const query = input ?? {};
				return listCustomers({
					search: query.search,
					page: query.page ?? 1,
					pageSize: query.pageSize ?? 10,
				});
			}),
			create: adminProcedure.input(customerSchema).handler(async ({ input }) => {
				return createCustomer(input);
			}),
			update: adminProcedure
				.input(customerUpdateSchema)
				.handler(async ({ input }) => updateCustomer(input)),
		},
		licenses: {
			list: adminProcedure.input(licenseFilterSchema.optional()).handler(async ({ input }) => {
				const query = input ?? {};
				return listLicenses({
					search: query.search,
					page: query.page ?? 1,
					pageSize: query.pageSize ?? 10,
					status: query.status,
					type: query.type,
					expiringInDays: query.expiringInDays,
					activationsReached: query.activationsReached,
				});
			}),
			create: adminProcedure.input(licenseCreateSchema).handler(async ({ input }) => {
				return createLicense({
					productId: input.productId,
					customerId: input.customerId,
					type: input.type,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
					maxActivations: input.maxActivations,
					status: input.status,
				});
			}),
			update: adminProcedure.input(licenseUpdateSchema).handler(async ({ input }) => {
				return updateLicense({
					id: input.id,
					status: input.status,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
					maxActivations: input.maxActivations,
				});
			}),
			detail: adminProcedure.input(licenseIdSchema).handler(async ({ input }) => {
				return getLicenseDetail(input.licenseId);
			}),
		},
		machines: {
			revoke: adminProcedure
				.input(machineRevokeSchema)
				.handler(async ({ input }) => revokeMachine(input.machineId)),
			restore: adminProcedure
				.input(machineRestoreSchema)
				.handler(async ({ input }) => restoreMachine(input.machineId)),
		},
	},
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
