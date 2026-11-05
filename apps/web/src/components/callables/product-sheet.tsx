import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createCallable } from "react-call";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
			},
		});

		const form = useForm({
			defaultValues: {
				name: initialValues?.name ?? "",
				slug: initialValues?.slug ?? "",
				defaultMaxActivations: initialValues?.defaultMaxActivations ?? 1,
			},
			validators: {
				onSubmit: z.object({
					name: z.string().min(1),
					slug: z.string().min(1),
					defaultMaxActivations: z.number().int().positive(),
				}),
			},
			onSubmit: async ({ value }) => {
				try {
					if (initialValues) {
						const updated = await updateMutation.mutateAsync({
							id: initialValues.id,
							...value,
						});
						toast.success("Product updated");
						call.end(updated ?? null);
					} else {
						const created = await createMutation.mutateAsync(value);
						toast.success("Product created");
						call.end(created ?? null);
					}
				} catch (error) {
					toast.error(
						error instanceof Error ? error.message : "Failed to save product",
					);
				}
			},
		});

		return (
			<Sheet
				open={!call.ended}
				onOpenChange={(open) => {
					if (!open) {
						call.end(null);
					}
				}}
			>
				<SheetContent>
					<SheetHeader>
						<SheetTitle>
							{isEdit ? "Edit product" : "Create product"}
						</SheetTitle>
						<SheetDescription>
							Manage product details used for licenses.
						</SheetDescription>
					</SheetHeader>
					<form
						className="grid gap-4 p-4"
						onSubmit={(event) => {
							event.preventDefault();
							event.stopPropagation();
							form.handleSubmit();
						}}
					>
						<form.Field name="name">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={`${call.key}-name`}>Name</Label>
									<Input
										id={`${call.key}-name`}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="slug">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={`${call.key}-slug`}>Slug</Label>
									<Input
										id={`${call.key}-slug`}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="defaultMaxActivations">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={`${call.key}-max`}>Default activations</Label>
									<Input
										id={`${call.key}-max`}
										type="number"
										min={1}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) =>
											field.handleChange(Number(event.target.value || 1))
										}
									/>
								</div>
							)}
						</form.Field>
						<SheetFooter>
							<form.Subscribe>
								{(state) => (
									<Button
										type="submit"
										disabled={!state.canSubmit || state.isSubmitting}
									>
										{state.isSubmitting ? "Saving..." : "Save"}
									</Button>
								)}
							</form.Subscribe>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		);
	},
	UNMOUNT_DELAY,
);
