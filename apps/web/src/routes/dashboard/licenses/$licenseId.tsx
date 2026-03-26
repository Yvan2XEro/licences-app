import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCopy } from "@/components/ui/clipboard-copy";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/licenses/$licenseId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { licenseId } = Route.useParams();
	const detailQuery = useQuery({
		...orpc.admin.licenses.detail.queryOptions({ input: {licenseId} }),
	});

	const revokeMutation = useMutation({
		...orpc.admin.machines.revoke.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.detail.queryKey({ input: {licenseId} }),
			});
		},
	});
	const restoreMutation = useMutation({
		...orpc.admin.machines.restore.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.detail.queryKey({ input: {licenseId} }),
			});
			toast.success("Machine restored");
		},
	});
	const updateLicenseMutation = useMutation({
		...orpc.admin.licenses.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.licenses.detail.queryKey({ input: {licenseId} }),
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
						<div className="text-xs uppercase text-muted-foreground">License</div>
						<div>
							<strong className="text-foreground">Key:</strong>{" "}
							<ClipboardCopy value={license.key} label="license key" />
						</div>
						<div>
							<strong className="text-foreground">Product:</strong> {product.name}
						</div>
						<div>
							<strong className="text-foreground">Status:</strong>{" "}
							{license.status}
						</div>
						<div>
							<strong className="text-foreground">Type:</strong> {license.type}
						</div>
						<div>
							<strong className="text-foreground">Expires:</strong>{" "}
							{license.expiresAt
								? new Date(license.expiresAt).toLocaleString()
								: "Never"}
						</div>
					</div>
					<div className="grid gap-2 rounded-md border p-3">
						<div className="text-xs uppercase text-muted-foreground">Customer</div>
						<div>
							<strong className="text-foreground">Name:</strong> {customer.name}
						</div>
						<div>
							<strong className="text-foreground">Email:</strong>{" "}
							{customer.email ?? "—"}
						</div>
						<div>
							<strong className="text-foreground">Company:</strong>{" "}
							{customer.companyName ?? "—"}
						</div>
						<div>
							<strong className="text-foreground">Company slug:</strong>{" "}
							{customer.companySlug ?? "—"}
						</div>
						<div>
							<strong className="text-foreground">Phone:</strong>{" "}
							{customer.phone ?? "—"}
						</div>
						<div>
							<strong className="text-foreground">Address:</strong>{" "}
							{customer.address ?? "—"}
						</div>
					</div>
				</div>
			</Card>

			<Card className="p-6">
				<h3 className="text-lg font-semibold">Machines</h3>
				<Separator className="my-4" />
				<div className="space-y-3">
					{machines.map((machine) => (
						<div
							key={machine.id}
							className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
						>
							<div className="text-sm">
								<div className="font-mono">{machine.fingerprint}</div>
								<div className="text-xs text-muted-foreground">
									Activated: {new Date(machine.activatedAt).toLocaleString()}
								</div>
								<div className="text-xs text-muted-foreground">
									Last seen: {new Date(machine.lastSeenAt).toLocaleString()}
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
														onClick: () => restoreMutation.mutate({ machineId: machine.id }),
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
				<h3 className="text-lg font-semibold">Activation logs</h3>
				<Separator className="my-4" />
				<div className="space-y-3 text-sm">
					{logs.map((log) => (
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
							<div className="text-xs text-muted-foreground">
								IP: {log.ip} • {log.userAgent ?? "unknown"}
							</div>
						</div>
					))}
					{logs.length === 0 && (
						<p className="text-sm text-muted-foreground">No logs yet.</p>
					)}
				</div>
			</Card>
		</div>
	);
}
