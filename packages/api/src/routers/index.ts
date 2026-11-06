import type { RouterClient } from "@orpc/server";
import { z } from "zod";
import {
	createCustomer,
	createLicense,
	createProduct,
	createProductFeature,
	deleteProduct,
	deleteProductFeature,
	getDashboardStats,
	getLicenseDetail,
	getProductDetail,
	listCustomers,
	listLicenses,
	listProductFeatures,
	listProducts,
	restoreMachine,
	revokeMachine,
	setLicenseFeature,
	updateCustomer,
	updateLicense,
	updateProduct,
	updateProductFeature,
} from "../admin-service";
import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
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
	companySlug: z.string().optional().or(z.literal("")).nullable(),
	companyName: z.string().optional().or(z.literal("")).nullable(),
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
	status: z
		.enum(["active", "suspended", "expired", "revoked"])
		.default("active"),
	features: z
		.array(
			z.object({
				featureId: z.string().min(1),
				enabled: z.boolean(),
			}),
		)
		.max(500)
		.optional(),
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

const featureKeySchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/,
		"Use lowercase letters, digits and -_. separators",
	);

const productFeatureCreateSchema = z.object({
	productId: z.string().min(1),
	key: featureKeySchema,
	name: z.string().min(1),
	description: z.string().optional().or(z.literal("")).nullable(),
	enabledByDefault: z.boolean().default(false),
});

const productFeatureUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional().or(z.literal("")).nullable(),
	enabledByDefault: z.boolean(),
});

const productCreateSchema = productSchema.extend({
	features: z
		.array(
			z.object({
				key: featureKeySchema,
				name: z.string().min(1),
				description: z.string().optional().or(z.literal("")).nullable(),
				enabledByDefault: z.boolean().default(false),
			}),
		)
		.max(500)
		.optional()
		.refine(
			(features) =>
				!features ||
				new Set(features.map((feature) => feature.key)).size ===
					features.length,
			{ message: "Feature keys must be unique" },
		),
});

const licenseFeatureSetSchema = z.object({
	licenseId: z.string().min(1),
	featureId: z.string().min(1),
	// null removes the override: the license falls back to the product default.
	enabled: z.boolean().nullable(),
});

const licenseFilterSchema = listQuerySchema.extend({
	status: z.enum(["active", "suspended", "expired", "revoked"]).optional(),
	type: z.enum(["trial", "monthly", "yearly", "lifetime"]).optional(),
	expiringInDays: z.number().int().positive().optional(),
	activationsReached: z.boolean().optional(),
	productId: z.string().min(1).optional(),
});

