import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type PaginationProps = {
	page: number;
	pageSize: number;
	total: number;
	isLoading?: boolean;
	isFetching?: boolean;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	pageSizeOptions?: number[];
};

export function Pagination({
	page,
	pageSize,
	total,
	isLoading = false,
	isFetching = false,
	onPageChange,
	onPageSizeChange,
	pageSizeOptions = [10, 20, 50],
}: PaginationProps) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return (
		<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
			<div className="flex items-center gap-2 text-muted-foreground">
				{isLoading ? (
					<span>Loading…</span>
				) : (
					<span>
						{total} result{total !== 1 ? "s" : ""}
						{totalPages > 1 && ` · page ${page} / ${totalPages}`}
					</span>
				)}
				{isFetching && !isLoading && (
					<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
				)}
			</div>

			<div className="flex items-center gap-2">
				<div className="flex items-center gap-1.5">
					<span className="text-xs text-muted-foreground">Rows</span>
					<Select
						value={String(pageSize)}
						onValueChange={(v) => {
							onPageSizeChange(Number(v));
							onPageChange(1);
						}}
					>
						<SelectTrigger className="h-8 w-20 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8"
						disabled={isLoading || page <= 1}
						onClick={() => onPageChange(Math.max(1, page - 1))}
						aria-label="Previous page"
					>
						<ChevronLeftIcon className="size-4" />
					</Button>

					<PageNumbers
						page={page}
						totalPages={totalPages}
						isLoading={isLoading}
						onPageChange={onPageChange}
					/>

					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8"
						disabled={isLoading || page >= totalPages}
						onClick={() => onPageChange(Math.min(totalPages, page + 1))}
						aria-label="Next page"
					>
						<ChevronRightIcon className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}

function PageNumbers({
	page,
	totalPages,
	isLoading,
	onPageChange,
}: {
	page: number;
	totalPages: number;
	isLoading: boolean;
	onPageChange: (p: number) => void;
}) {
	if (totalPages <= 1) return null;

	const pages = buildPageRange(page, totalPages);

	return (
		<>
			{pages.map((p, i) =>
				p === "..." ? (
					<span
						key={`ellipsis-${i}`}
						className="flex h-8 w-6 items-center justify-center text-xs text-muted-foreground"
					>
						…
					</span>
				) : (
					<Button
						key={p}
						variant={p === page ? "default" : "outline"}
						size="icon"
						className="h-8 w-8 text-xs"
						disabled={isLoading}
						onClick={() => onPageChange(p)}
					>
						{p}
					</Button>
				),
			)}
		</>
	);
}

function buildPageRange(current: number, total: number): (number | "...")[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	const pages: (number | "...")[] = [];

	if (current <= 4) {
		for (let i = 1; i <= Math.min(5, total); i++) pages.push(i);
		pages.push("...");
		pages.push(total);
	} else if (current >= total - 3) {
		pages.push(1);
		pages.push("...");
		for (let i = total - 4; i <= total; i++) pages.push(i);
	} else {
		pages.push(1);
		pages.push("...");
		for (let i = current - 1; i <= current + 1; i++) pages.push(i);
		pages.push("...");
		pages.push(total);
	}

	return pages;
}
