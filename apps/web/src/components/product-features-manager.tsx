import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { orpc, queryClient } from "@/utils/orpc";

type FeatureRow = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	enabledByDefault: boolean;
};

/**
 * Live feature management for an EXISTING product: search, default filter,
 * inline creation and per-row toggle/delete. Scales to hundreds of features
 * (compact table, sticky header, scroll area). Used on the product detail
 * screen and inside the ProductSheet in edit mode.
 */
export function ProductFeaturesManager({
	productId,
	maxHeight = "420px",
}: {
	productId: string;
	maxHeight?: string;
}) {
	const uid = useId();
	const [search, setSearch] = useState("");
	const [defaultFilter, setDefaultFilter] = useState<"all" | "on" | "off">(
		"all",
	);
	const [newKey, setNewKey] = useState("");
	const [newName, setNewName] = useState("");
	const [newDefault, setNewDefault] = useState(false);

	const featuresQuery = useQuery(
		orpc.admin.products.features.list.queryOptions({ input: { productId } }),
	);
	const features = featuresQuery.data ?? [];

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.admin.products.features.list.key(),
		});
		queryClient.invalidateQueries({
			queryKey: orpc.admin.products.detail.key(),
		});
		// Effective license features depend on product defaults.
		queryClient.invalidateQueries({
			queryKey: orpc.admin.licenses.detail.key(),
		});
	};

	const createMutation = useMutation({
		...orpc.admin.products.features.create.mutationOptions(),
		onSuccess: invalidate,
	});
	const updateMutation = useMutation({
		...orpc.admin.products.features.update.mutationOptions(),
		onSuccess: invalidate,
	});
	const deleteMutation = useMutation({
		...orpc.admin.products.features.delete.mutationOptions(),
		onSuccess: invalidate,
	});

	const filteredFeatures = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return features.filter((feature) => {
			if (defaultFilter === "on" && !feature.enabledByDefault) return false;
			if (defaultFilter === "off" && feature.enabledByDefault) return false;
			if (!needle) return true;
			return (
				feature.name.toLowerCase().includes(needle) ||
				feature.key.toLowerCase().includes(needle)
			);
		});
	}, [features, search, defaultFilter]);

	const columns = useMemo<ColumnDef<FeatureRow>[]>(
		() => [
			{
				header: "Feature",
				accessorKey: "name",
				cell: ({ row }) => (
					<div className="min-w-0">
						<div className="font-medium">{row.original.name}</div>
						<div className="font-mono text-muted-foreground text-xs">
							{row.original.key}
						</div>
					</div>
				),
			},
			{
				header: "Default",
				accessorKey: "enabledByDefault",
				cell: ({ row }) => (
					<Checkbox
						aria-label={`Toggle default for ${row.original.name}`}
						checked={row.original.enabledByDefault}
						onCheckedChange={async (checked) => {
							try {
								await updateMutation.mutateAsync({
									id: row.original.id,
									name: row.original.name,
									description: row.original.description,
									enabledByDefault: Boolean(checked),
								});
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Failed to update feature",
								);
							}
						}}
					/>
				),
			},
			{
				header: "",
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Delete ${row.original.name}`}
						onClick={async () => {
							const confirmed = window.confirm(
								`Delete feature "${row.original.name}"? License overrides for it will be removed too.`,
							);
							if (!confirmed) return;
							try {
								await deleteMutation.mutateAsync({ id: row.original.id });
								toast.success("Feature deleted");
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Failed to delete feature",
								);
							}
						}}
					>
						<Trash2Icon />
					</Button>
				),
			},
		],
		[updateMutation, deleteMutation],
	);

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					placeholder="Search features..."
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="h-8 min-w-40 flex-1"
				/>
				<Select
					value={defaultFilter}
					onValueChange={(value) =>
						setDefaultFilter(value as typeof defaultFilter)
					}
				>
					<SelectTrigger className="h-8 w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All defaults</SelectItem>
						<SelectItem value="on">Default enabled</SelectItem>
						<SelectItem value="off">Default disabled</SelectItem>
					</SelectContent>
				</Select>
				<span className="text-muted-foreground text-xs">
					{filteredFeatures.length}/{features.length}
				</span>
			</div>
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={async (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (!newKey.trim() || !newName.trim()) {
						toast.error("Key and name are required");
						return;
					}
					try {
						await createMutation.mutateAsync({
							productId,
							key: newKey.trim(),
							name: newName.trim(),
							enabledByDefault: newDefault,
						});
						toast.success("Feature created");
						setNewKey("");
						setNewName("");
						setNewDefault(false);
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to create feature",
						);
					}
				}}
			>
				<Input
					id={`${uid}-feature-key`}
					placeholder="key (e.g. export-pdf)"
					aria-label="Feature key"
					value={newKey}
					onChange={(event) => setNewKey(event.target.value.toLowerCase())}
					className="h-8 w-44 font-mono"
				/>
				<Input
					id={`${uid}-feature-name`}
					placeholder="Name"
					aria-label="Feature name"
					value={newName}
					onChange={(event) => setNewName(event.target.value)}
					className="h-8 min-w-36 flex-1"
				/>
				<label className="flex cursor-pointer items-center gap-2 text-sm">
					<Checkbox
						checked={newDefault}
						onCheckedChange={(checked) => setNewDefault(Boolean(checked))}
					/>
					<span>Default</span>
				</label>
				<Button type="submit" size="sm" disabled={createMutation.isPending}>
					<PlusIcon />
					{createMutation.isPending ? "Adding…" : "Add"}
				</Button>
			</form>
			<DataTable
				columns={columns}
				data={filteredFeatures}
				isLoading={featuresQuery.isLoading}
				isFetching={featuresQuery.isFetching}
				emptyMessage={
					features.length === 0
						? "No features yet. Add the first one above."
						: "No features match the current filters."
				}
				maxHeight={maxHeight}
				stickyHeader
			/>
		</div>
	);
}
