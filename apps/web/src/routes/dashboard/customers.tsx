import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
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

export const Route = createFileRoute("/dashboard/customers")({
	component: RouteComponent,
});

type CustomerRow = {
	id: string;
	name: string;
	email: string | null;
	companySlug: string | null;
	companyName: string | null;
	phone: string | null;
	address: string | null;
};

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [createOpen, setCreateOpen] = useState(false);
	const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearch(search.trim());
		}, 250);
		return () => clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		setPage(1);
	}, [debouncedSearch]);

	const customersQuery = useQuery(
		orpc.admin.customers.list.queryOptions({
			search: debouncedSearch || undefined,
			page,
			pageSize,
		}),
	);

	const isTableLoading = customersQuery.isLoading;
	const isTableFetching = customersQuery.isFetching;
	const total = customersQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const columns = useMemo<ColumnDef<CustomerRow>[]>(
		() => [
			{
				header: "Name",
				accessorKey: "name",
			},
			{
				header: "Email",
				accessorKey: "email",
				cell: ({ row }) =>
					row.original.email ? (
						<ClipboardCopy value={row.original.email} label="email" />
					) : (
						"—"
					),
			},
			{
				header: "Company",
				accessorFn: (row) => row.companyName ?? row.companySlug ?? "",
				cell: ({ row }) => {
					const { companyName, companySlug } = row.original;
					if (!companyName && !companySlug) {
						return "—";
					}
					return (
						<div className="space-y-1">
							<div>{companyName ?? "—"}</div>
							{companySlug && (
								<div className="text-xs text-muted-foreground">{companySlug}</div>
							)}
						</div>
					);
				},
			},
			{
				header: "Phone",
				accessorKey: "phone",
				cell: ({ row }) =>
					row.original.phone ? (
						<ClipboardCopy value={row.original.phone} label="phone" />
					) : (
						"—"
					),
			},
			{
				header: "Address",
				accessorKey: "address",
				cell: ({ row }) => row.original.address ?? "—",
			},
			{
				header: "Actions",
				enableSorting: false,
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditingCustomer(row.original)}
					>
						Edit
					</Button>
				),
			},
		],
		[],
	);

	return (
		<div className="space-y-6">
			<Card className="p-6">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
						<Input
							placeholder="Search customers..."
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="md:w-64"
						/>
					</div>
					<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
						<Button onClick={() => setCreateOpen(true)}>New customer</Button>
					</div>
				</div>
				<Separator className="my-4" />
				{customersQuery.isError && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						Failed to load customers.{" "}
						<Button variant="ghost" size="sm" onClick={() => customersQuery.refetch()}>
							Retry
						</Button>
					</div>
				)}
				<DataTable
					columns={columns}
					data={customersQuery.data?.items ?? []}
					isLoading={isTableLoading}
					isFetching={isTableFetching}
					emptyMessage="No customers found."
					emptyState={
						<div className="flex flex-col items-center gap-3">
							<div>No customers yet.</div>
							<Button size="sm" onClick={() => setCreateOpen(true)}>
								Create customer
							</Button>
						</div>
					}
					maxHeight="520px"
					stickyHeader
				/>
				<div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">
						{isTableLoading ? "Loading..." : `Page ${page} of ${totalPages} • ${total} total`}
					</span>
					<div className="flex items-center gap-2">
						<Label className="text-xs text-muted-foreground">Rows</Label>
						<select
							className="rounded-md border bg-background px-2 py-1 text-xs"
							value={pageSize}
							onChange={(event) => {
								setPageSize(Number(event.target.value));
								setPage(1);
							}}
						>
							<option value={10}>10</option>
							<option value={20}>20</option>
							<option value={50}>50</option>
						</select>
					</div>
					<div className="flex items-center gap-2">
						<Label className="text-xs text-muted-foreground">Go to</Label>
						<Input
							className="h-8 w-20 text-xs"
							type="number"
							min={1}
							max={totalPages}
							value={page}
							onChange={(event) => {
								const next = Number(event.target.value);
								if (!Number.isNaN(next)) {
									setPage(Math.min(Math.max(1, next), totalPages));
								}
							}}
							disabled={isTableLoading}
						/>
					</div>
					<div className="ml-auto flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={isTableLoading || page <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={isTableLoading || page >= totalPages}
							onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
						>
							Next
						</Button>
					</div>
				</div>
			</Card>

			<CustomerSheet
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
			<CustomerSheet
				key={editingCustomer?.id ?? "edit"}
				mode="edit"
				open={Boolean(editingCustomer)}
				onOpenChange={(open) => {
					if (!open) {
						setEditingCustomer(null);
					}
				}}
				initialValues={editingCustomer ?? undefined}
			/>
		</div>
	);
}

function CustomerSheet({
	mode,
	open,
	onOpenChange,
	initialValues,
}: {
	mode: "create" | "edit";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialValues?: CustomerRow;
}) {
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
		onSubmit: async ({ value, formApi }) => {
			try {
				const payload = {
					name: value.name,
					email: value.email || null,
					companySlug: value.companySlug || null,
					companyName: value.companyName || null,
					phone: value.phone || null,
					address: value.address || null,
				};
				if (mode === "create") {
					await createMutation.mutateAsync(payload);
					toast.success("Customer created");
					formApi.reset();
				} else if (initialValues) {
					await updateMutation.mutateAsync({
						id: initialValues.id,
						...payload,
					});
					toast.success("Customer updated");
				}
				onOpenChange(false);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Failed to save customer");
			}
		},
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>
						{mode === "create" ? "Create customer" : "Edit customer"}
					</SheetTitle>
					<SheetDescription>Store contact information for licenses.</SheetDescription>
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
								<Label htmlFor={`${mode}-name`}>Name</Label>
								<Input
									id={`${mode}-name`}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`${mode}-email`}>Email (optional)</Label>
								<Input
									id={`${mode}-email`}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="companyName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`${mode}-company-name`}>Company name (optional)</Label>
								<Input
									id={`${mode}-company-name`}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="companySlug">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`${mode}-company-slug`}>Company slug (optional)</Label>
								<Input
									id={`${mode}-company-slug`}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="phone">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`${mode}-phone`}>Phone (optional)</Label>
								<Input
									id={`${mode}-phone`}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="address">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`${mode}-address`}>Address (optional)</Label>
								<Input
									id={`${mode}-address`}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<SheetFooter>
						<form.Subscribe>
							{(state) => (
								<Button type="submit" disabled={!state.canSubmit || state.isSubmitting}>
									{state.isSubmitting ? "Saving..." : "Save"}
								</Button>
							)}
						</form.Subscribe>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
