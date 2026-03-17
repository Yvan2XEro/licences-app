import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DataTable } from "@/components/data-table";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export const Route = createFileRoute("/dashboard/products")({
	component: RouteComponent,
});

type ProductRow = {
	id: string;
	name: string;
	slug: string;
	defaultMaxActivations: number;
};

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [createOpen, setCreateOpen] = useState(false);
	const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearch(search.trim());
		}, 250);
		return () => clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		setPage(1);
	}, [debouncedSearch]);

	const productsQuery = useQuery(
		orpc.admin.products.list.queryOptions({
			search: debouncedSearch || undefined,
			page,
			pageSize,
		}),
	);

	const isTableLoading = productsQuery.isLoading;
	const isTableFetching = productsQuery.isFetching;
	const total = productsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const columns = useMemo<ColumnDef<ProductRow>[]>(
		() => [
			{
				header: "Name",
				accessorKey: "name",
			},
			{
				header: "Slug",
				accessorKey: "slug",
				cell: ({ row }) => (
					<ClipboardCopy value={row.original.slug} label="slug" />
				),
			},
			{
				header: "Default activations",
				accessorKey: "defaultMaxActivations",
			},
			{
				header: "Actions",
				enableSorting: false,
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditingProduct(row.original)}
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
							placeholder="Search products..."
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="md:w-64"
						/>
					</div>
					<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
						<Button onClick={() => setCreateOpen(true)}>New product</Button>
					</div>
				</div>
				<Separator className="my-4" />
				{productsQuery.isError && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						Failed to load products.{" "}
						<Button variant="ghost" size="sm" onClick={() => productsQuery.refetch()}>
							Retry
						</Button>
					</div>
				)}
				<DataTable
					columns={columns}
					data={productsQuery.data?.items ?? []}
					isLoading={isTableLoading}
					isFetching={isTableFetching}
					emptyMessage="No products found."
					emptyState={
						<div className="flex flex-col items-center gap-3">
							<div>No products yet.</div>
							<Button size="sm" onClick={() => setCreateOpen(true)}>
								Create product
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

			<ProductSheet
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
			<ProductSheet
				key={editingProduct?.id ?? "edit"}
				mode="edit"
				open={Boolean(editingProduct)}
				onOpenChange={(open) => {
					if (!open) {
						setEditingProduct(null);
					}
				}}
				initialValues={editingProduct ?? undefined}
			/>
		</div>
	);
}

function ProductSheet({
	mode,
	open,
	onOpenChange,
	initialValues,
}: {
	mode: "create" | "edit";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialValues?: ProductRow;
}) {
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
		onSubmit: async ({ value, formApi }) => {
			try {
				if (mode === "create") {
					await createMutation.mutateAsync(value);
					toast.success("Product created");
					formApi.reset();
				} else if (initialValues) {
					await updateMutation.mutateAsync({
						id: initialValues.id,
						...value,
					});
					toast.success("Product updated");
				}
				onOpenChange(false);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Failed to save product");
			}
		},
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>
						{mode === "create" ? "Create product" : "Edit product"}
					</SheetTitle>
					<SheetDescription>Manage product details used for licenses.</SheetDescription>
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
					<form.Field name="slug">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`${mode}-slug`}>Slug</Label>
								<Input
									id={`${mode}-slug`}
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
								<Label htmlFor={`${mode}-max`}>Default activations</Label>
								<Input
									id={`${mode}-max`}
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
