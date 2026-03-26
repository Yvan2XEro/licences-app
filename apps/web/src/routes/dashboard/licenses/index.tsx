import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Combobox,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/licenses/")({
	component: RouteComponent,
});

type LicenseRow = {
	license: {
		id: string;
		key: string;
		status: "active" | "suspended" | "expired" | "revoked";
		type: string;
		expiresAt: Date | null;
		maxActivations: number | null;
	};
	productSlug: string;
	productName: string;
	customerEmail: string | null;
	customerName: string;
	customerCompanySlug: string | null;
	customerCompanyName: string | null;
	customerPhone: string | null;
};

type LicenseFormValues = {
	productId: string;
	customerId: string;
	type: "trial" | "monthly" | "yearly" | "lifetime";
	expiresAt: string;
	maxActivations: string;
	status: "active" | "suspended" | "expired" | "revoked";
};

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const statusBadge: Record<LicenseFormValues["status"], string> = {
	active: "bg-emerald-100 text-emerald-700",
	suspended: "bg-amber-100 text-amber-700",
	expired: "bg-slate-200 text-slate-700",
	revoked: "bg-rose-100 text-rose-700",
};

const typeBadge: Record<LicenseFormValues["type"], string> = {
	trial: "bg-blue-100 text-blue-700",
	monthly: "bg-indigo-100 text-indigo-700",
	yearly: "bg-purple-100 text-purple-700",
	lifetime: "bg-teal-100 text-teal-700",
};

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [createOpen, setCreateOpen] = useState(false);
	const [editingLicense, setEditingLicense] = useState<LicenseRow | null>(null);
	const [statusFilter, setStatusFilter] = useState<LicenseFormValues["status"] | "">("");
	const [typeFilter, setTypeFilter] = useState<LicenseFormValues["type"] | "">("");
	const [expiringInDays, setExpiringInDays] = useState("");
	const [activationsReached, setActivationsReached] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearch(search.trim());
		}, 250);
		return () => clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		setPage(1);
	}, [debouncedSearch, statusFilter, typeFilter, expiringInDays, activationsReached, pageSize]);

	const productsQuery = useQuery(
		orpc.admin.products.list.queryOptions({ page: 1, pageSize: 200 }),
	);
	const customersQuery = useQuery(
		orpc.admin.customers.list.queryOptions({ page: 1, pageSize: 200 }),
	);
	const licenseQueryInput = useMemo(
		() => ({
			search: debouncedSearch || undefined,
			page,
			pageSize,
			status: statusFilter || undefined,
			type: typeFilter || undefined,
			expiringInDays: expiringInDays ? Number.parseInt(expiringInDays, 10) : undefined,
			activationsReached: activationsReached || undefined,
		}),
		[
			debouncedSearch,
			page,
			pageSize,
			statusFilter,
			typeFilter,
			expiringInDays,
			activationsReached,
		],
	);

	const licensesQuery = useQuery(orpc.admin.licenses.list.queryOptions(licenseQueryInput));

	const isTableLoading = licensesQuery.isLoading;
	const isTableFetching = licensesQuery.isFetching;
	const total = licensesQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const columns = useMemo<ColumnDef<LicenseRow>[]>(
		() => [
			{
				header: "Key",
				accessorFn: (row) => row.license.key,
				cell: ({ row }) => (
					<div className="space-y-1">
						<ClipboardCopy value={row.original.license.key} label="license key" />
						<div className="text-xs text-muted-foreground">
							{row.original.productName}
						</div>
					</div>
				),
			},
			{
				header: "Customer",
				accessorFn: (row) => row.customerName,
				cell: ({ row }) => (
					<div className="space-y-1">
						<div className="text-sm font-medium">{row.original.customerName}</div>
						{(row.original.customerCompanyName || row.original.customerCompanySlug) && (
							<div className="text-xs text-muted-foreground">
								{row.original.customerCompanyName ?? "—"}
								{row.original.customerCompanySlug
									? ` • ${row.original.customerCompanySlug}`
									: ""}
							</div>
						)}
						{row.original.customerEmail && (
							<ClipboardCopy value={row.original.customerEmail} label="email" />
						)}
						{row.original.customerPhone && (
							<ClipboardCopy value={row.original.customerPhone} label="phone" />
						)}
					</div>
				),
			},
			{
				header: "Status",
				accessorFn: (row) => row.license.status,
				cell: ({ row }) => (
					<span className={cn(badgeBase, statusBadge[row.original.license.status])}>
						{row.original.license.status}
					</span>
				),
			},
			{
				header: "Type",
				accessorFn: (row) => row.license.type,
				cell: ({ row }) => (
					<span className={cn(badgeBase, typeBadge[row.original.license.type as LicenseFormValues["type"]])}>
						{row.original.license.type}
					</span>
				),
			},
			{
				header: "Expires",
				accessorFn: (row) => row.license.expiresAt ?? "",
				cell: ({ row }) =>
					row.original.license.expiresAt
						? new Date(row.original.license.expiresAt).toLocaleDateString()
						: "Never",
			},
			{
				header: "Actions",
				enableSorting: false,
				cell: ({ row }) => (
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditingLicense(row.original)}
						>
							Edit
						</Button>
						<Link
							to="/dashboard/licenses/$licenseId"
							params={{ licenseId: row.original.license.id }}
							className="text-sm font-medium text-primary underline-offset-4 hover:underline"
						>
							Details
						</Link>
					</div>
				),
			},
		],
		[],
	);

	return (
		<div className="space-y-6">
			<Card className="p-6">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="flex w-full flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
						<Input
							placeholder="Search licenses, customers, products..."
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="md:w-64"
						/>
							<select
								className="h-9 w-full rounded-md border bg-background px-2 text-sm md:w-36"
								value={statusFilter}
								onChange={(event) =>
									setStatusFilter(
										event.target.value as LicenseFormValues["status"] | "",
									)
								}
							>
							<option value="">Status</option>
							<option value="active">Active</option>
							<option value="suspended">Suspended</option>
							<option value="expired">Expired</option>
							<option value="revoked">Revoked</option>
						</select>
							<select
								className="h-9 w-full rounded-md border bg-background px-2 text-sm md:w-32"
								value={typeFilter}
								onChange={(event) =>
									setTypeFilter(event.target.value as LicenseFormValues["type"] | "")
								}
							>
							<option value="">Type</option>
							<option value="trial">Trial</option>
							<option value="monthly">Monthly</option>
							<option value="yearly">Yearly</option>
							<option value="lifetime">Lifetime</option>
						</select>
						<select
							className="h-9 w-full rounded-md border bg-background px-2 text-sm md:w-40"
							value={expiringInDays}
							onChange={(event) => setExpiringInDays(event.target.value)}
						>
							<option value="">Expiring</option>
							<option value="7">In 7 days</option>
							<option value="30">In 30 days</option>
							<option value="90">In 90 days</option>
						</select>
						<label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
							<Checkbox
								id="activations-reached"
								checked={activationsReached}
								onCheckedChange={(checked) => setActivationsReached(Boolean(checked))}
							/>
							<span>Activations reached</span>
						</label>
					</div>
					<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
						<Button onClick={() => setCreateOpen(true)}>New license</Button>
					</div>
				</div>
				<Separator className="my-4" />
				{licensesQuery.isError && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						Failed to load licenses.{" "}
						<Button variant="ghost" size="sm" onClick={() => licensesQuery.refetch()}>
							Retry
						</Button>
					</div>
				)}
				<DataTable
					columns={columns}
					data={licensesQuery.data?.items ?? []}
					isLoading={isTableLoading}
					isFetching={isTableFetching}
					emptyMessage="No licenses found."
					emptyState={
						<div className="flex flex-col items-center gap-3">
							<div>No licenses yet.</div>
							<Button size="sm" onClick={() => setCreateOpen(true)}>
								Create license
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

			<LicenseSheet
				mode="create"
				open={createOpen}
				onOpenChange={setCreateOpen}
				products={productsQuery.data?.items ?? []}
				customers={customersQuery.data?.items ?? []}
			/>
			<LicenseSheet
				key={editingLicense?.license.id ?? "edit"}
				mode="edit"
				open={Boolean(editingLicense)}
				onOpenChange={(open) => {
					if (!open) {
						setEditingLicense(null);
					}
				}}
				products={productsQuery.data?.items ?? []}
				customers={customersQuery.data?.items ?? []}
				initialValues={editingLicense ?? undefined}
			/>
		</div>
	);
}