export const appRouter = {
	healthCheck: publicProcedure
		.route({ method: "GET", path: "/health" })
		.handler(() => {
			return "OK";
		}),
	privateData: protectedProcedure
		.route({ method: "GET", path: "/private-data" })
		.handler(({ context }) => {
			return {
				message: "This is private",
				user: context.session?.user,
			};
		}),
	licenses: {
		publicKey: publicProcedure
			.route({ method: "GET", path: "/licenses/public-key" })
			.handler(() => ({
				algorithm: "Ed25519",
				publicKey: getLicenseTokenPublicKeyPem(),
			})),
		activate: publicProcedure
			.route({ method: "POST", path: "/licenses/activate" })
			.input(licenseInputSchema)
			.handler(async ({ input, context }) => {
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
		validate: publicProcedure
			.route({ method: "POST", path: "/licenses/validate" })
			.input(licenseInputSchema)
			.handler(async ({ input, context }) => {
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
		deactivate: publicProcedure
			.route({ method: "POST", path: "/licenses/deactivate" })
			.input(licenseInputSchema)
			.handler(async ({ input, context }) => {
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
		me: adminProcedure
			.route({ method: "GET", path: "/admin/me" })
			.handler(({ context }) => {
				return {
					user: context.session?.user,
				};
			}),
		dashboard: {
			stats: adminProcedure
				.route({ method: "GET", path: "/admin/dashboard/stats" })
				.handler(() => getDashboardStats()),
		},
		products: {
			list: adminProcedure
				.route({ method: "POST", path: "/admin/products/list" })
				.input(listQuerySchemaOptional)
				.handler(async ({ input }) => {
					const query = input ?? {};
					return listProducts({
						search: query.search,
						page: query.page ?? 1,
						pageSize: query.pageSize ?? 10,
					});
				}),
			create: adminProcedure
				.route({ method: "POST", path: "/admin/products/create" })
				.input(productCreateSchema)
				.handler(async ({ input }) => {
					return createProduct(input);
				}),
			update: adminProcedure
				.route({ method: "POST", path: "/admin/products/update" })
				.input(productUpdateSchema)
				.handler(async ({ input }) => updateProduct(input)),
			detail: adminProcedure
				.route({ method: "POST", path: "/admin/products/detail" })
				.input(z.object({ productId: z.string().min(1) }))
				.handler(async ({ input }) => getProductDetail(input.productId)),
			delete: adminProcedure
				.route({ method: "POST", path: "/admin/products/delete" })
				.input(z.object({ id: z.string().min(1) }))
				.handler(async ({ input }) => deleteProduct(input.id)),
			features: {
				list: adminProcedure
					.route({ method: "POST", path: "/admin/products/features/list" })
					.input(z.object({ productId: z.string().min(1) }))
					.handler(async ({ input }) => listProductFeatures(input.productId)),
				create: adminProcedure
					.route({ method: "POST", path: "/admin/products/features/create" })
					.input(productFeatureCreateSchema)
					.handler(async ({ input }) => createProductFeature(input)),
				update: adminProcedure
					.route({ method: "POST", path: "/admin/products/features/update" })
					.input(productFeatureUpdateSchema)
					.handler(async ({ input }) => updateProductFeature(input)),
				delete: adminProcedure
					.route({ method: "POST", path: "/admin/products/features/delete" })
					.input(z.object({ id: z.string().min(1) }))
					.handler(async ({ input }) => deleteProductFeature(input.id)),
			},
		},
		customers: {
			list: adminProcedure
				.route({ method: "POST", path: "/admin/customers/list" })
				.input(listQuerySchemaOptional)
				.handler(async ({ input }) => {
					const query = input ?? {};
					return listCustomers({
						search: query.search,
						page: query.page ?? 1,
						pageSize: query.pageSize ?? 10,
					});
				}),
			create: adminProcedure
				.route({ method: "POST", path: "/admin/customers/create" })
				.input(customerSchema)
				.handler(async ({ input }) => {
					return createCustomer(input);
				}),
			update: adminProcedure
				.route({ method: "POST", path: "/admin/customers/update" })
				.input(customerUpdateSchema)
				.handler(async ({ input }) => updateCustomer(input)),
		},
		licenses: {
			list: adminProcedure
				.route({ method: "POST", path: "/admin/licenses/list" })
				.input(licenseFilterSchema.optional())
				.handler(async ({ input }) => {
					const query = input ?? {};
					return listLicenses({
						search: query.search,
						page: query.page ?? 1,
						pageSize: query.pageSize ?? 10,
						status: query.status,
						type: query.type,
						expiringInDays: query.expiringInDays,
						activationsReached: query.activationsReached,
						productId: query.productId,
					});
				}),
			create: adminProcedure
				.route({ method: "POST", path: "/admin/licenses/create" })
				.input(licenseCreateSchema)
				.handler(async ({ input }) => {
					return createLicense({
						productId: input.productId,
						customerId: input.customerId,
						type: input.type,
						expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
						maxActivations: input.maxActivations,
						status: input.status,
						features: input.features,
					});
				}),
			update: adminProcedure
				.route({ method: "POST", path: "/admin/licenses/update" })
				.input(licenseUpdateSchema)
				.handler(async ({ input }) => {
					return updateLicense({
						id: input.id,
						status: input.status,
						expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
						maxActivations: input.maxActivations,
					});
				}),
			detail: adminProcedure
				.route({ method: "POST", path: "/admin/licenses/detail" })
				.input(licenseIdSchema)
				.handler(async ({ input }) => {
					return getLicenseDetail(input.licenseId);
				}),
			setFeature: adminProcedure
				.route({ method: "POST", path: "/admin/licenses/set-feature" })
				.input(licenseFeatureSetSchema)
				.handler(async ({ input }) => setLicenseFeature(input)),
		},
		machines: {
			revoke: adminProcedure
				.route({ method: "POST", path: "/admin/machines/revoke" })
				.input(machineRevokeSchema)
				.handler(async ({ input }) => revokeMachine(input.machineId)),
			restore: adminProcedure
				.route({ method: "POST", path: "/admin/machines/restore" })
				.input(machineRestoreSchema)
				.handler(async ({ input }) => restoreMachine(input.machineId)),
		},
	},
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
