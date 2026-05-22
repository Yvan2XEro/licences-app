import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/licenses/$licenseId")({
	component: RouteComponent,
});

const STATUS_BADGE: Record<string, string> = {
	active: "bg-emerald-100 text-emerald-700",
	suspended: "bg-amber-100 text-amber-700",
	expired: "bg-slate-200 text-slate-700",
	revoked: "bg-rose-100 text-rose-700",
};
const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

const LOGS_PER_PAGE = 10;

function RouteComponent() {
	const { licenseId } = Route.useParams();
	const [logPage, setLogPage] = useState(1);

	const detailQuery = useQuery({
		...orpc.admin.licenses.detail.queryOptions({ input: { licenseId } }),
	});

	const revokeMutation = useMutation({
		...orpc.admin.machines.revoke.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.detail.queryKey({ input: { licenseId } }),
			});
		},
	});
	const restoreMutation = useMutation({
		...orpc.admin.machines.restore.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.detail.queryKey({ input: { licenseId } }),
			});
			toast.success("Machine restored");
		},
	});
	const updateLicenseMutation = useMutation({
		...orpc.admin.licenses.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.detail.queryKey({ input: { licenseId } }),
			});
			toast.success("License updated");
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
							<Skeleton className="h-4 w-48 rounded-sm" />
							<Skeleton className="h-4 w-40 rounded-sm" />
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
				<Card className="p-6">
					<Skeleton className="h-5 w-40 rounded-sm" />
					<div className="mt-4 space-y-3">
						<Skeleton className="h-12 w-full rounded-sm" />
						<Skeleton className="h-12 w-full rounded-sm" />
					</div>
				</Card>
			</div>
		);
	}

	if (!detailQuery.data) {
		return <div>License not found.</div>;
	}

	const { license, product, customer, machines, logs } = detailQuery.data;
	const expiresAtValue = license.expiresAt
		? new Date(license.expiresAt).toISOString()
		: null;

	const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
	const pagedLogs = logs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE);

	return (
		<div className="space-y-6">
			<Card className="p-6">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<h2 className="text-lg font-semibold">License detail</h2>
					<div className="flex flex-wrap items-center gap-2">
						{license.status === "active" && (
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									updateLicenseMutation.mutate({
										id: license.id,
										status: "suspended",
										expiresAt: expiresAtValue,
										maxActivations: license.maxActivations,
									})
								}
							>
								Suspend
							</Button>
						)}
						{license.status !== "active" && license.status !== "revoked" && (
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									updateLicenseMutation.mutate({
										id: license.id,
										status: "active",
										expiresAt: expiresAtValue,
										maxActivations: license.maxActivations,
									})
								}
							>
								Activate
							</Button>
						)}
						{license.status !== "revoked" && (
							<Button
								variant="destructive"
								size="sm"
								onClick={() =>
									updateLicenseMutation.mutate({
										id: license.id,
										status: "revoked",
										expiresAt: expiresAtValue,
										maxActivations: license.maxActivations,
									})
								}
							>
								Revoke license
							</Button>
						)}
					</div>
				</div>
				<div className="mt-4 grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
					<div className="grid gap-2 rounded-md border p-3">
						<div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							License
						</div>
						<div>
							<strong className="text-foreground">Key:</strong>{" "}
							<ClipboardCopy value={license.key} label="license key" />
						</div>
						<div className="flex items-center gap-2">
							<strong className="text-foreground">Status:</strong>
							<span className={cn(badgeBase, STATUS_BADGE[license.status] ?? "")}>
								{license.status}
							</span>
						</div>
						<div>
							<strong className="text-foreground">Product:</strong> {product.name}
						</div>
						<div>
							<strong className="text-foreground">Type:</strong>{" "}
							<span className="capitalize">{license.type}</span>
						</div>
						<div>
							<strong className="text-foreground">Expires:</strong>{" "}
							{license.expiresAt
								? new Date(license.expiresAt).toLocaleString()
								: "Never"}
						</div>
						{license.maxActivations !== null && (
							<div>
								<strong className="text-foreground">Max activations:</strong>{" "}
								{license.maxActivations}
							</div>
						)}
					</div>
					<div className="grid gap-2 rounded-md border p-3">
						<div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Customer
						</div>
						<div>
							<strong className="text-foreground">Name:</strong> {customer.name}
						</div>
						{customer.email && (
							<div>
								<strong className="text-foreground">Email:</strong>{" "}
								<ClipboardCopy value={customer.email} label="email" />
							</div>
						)}
						{customer.companyName && (
							<div>
								<strong className="text-foreground">Company:</strong>{" "}
								{customer.companyName}
							</div>
						)}
						{customer.companySlug && (
							<div>
								<strong className="text-foreground">Slug:</strong>{" "}
								{customer.companySlug}
							</div>
						)}
						{customer.phone && (
							<div>
								<strong className="text-foreground">Phone:</strong>{" "}
								<ClipboardCopy value={customer.phone} label="phone" />
							</div>
						)}
						{customer.address && (
							<div>
								<strong className="text-foreground">Address:</strong>{" "}
								{customer.address}
							</div>
						)}
					</div>
				</div>
			</Card>

			<Card className="p-6">
				<h3 className="text-lg font-semibold">
					Machines{" "}
					<span className="text-sm font-normal text-muted-foreground">
						({machines.length})
					</span>
				</h3>
				<Separator className="my-4" />
				<div className="space-y-3">
					{machines.map((machine) => (
						<div
							key={machine.id}
							className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
						>
							<div className="text-sm">
								<div className="font-mono text-xs">{machine.fingerprint}</div>
								<div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
									<span>Activated: {new Date(machine.activatedAt).toLocaleString()}</span>
									<span>Last seen: {new Date(machine.lastSeenAt).toLocaleString()}</span>
								</div>
								{machine.revokedAt && (
									<div className="text-xs text-destructive">
										Revoked: {new Date(machine.revokedAt).toLocaleString()}
									</div>
								)}
							</div>
							<Button
								variant="destructive"
								size="sm"
								disabled={Boolean(machine.revokedAt)}
								onClick={() => {
									const confirmed = window.confirm(
										"Revoke this machine? The user will need to re-activate.",
									);
									if (!confirmed) return;
									revokeMutation.mutate(
										{ machineId: machine.id },
										{
											onSuccess: () => {
												toast.message("Machine revoked", {
													action: {
														label: "Undo",
														onClick: () =>
															restoreMutation.mutate({ machineId: machine.id }),
													},
												});
											},
										},
									);
								}}
							>
								Revoke
							</Button>
						</div>
					))}
					{machines.length === 0 && (
						<p className="text-sm text-muted-foreground">No machines yet.</p>
					)}
				</div>
			</Card>

			<Card className="p-6">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">
						Activation logs{" "}
						<span className="text-sm font-normal text-muted-foreground">
							({logs.length})
						</span>
					</h3>
					{totalLogPages > 1 && (
						<span className="text-xs text-muted-foreground">
							Page {logPage} / {totalLogPages}
						</span>
					)}
				</div>
				<Separator className="my-4" />
				<div className="space-y-2 text-sm">
					{pagedLogs.map((log) => (
						<div key={log.id} className="rounded-md border p-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{log.eventType}</span>
								<span className="text-xs text-muted-foreground">
									{new Date(log.createdAt).toLocaleString()}
								</span>
								{log.reason && (
									<span className="text-xs text-destructive">{log.reason}</span>
								)}
							</div>
							<div className="mt-1 text-xs text-muted-foreground">
								IP: {log.ip}
								{log.userAgent && ` · ${log.userAgent}`}
							</div>
						</div>
					))}
					{logs.length === 0 && (
						<p className="text-sm text-muted-foreground">No logs yet.</p>
					)}
				</div>
				{totalLogPages > 1 && (
					<div className="mt-4 flex items-center justify-between text-sm">
						<span className="text-xs text-muted-foreground">
							{logs.length} events total
						</span>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon"
								className="h-8 w-8"
								disabled={logPage <= 1}
								onClick={() => setLogPage((p) => Math.max(1, p - 1))}
							>
								<ChevronLeftIcon className="size-4" />
							</Button>
							<span className="px-2 text-xs">
								{logPage} / {totalLogPages}
							</span>
							<Button
								variant="outline"
								size="icon"
								className="h-8 w-8"
								disabled={logPage >= totalLogPages}
								onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
							>
								<ChevronRightIcon className="size-4" />
							</Button>
						</div>
					</div>
				)}
			</Card>
		</div>
	);
}
