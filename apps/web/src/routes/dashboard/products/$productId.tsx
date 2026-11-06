import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ProductSheet } from "@/components/callables";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { ProductFeaturesManager } from "@/components/product-features-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/products/$productId")({
	component: RouteComponent,
});

const badgeBase =
	"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const STATUS_BADGE: Record<string, string> = {
	active: "bg-emerald-100 text-emerald-700",
	suspended: "bg-amber-100 text-amber-700",
	expired: "bg-slate-200 text-slate-700",
	revoked: "bg-rose-100 text-rose-700",
};

function RouteComponent() {
	const { productId } = Route.useParams();
	const navigate = useNavigate();

	const detailQuery = useQuery(
		orpc.admin.products.detail.queryOptions({ input: { productId } }),
	);

	const deleteMutation = useMutation({
		...orpc.admin.products.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.products.list.queryKey(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.list.queryKey(),
			});
		},
	});

	if (detailQuery.isLoading) {
		return (
			<div className="space-y-6">
				<Card className="p-6">
					<div className="space-y-3">
						<Skeleton className="h-5 w-40 rounded-sm" />
						<div className="grid gap-2">
							<Skeleton className="h-4 w-64 rounded-sm" />
							<Skeleton className="h-4 w-52 rounded-sm" />
						</div>
					</div>
				</Card>
				<Card className="p-6">
					<Skeleton className="h-5 w-32 rounded-sm" />
					<div className="mt-4 space-y-3">
						<Skeleton className="h-16 w-full rounded-sm" />
						<Skeleton className="h-16 w-full rounded-sm" />
					</div>
				</Card>
			</div>
		);
	}

	if (!detailQuery.data) {
		return <div>Product not found.</div>;
	}

	const { product, features, stats } = detailQuery.data;

	return (
		<div className="space-y-6">
			<Card className="p-6">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<h2 className="font-semibold text-lg">{product.name}</h2>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => ProductSheet.call({ initialValues: product })}
						>
							Edit
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={deleteMutation.isPending}
							onClick={async () => {
								const confirmed = window.confirm(
									`Delete "${product.name}"? This permanently removes the product, its ${stats.totalLicenses} license(s), their machines, activation logs and features. This cannot be undone.`,
								);
								if (!confirmed) return;
								try {
									await deleteMutation.mutateAsync({ id: product.id });
									toast.success("Product deleted");
									navigate({ to: "/dashboard/products" });
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: "Failed to delete product",
									);
								}
							}}
						>
							Delete product
						</Button>
					</div>
				</div>
				<div className="mt-4 grid gap-4 text-muted-foreground text-sm md:grid-cols-2">
					<div className="grid gap-2 rounded-md border p-3">
						<div className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Product
						</div>
						<div>
							<strong className="text-foreground">Slug:</strong>{" "}
							<ClipboardCopy value={product.slug} label="slug" />
						</div>
						<div>
							<strong className="text-foreground">Default activations:</strong>{" "}
							{product.defaultMaxActivations}
						</div>
						<div>
							<strong className="text-foreground">Created:</strong>{" "}
							{new Date(product.createdAt).toLocaleString()}
						</div>
					</div>
					<div className="grid gap-2 rounded-md border p-3">
						<div className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Usage
						</div>
						<div>
							<strong className="text-foreground">Licenses:</strong>{" "}
							{stats.totalLicenses} ({stats.activeLicenses} active)
						</div>
						<div>
							<strong className="text-foreground">Features:</strong>{" "}
							{features.length} (
							{features.filter((feature) => feature.enabledByDefault).length}{" "}
							enabled by default)
						</div>
					</div>
				</div>
			</Card>

			<Card className="p-6">
				<h3 className="font-semibold text-lg">
					Features{" "}
					<span className="font-normal text-muted-foreground text-sm">
						({features.length})
					</span>
				</h3>
				<Separator className="my-4" />
				<ProductFeaturesManager productId={product.id} />
			</Card>

			<ProductLicensesCard productId={product.id} />
		</div>
	);
}

function ProductLicensesCard({ productId }: { productId: string }) {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearch(search.trim());
		}, 250);
		return () => clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		setPage(1);
	}, []);

	const licensesQuery = useQuery({
		...orpc.admin.licenses.list.queryOptions({
			input: {
				productId,
				search: debouncedSearch || undefined,
				page,
				pageSize,
			},
		}),
		placeholderData: keepPreviousData,
	});

	type LicenseItem = NonNullable<typeof licensesQuery.data>["items"][number];

	const columns = useMemo<ColumnDef<LicenseItem>[]>(
		() => [
			{
				header: "Key",
				accessorFn: (row) => row.license.key,
				cell: ({ row }) => (
					<ClipboardCopy value={row.original.license.key} label="license key" />
				),
			},
			{
				header: "Customer",
				accessorFn: (row) => row.customerName,
				cell: ({ row }) => (
					<div className="min-w-0">
						<div className="font-medium">{row.original.customerName}</div>
						{row.original.customerCompanyName && (
							<div className="text-muted-foreground text-xs">
								{row.original.customerCompanyName}
							</div>
						)}
					</div>
				),
			},
			{
				header: "Status",
				accessorFn: (row) => row.license.status,
				cell: ({ row }) => (
					<span
						className={cn(
							badgeBase,
							STATUS_BADGE[row.original.license.status] ?? "",
						)}
					>
						{row.original.license.status}
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
				header: "",
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => (
					<Link
						to="/dashboard/licenses/$licenseId"
						params={{ licenseId: row.original.license.id }}
						className="font-medium text-primary text-sm underline-offset-4 hover:underline"
					>
						Details
					</Link>
				),
			},
		],
		[],
	);

	const total = licensesQuery.data?.total ?? 0;

	return (
		<Card className="p-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<h3 className="font-semibold text-lg">
					Licenses{" "}
					<span className="font-normal text-muted-foreground text-sm">
						({total})
					</span>
				</h3>
				<Input
					placeholder="Search licenses..."
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="h-8 md:w-64"
				/>
			</div>
			<Separator className="my-4" />
			<DataTable
				columns={columns}
				data={licensesQuery.data?.items ?? []}
				isLoading={licensesQuery.isLoading}
				isFetching={licensesQuery.isFetching}
				emptyMessage="No licenses for this product."
				maxHeight="420px"
				stickyHeader
			/>
			<Pagination
				page={page}
				pageSize={pageSize}
				total={total}
				isLoading={licensesQuery.isLoading}
				isFetching={licensesQuery.isFetching}
				onPageChange={setPage}
				onPageSizeChange={(size) => {
					setPageSize(size);
					setPage(1);
				}}
			/>
		</Card>
	);
}