function LicenseSheet({
	mode,
	open,
	onOpenChange,
	products,
	customers,
	initialValues,
}: {
	mode: "create" | "edit";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	products: { id: string; name: string }[];
	customers: {
		id: string;
		email: string | null;
		name: string;
		companySlug: string | null;
		companyName: string | null;
	}[];
	initialValues?: LicenseRow;
}) {
	const createMutation = useMutation({
		...orpc.admin.licenses.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.list.queryKey(),
			});
		},
	});
	const updateMutation = useMutation({
		...orpc.admin.licenses.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.list.queryKey(),
			});
		},
	});
	const navigate = useNavigate();
	const productOptions = products.map((item) => ({
		value: item.id,
		label: item.name,
	}));
	const customerOptions = customers.map((item) => ({
		value: item.id,
		label: item.companyName ?? item.name,
		description: [item.companySlug, item.email].filter(Boolean).join(" • "),
	}));
	const defaultValues: LicenseFormValues = {
		productId: "",
		customerId: "",
		type: "monthly",
		expiresAt: initialValues?.license.expiresAt
			? new Date(initialValues.license.expiresAt).toISOString().slice(0, 16)
			: "",
		maxActivations: initialValues?.license.maxActivations?.toString() ?? "",
		status: initialValues?.license.status ?? "active",
	};

		const form = useForm({
			defaultValues,
			onSubmit: async ({ value, formApi }) => {
			try {
				if (mode === "create") {
					await createMutation.mutateAsync({
						productId: value.productId,
						customerId: value.customerId,
						type: value.type,
						status: value.status,
						expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null,
						maxActivations: value.maxActivations
							? Number.parseInt(value.maxActivations, 10)
							: null,
					});
					toast.success("License created");
					formApi.reset();
				} else if (initialValues) {
					await updateMutation.mutateAsync({
						id: initialValues.license.id,
						status: value.status,
						expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null,
						maxActivations: value.maxActivations
							? Number.parseInt(value.maxActivations, 10)
							: null,
					});
					toast.success("License updated");
				}
				onOpenChange(false);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Failed to save license");
			}
		},
	});

	const isEdit = mode === "edit";
	const selectedProduct =
		productOptions.find((item) => item.value === form.state.values.productId) ?? null;
	const selectedCustomer =
		customerOptions.find((item) => item.value === form.state.values.customerId) ?? null;
	const [productQuery, setProductQuery] = useState(selectedProduct?.label ?? "");
	const [customerQuery, setCustomerQuery] = useState(selectedCustomer?.label ?? "");

	useEffect(() => {
		setProductQuery(selectedProduct?.label ?? "");
	}, [selectedProduct?.label]);

	useEffect(() => {
		setCustomerQuery(selectedCustomer?.label ?? "");
	}, [selectedCustomer?.label]);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>{isEdit ? "Edit license" : "Create license"}</SheetTitle>
					<SheetDescription>Manage license settings.</SheetDescription>
				</SheetHeader>
				<form
					className="grid gap-4 p-4"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					{!isEdit && (
						<>
							<form.Field name="productId">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="license-product">Product</Label>
										<Combobox
											items={productOptions}
											value={selectedProduct}
											onValueChange={(item) => {
												field.handleChange(item?.value ?? "");
												setProductQuery(item?.label ?? "");
											}}
											isItemEqualToValue={(a, b) => a.value === b.value}
											itemToStringLabel={(item) => item.label}
											itemToStringValue={(item) => item.value}
											inputValue={productQuery}
											onInputValueChange={setProductQuery}
										>
											<ComboboxInput placeholder="Select a product" />
											<ComboboxContent>
												<ComboboxEmpty>No products found.</ComboboxEmpty>
												<ComboboxList>
													<ComboboxCollection>
														{(item) => (
															<ComboboxItem key={item.value} value={item}>
																{item.label}
															</ComboboxItem>
														)}
													</ComboboxCollection>
												</ComboboxList>
											</ComboboxContent>
										</Combobox>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() =>
												navigate({ to: "/dashboard/products" })
											}
										>
											New product
										</Button>
									</div>
								)}
							</form.Field>
							<form.Field name="customerId">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="license-customer">Customer</Label>
										<Combobox
											items={customerOptions}
											value={selectedCustomer}
											onValueChange={(item) => {
												field.handleChange(item?.value ?? "");
												setCustomerQuery(item?.label ?? "");
											}}
											isItemEqualToValue={(a, b) => a.value === b.value}
											itemToStringLabel={(item) => item.label}
											itemToStringValue={(item) => item.value}
											inputValue={customerQuery}
											onInputValueChange={setCustomerQuery}
										>
											<ComboboxInput placeholder="Select a customer" />
											<ComboboxContent>
												<ComboboxEmpty>No customers found.</ComboboxEmpty>
												<ComboboxList>
													<ComboboxCollection>
														{(item) => (
															<ComboboxItem key={item.value} value={item}>
																<div className="flex flex-col">
																	<span>{item.label}</span>
																	{item.description && (
																		<span className="text-xs text-muted-foreground">
																			{item.description}
																		</span>
																	)}
																</div>
															</ComboboxItem>
														)}
													</ComboboxCollection>
												</ComboboxList>
											</ComboboxContent>
										</Combobox>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() =>
												navigate({ to: "/dashboard/customers" })
											}
										>
											New customer
										</Button>
									</div>
								)}
							</form.Field>
							<form.Field name="type">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="license-type">Type</Label>
											<select
												id="license-type"
												className="w-full rounded-md border bg-background px-3 py-2 text-sm"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(
														event.target.value as LicenseFormValues["type"],
												)
											}
										>
											<option value="trial">Trial</option>
											<option value="monthly">Monthly</option>
											<option value="yearly">Yearly</option>
											<option value="lifetime">Lifetime</option>
										</select>
									</div>
								)}
							</form.Field>
						</>
					)}
					<form.Field name="expiresAt">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="license-expires">Expires at (optional)</Label>
								<Input
									id="license-expires"
									type="datetime-local"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="maxActivations">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="license-max">Max activations (optional)</Label>
								<Input
									id="license-max"
									type="number"
									min={1}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="status">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="license-status">Status</Label>
									<select
										id="license-status"
										className="w-full rounded-md border bg-background px-3 py-2 text-sm"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) =>
											field.handleChange(
												event.target.value as LicenseFormValues["status"],
										)
									}
								>
									<option value="active">Active</option>
									<option value="suspended">Suspended</option>
									<option value="expired">Expired</option>
									<option value="revoked">Revoked</option>
								</select>
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
