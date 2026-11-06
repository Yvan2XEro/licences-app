CREATE TABLE "license_feature" (
	"license_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "license_feature_license_id_feature_id_pk" PRIMARY KEY("license_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "product_feature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled_by_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "license_feature" ADD CONSTRAINT "license_feature_license_id_license_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_feature" ADD CONSTRAINT "license_feature_feature_id_product_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."product_feature"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feature" ADD CONSTRAINT "product_feature_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "license_feature_license_id_idx" ON "license_feature" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "product_feature_product_id_idx" ON "product_feature" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_feature_product_key_unique" ON "product_feature" USING btree ("product_id","key");