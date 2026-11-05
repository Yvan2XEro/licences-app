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

export type Customer = {
	id: string;
	name: string;
	email: string | null;
	companySlug: string | null;
	companyName: string | null;
	phone: string | null;
	address: string | null;
	createdAt: Date;
};

interface Props {
	initialValues?: Customer;
}

const UNMOUNT_DELAY = 200;

const fields = [
	{ name: "name", label: "Name" },
	{ name: "email", label: "Email (optional)", type: "email" },
	{ name: "companyName", label: "Company name (optional)" },
	{ name: "companySlug", label: "Company slug (optional)" },
	{ name: "phone", label: "Phone (optional)" },
	{ name: "address", label: "Address (optional)" },
] as const;

export const CustomerSheet = createCallable<Props, Customer | null>(
	({ call, initialValues }) => {
		const isEdit = Boolean(initialValues);

		const createMutation = useMutation({
			...orpc.admin.customers.create.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.customers.list.queryKey(),
				});
			},
		});
		const updateMutation = useMutation({
			...orpc.admin.customers.update.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.customers.list.queryKey(),
				});
			},
		});

		const form = useForm({
			defaultValues: {
				name: initialValues?.name ?? "",
				email: initialValues?.email ?? "",
				companySlug: initialValues?.companySlug ?? "",
				companyName: initialValues?.companyName ?? "",
				phone: initialValues?.phone ?? "",
				address: initialValues?.address ?? "",
			},
			validators: {
				onSubmit: z.object({
					name: z.string().min(1),
					email: z.union([z.string().email(), z.literal("")]),
					companySlug: z.string(),
					companyName: z.string(),
					phone: z.string(),
					address: z.string(),
				}),
			},
			onSubmit: async ({ value }) => {
				try {
					const payload = {
						name: value.name,
						email: value.email || null,
						companySlug: value.companySlug || null,
						companyName: value.companyName || null,
						phone: value.phone || null,
						address: value.address || null,
					};
					if (initialValues) {
						const updated = await updateMutation.mutateAsync({
							id: initialValues.id,
							...payload,
						});
						toast.success("Customer updated");
						call.end(updated ?? null);
					} else {
						const created = await createMutation.mutateAsync(payload);
						toast.success("Customer created");
						call.end(created ?? null);
					}
				} catch (error) {
					toast.error(
						error instanceof Error ? error.message : "Failed to save customer",
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
							{isEdit ? "Edit customer" : "Create customer"}
						</SheetTitle>
						<SheetDescription>
							Store contact information for licenses.
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
						{fields.map(({ name, label, ...inputProps }) => (
							<form.Field key={name} name={name}>
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={`${call.key}-${name}`}>{label}</Label>
										<Input
											id={`${call.key}-${name}`}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											{...inputProps}
										/>
									</div>
								)}
							</form.Field>
						))}
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
