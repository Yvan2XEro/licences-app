import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const licenseStatusEnum = pgEnum("license_status", [
	"active",
	"suspended",
	"expired",
	"revoked",
]);

export const licenseTypeEnum = pgEnum("license_type", [
	"trial",
	"monthly",
	"yearly",
	"lifetime",
]);

export const activationEventTypeEnum = pgEnum("activation_event_type", [
	"activate",
	"validate",
	"deactivate",
	"blocked",
]);

export const product = pgTable("product", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	defaultMaxActivations: integer("default_max_activations").notNull().default(1),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customer = pgTable("customer", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: text("email").unique(),
	name: text("name").notNull(),
	companySlug: text("company_slug"),
	companyName: text("company_name"),
	phone: text("phone"),
	address: text("address"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const license = pgTable(
	"license",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		key: text("key").notNull().unique(),
		keyHash: text("key_hash").notNull().unique(),
		status: licenseStatusEnum("status").notNull().default("active"),
		type: licenseTypeEnum("type").notNull(),
		expiresAt: timestamp("expires_at"),
		maxActivations: integer("max_activations"),
		productId: uuid("product_id")
			.notNull()
			.references(() => product.id, { onDelete: "cascade" }),
		customerId: uuid("customer_id")
			.notNull()
			.references(() => customer.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("license_product_id_idx").on(table.productId),
		index("license_customer_id_idx").on(table.customerId),
	],
);

export const machine = pgTable(
	"machine",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		licenseId: uuid("license_id")
			.notNull()
			.references(() => license.id, { onDelete: "cascade" }),
		fingerprint: text("fingerprint").notNull(),
		activatedAt: timestamp("activated_at").defaultNow().notNull(),
		lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		index("machine_license_id_idx").on(table.licenseId),
		index("machine_fingerprint_idx").on(table.fingerprint),
		uniqueIndex("machine_license_fingerprint_unique").on(
			table.licenseId,
			table.fingerprint,
		),
	],
);

export const activationLog = pgTable(
	"activation_log",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		licenseId: uuid("license_id").references(() => license.id, {
			onDelete: "cascade",
		}),
		machineId: uuid("machine_id").references(() => machine.id, {
			onDelete: "set null",
		}),
		ip: text("ip").notNull(),
		userAgent: text("user_agent"),
		eventType: activationEventTypeEnum("event_type").notNull(),
		reason: text("reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("activation_log_license_id_idx").on(table.licenseId)],
);

export const productRelations = relations(product, ({ many }) => ({
	licenses: many(license),
}));

export const customerRelations = relations(customer, ({ many }) => ({
	licenses: many(license),
}));

export const licenseRelations = relations(license, ({ many, one }) => ({
	product: one(product, {
		fields: [license.productId],
		references: [product.id],
	}),
	customer: one(customer, {
		fields: [license.customerId],
		references: [customer.id],
	}),
	machines: many(machine),
	activationLogs: many(activationLog),
}));

export const machineRelations = relations(machine, ({ one, many }) => ({
	license: one(license, {
		fields: [machine.licenseId],
		references: [license.id],
	}),
	activationLogs: many(activationLog),
}));

export const activationLogRelations = relations(activationLog, ({ one }) => ({
	license: one(license, {
		fields: [activationLog.licenseId],
		references: [license.id],
	}),
	machine: one(machine, {
		fields: [activationLog.machineId],
		references: [machine.id],
	}),
}));
