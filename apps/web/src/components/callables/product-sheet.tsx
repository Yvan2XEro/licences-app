import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { createCallable } from "react-call";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ProductFeaturesManager } from "@/components/product-features-manager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { orpc, queryClient } from "@/utils/orpc";

export type Product = {
	id: string;
	name: string;
	slug: string;
	defaultMaxActivations: number;
	createdAt: Date;
};

interface Props {
	initialValues?: Product;
}

const UNMOUNT_DELAY = 200;

const featureItemSchema = z.object({
	key: z
		.string()
		.min(1, "Required")
		.regex(
			/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/,
			"Lowercase letters, digits and -_. only",
		),
	name: z.string().min(1, "Required"),
	enabledByDefault: z.boolean(),
});

const productFormSchema = z.object({
	name: z.string().min(1, "Required"),
	slug: z.string().min(1, "Required"),
	defaultMaxActivations: z
		.number({ message: "Must be a number" })
		.int()
		.positive(),
	features: z.array(featureItemSchema).superRefine((features, ctx) => {
		const seen = new Set<string>();
		features.forEach((feature, index) => {
			if (seen.has(feature.key)) {
				ctx.addIssue({
					code: "custom",
					message: "Duplicate key",
					path: [index, "key"],
				});
			}
			seen.add(feature.key);
		});
	}),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

export const ProductSheet = createCallable<Props, Product | null>(
	({ call, initialValues }) => {
		const isEdit = Boolean(initialValues);

		const createMutation = useMutation({
			...orpc.admin.products.create.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.products.list.queryKey(),
				});
			},
		});
		const updateMutation = useMutation({
			...orpc.admin.products.update.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.products.list.queryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.admin.products.detail.key(),
				});
			},
		});

		const form = useForm<ProductFormValues>({
			resolver: standardSchemaResolver(productFormSchema),
			defaultValues: {
				name: initialValues?.name ?? "",
				slug: initialValues?.slug ?? "",
				defaultMaxActivations: initialValues?.defaultMaxActivations ?? 1,
				features: [],
			},
		});
		const featureFields = useFieldArray({
			control: form.control,
			name: "features",
		});
		const { errors, isSubmitting } = form.formState;

		const onSubmit = async (values: ProductFormValues) => {
			try {
				if (initialValues) {
					const updated = await updateMutation.mutateAsync({
						id: initialValues.id,
						name: values.name,
						slug: values.slug,
						defaultMaxActivations: values.defaultMaxActivations,
					});
					toast.success("Product updated");
					call.end(updated ?? null);
				} else {
					const created = await createMutation.mutateAsync({
						name: values.name,
						slug: values.slug,
						defaultMaxActivations: values.defaultMaxActivations,
						features: values.features,
					});
					toast.success("Product created");
					call.end(created ?? null);
				}
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to save product",
				);
			}
		};

		return (
			<Sheet
				open={!call.ended}
				onOpenChange={(open) => {
					if (!open) {
						call.end(null);
					}
				}}
			>
				<SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-xl">
					<SheetHeader>
						<SheetTitle>
							{isEdit ? "Edit product" : "Create product"}
						</SheetTitle>
						<SheetDescription>
							{isEdit
								? "Manage product details and its feature catalog."
								: "Define the product and declare its features in one go."}
						</SheetDescription>
					</SheetHeader>
					<form
						className="grid gap-4 p-4"
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<div className="space-y-2">
							<Label htmlFor={`${call.key}-name`}>Name</Label>
							<Input id={`${call.key}-name`} {...form.register("name")} />
							{errors.name && (
								<p className="text-destructive text-xs">
									{errors.name.message}
								</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${call.key}-slug`}>Slug</Label>
							<Input id={`${call.key}-slug`} {...form.register("slug")} />
							{errors.slug && (
								<p className="text-destructive text-xs">
									{errors.slug.message}
								</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${call.key}-max`}>Default activations</Label>
							<Input
								id={`${call.key}-max`}
								type="number"
								min={1}
								{...form.register("defaultMaxActivations", {
									valueAsNumber: true,
								})}
							/>
							{errors.defaultMaxActivations && (
								<p className="text-destructive text-xs">
									{errors.defaultMaxActivations.message}
								</p>
							)}
						</div>

						{!isEdit && (
							<div className="space-y-3">
								<Separator />
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-sm">Features</div>
										<p className="text-muted-foreground text-xs">
											Declared with the product; licenses can then enable or
											disable each one.
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											featureFields.append({
												key: "",
												name: "",
												enabledByDefault: false,
											})
										}
									>
										<PlusIcon />
										Add
									</Button>
								</div>
								{featureFields.fields.length === 0 && (
									<p className="text-muted-foreground text-xs">
										No features yet — you can also add them later from the
										product page.
									</p>
								)}
								{featureFields.fields.map((field, index) => {
									const fieldErrors = errors.features?.[index];
									return (
										<div key={field.id} className="rounded-md border p-2">
											<div className="flex flex-wrap items-start gap-2">
												<div className="w-40">
													<Input
														placeholder="key"
														aria-label={`Feature ${index + 1} key`}
														className="h-8 font-mono"
														{...form.register(`features.${index}.key`)}
													/>
													{fieldErrors?.key && (
														<p className="mt-1 text-destructive text-xs">
															{fieldErrors.key.message}
														</p>
													)}
												</div>
												<div className="min-w-36 flex-1">
													<Input
														placeholder="Name"
														aria-label={`Feature ${index + 1} name`}
														className="h-8"
														{...form.register(`features.${index}.name`)}
													/>
													{fieldErrors?.name && (
														<p className="mt-1 text-destructive text-xs">
															{fieldErrors.name.message}
														</p>
													)}
												</div>
												<label className="flex h-8 cursor-pointer items-center gap-2 text-sm">
													<Checkbox
														checked={form.watch(
															`features.${index}.enabledByDefault`,
														)}
														onCheckedChange={(checked) =>
															form.setValue(
																`features.${index}.enabledByDefault`,
																Boolean(checked),
															)
														}
													/>
													<span>Default</span>
												</label>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													aria-label={`Remove feature ${index + 1}`}
													onClick={() => featureFields.remove(index)}
												>
													<Trash2Icon />
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						)}

						<SheetFooter className="px-0">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Saving..." : "Save"}
							</Button>
						</SheetFooter>
					</form>

					{isEdit && initialValues && (
						<div className="space-y-3 border-t p-4">
							<div>
								<div className="font-medium text-sm">Features</div>
								<p className="text-muted-foreground text-xs">
									Changes apply immediately to the product catalog.
								</p>
							</div>
							<ProductFeaturesManager
								productId={initialValues.id}
								maxHeight="300px"
							/>
						</div>
					)}
				</SheetContent>
			</Sheet>
		);
	},
	UNMOUNT_DELAY,
);
