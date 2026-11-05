import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import { type Product, ProductSheet } from "@/components/callables";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/products")({
	component: RouteComponent,
});

function RouteComponent() {
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
	}, [debouncedSearch]);

	const productsQuery = useQuery({
		...orpc.admin.products.list.queryOptions({
			input: {
				search: debouncedSearch || undefined,
				page,
				pageSize,
			},
		}),
		placeholderData: keepPreviousData,
	});

	const isTableLoading = productsQuery.isLoading;
	const isTableFetching = productsQuery.isFetching;
	const total = productsQuery.data?.total ?? 0;

	const columns = useMemo<ColumnDef<Product>[]>(
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
						onClick={() => ProductSheet.call({ initialValues: row.original })}
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
						<Button onClick={() => ProductSheet.call({})}>New product</Button>
					</div>
				</div>
				<Separator className="my-4" />
				{productsQuery.isError && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
						Failed to load products.{" "}
						<Button
							variant="ghost"
							size="sm"
							onClick={() => productsQuery.refetch()}
						>
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
							<Button size="sm" onClick={() => ProductSheet.call({})}>
								Create product
							</Button>
						</div>
					}
					maxHeight="520px"
					stickyHeader
				/>
				<Pagination
					page={page}
					pageSize={pageSize}
					total={total}
					isLoading={isTableLoading}
					isFetching={isTableFetching}
					onPageChange={setPage}
					onPageSizeChange={(size) => {
						setPageSize(size);
						setPage(1);
					}}
				/>
			</Card>
		</div>
	);
}
