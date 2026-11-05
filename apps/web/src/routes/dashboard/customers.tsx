import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import { type Customer, CustomerSheet } from "@/components/callables";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/customers")({
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

	const customersQuery = useQuery({
		...orpc.admin.customers.list.queryOptions({
			input: {
				search: debouncedSearch || undefined,
				page,
				pageSize,
			},
		}),
		placeholderData: keepPreviousData,
	});

	const isTableLoading = customersQuery.isLoading;
	const isTableFetching = customersQuery.isFetching;
	const total = customersQuery.data?.total ?? 0;

	const columns = useMemo<ColumnDef<Customer>[]>(
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
								<div className="text-muted-foreground text-xs">
									{companySlug}
								</div>
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
						onClick={() => CustomerSheet.call({ initialValues: row.original })}
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
						<Button onClick={() => CustomerSheet.call({})}>New customer</Button>
					</div>
				</div>
				<Separator className="my-4" />
				{customersQuery.isError && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
						Failed to load customers.{" "}
						<Button
							variant="ghost"
							size="sm"
							onClick={() => customersQuery.refetch()}
						>
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
							<Button size="sm" onClick={() => CustomerSheet.call({})}>
								Create customer
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
