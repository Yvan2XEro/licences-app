import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type ColumnDef,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import {
	ArrowUpDownIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	Loader2Icon,
} from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type DataTableProps<TData> = {
	columns: ColumnDef<TData>[];
	data: TData[];
	className?: string;
	isLoading?: boolean;
	isFetching?: boolean;
	emptyMessage?: string;
	emptyState?: React.ReactNode;
	skeletonRows?: number;
	maxHeight?: string;
	stickyHeader?: boolean;
};

export function DataTable<TData>({
	columns,
	data,
	className,
	isLoading = false,
	isFetching = false,
	emptyMessage = "No results.",
	emptyState,
	skeletonRows = 6,
	maxHeight,
	stickyHeader = false,
}: DataTableProps<TData>) {
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const table = useReactTable({
		data,
		columns,
		state: {
			sorting,
		},
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	const tableWrapperStyle = maxHeight
		? ({ maxHeight } as React.CSSProperties)
		: undefined;

	const tableWrapperClass = maxHeight ? "overflow-auto" : "overflow-x-auto";

	return (
		<div className={cn("relative rounded-md border bg-background", className)}>
			<div className={tableWrapperClass} style={tableWrapperStyle}>
				<table className="min-w-full text-sm">
					<thead
						className={cn(
							"bg-muted/50 text-xs uppercase text-muted-foreground",
							stickyHeader && "sticky top-0 z-10",
						)}
					>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id} className="border-b">
								{headerGroup.headers.map((header) => (
									<th
										key={header.id}
										className="px-3 py-2 text-left font-medium"
									>
										{header.isPlaceholder ? null : header.column.getCanSort() ? (
											<button
												type="button"
												onClick={header.column.getToggleSortingHandler()}
												className="inline-flex items-center gap-1 text-left hover:text-foreground"
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{header.column.getIsSorted() === "asc" && (
													<ChevronUpIcon className="size-3" />
												)}
												{header.column.getIsSorted() === "desc" && (
													<ChevronDownIcon className="size-3" />
												)}
												{!header.column.getIsSorted() && (
													<ArrowUpDownIcon className="size-3 opacity-50" />
												)}
											</button>
										) : (
											flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)
										)}
									</th>
								))}
							</tr>
						))}
					</thead>
					<tbody>
						{isLoading
							? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
								<tr
									key={`skeleton-${rowIndex}`}
									className="border-b last:border-0"
								>
									{columns.map((_, cellIndex) => (
										<td
											key={`skeleton-${rowIndex}-${cellIndex}`}
											className="px-3 py-2"
										>
											<Skeleton className="h-4 w-full rounded-sm" />
										</td>
									))}
								</tr>
							))
							: table.getRowModel().rows.map((row) => (
								<tr
									key={row.id}
									className="border-b transition-colors hover:bg-muted/30 last:border-0"
								>
									{row.getVisibleCells().map((cell) => (
										<td key={cell.id} className="px-3 py-2 align-top">
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</td>
									))}
								</tr>
							))}
						{!isLoading && table.getRowModel().rows.length === 0 && (
							<tr>
								<td
									colSpan={columns.length}
									className="px-3 py-10 text-center text-sm text-muted-foreground"
								>
									{emptyState ?? emptyMessage}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
