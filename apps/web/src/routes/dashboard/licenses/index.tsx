import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import {
	type LicenseRow,
	LicenseSheet,
	type LicenseStatus,
	type LicenseType,
} from "@/components/callables";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/licenses/")({
	component: RouteComponent,
});

const badgeBase =
	"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const statusBadge: Record<LicenseStatus, string> = {
	active: "bg-emerald-100 text-emerald-700",
	suspended: "bg-amber-100 text-amber-700",
	expired: "bg-slate-200 text-slate-700",
	revoked: "bg-rose-100 text-rose-700",
};

const typeBadge: Record<LicenseType, string> = {
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
	const [statusFilter, setStatusFilter] = useState<LicenseStatus | "">("");
	const [typeFilter, setTypeFilter] = useState<LicenseType | "">("");
	const [expiringInDays, setExpiringInDays] = useState("");
	const [activationsReached, setActivationsReached] = useState(false);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearch(search.trim());
		}, 250);
		return () => clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		setPage(1);
	}, [
		debouncedSearch,
		statusFilter,
		typeFilter,
		expiringInDays,
		activationsReached,
	]);

	const licenseQueryInput = useMemo(
		() => ({
			search: debouncedSearch || undefined,
			page,
			pageSize,
			status: statusFilter || undefined,
			type: typeFilter || undefined,
			expiringInDays: expiringInDays
				? Number.parseInt(expiringInDays, 10)
				: undefined,
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

	const licensesQuery = useQuery({
		...orpc.admin.licenses.list.queryOptions({ input: licenseQueryInput }),
		placeholderData: keepPreviousData,
	});

	const isTableLoading = licensesQuery.isLoading;
	const isTableFetching = licensesQuery.isFetching;
	const total = licensesQuery.data?.total ?? 0;

	const columns = useMemo<ColumnDef<LicenseRow>[]>(
		() => [
			{
				header: "Key",
				accessorFn: (row) => row.license.key,
				cell: ({ row }) => (
					<div className="space-y-1">
						<ClipboardCopy
							value={row.original.license.key}
							label="license key"
						/>
						<div className="text-muted-foreground text-xs">
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
						<div className="font-medium text-sm">
							{row.original.customerName}
						</div>
						{(row.original.customerCompanyName ||
							row.original.customerCompanySlug) && (
							<div className="text-muted-foreground text-xs">
								{row.original.customerCompanyName ?? "—"}
								{row.original.customerCompanySlug
									? ` · ${row.original.customerCompanySlug}`
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
					<span
						className={cn(badgeBase, statusBadge[row.original.license.status])}
					>
						{row.original.license.status}
					</span>
				),
			},
			{
				header: "Type",
				accessorFn: (row) => row.license.type,
				cell: ({ row }) => (
					<span
						className={cn(
							badgeBase,
							typeBadge[row.original.license.type as LicenseType],
						)}
					>
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
							onClick={() =>
								LicenseSheet.call({ initialValues: row.original.license })
							}
						>
							Edit
						</Button>
						<Link
							to="/dashboard/licenses/$licenseId"
							params={{ licenseId: row.original.license.id }}
							className="font-medium text-primary text-sm underline-offset-4 hover:underline"
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
					<div className="flex w-full flex-wrap items-center gap-2">
						<Input
							placeholder="Search licenses, customers, products…"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="h-9 md:w-64"
						/>
						<Select
							value={statusFilter}
							onValueChange={(v) => setStatusFilter(v as LicenseStatus | "")}
						>
							<SelectTrigger className="h-9 w-full md:w-36">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">All statuses</SelectItem>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="suspended">Suspended</SelectItem>
								<SelectItem value="expired">Expired</SelectItem>
								<SelectItem value="revoked">Revoked</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={typeFilter}
							onValueChange={(v) => setTypeFilter(v as LicenseType | "")}
						>
							<SelectTrigger className="h-9 w-full md:w-32">
								<SelectValue placeholder="Type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">All types</SelectItem>
								<SelectItem value="trial">Trial</SelectItem>
								<SelectItem value="monthly">Monthly</SelectItem>
								<SelectItem value="yearly">Yearly</SelectItem>
								<SelectItem value="lifetime">Lifetime</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={expiringInDays}
							onValueChange={(v) => setExpiringInDays(v ?? "")}
						>
							<SelectTrigger className="h-9 w-full md:w-40">
								<SelectValue placeholder="Expiring" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">Any expiry</SelectItem>
								<SelectItem value="7">In 7 days</SelectItem>
								<SelectItem value="30">In 30 days</SelectItem>
								<SelectItem value="90">In 90 days</SelectItem>
							</SelectContent>
						</Select>
						<label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/40">
							<Checkbox
								id="activations-reached"
								checked={activationsReached}
								onCheckedChange={(checked) =>
									setActivationsReached(Boolean(checked))
								}
							/>
							<span>Activations reached</span>
						</label>
					</div>
					<div className="shrink-0">
						<Button onClick={() => LicenseSheet.call({})}>New license</Button>
					</div>
				</div>
				<Separator className="my-4" />
				{licensesQuery.isError && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
						Failed to load licenses.{" "}
						<Button
							variant="ghost"
							size="sm"
							onClick={() => licensesQuery.refetch()}
						>
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
							<Button size="sm" onClick={() => LicenseSheet.call({})}>
								Create license
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
