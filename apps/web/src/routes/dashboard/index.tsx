import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();
	const statsQuery = useQuery(orpc.admin.dashboard.stats.queryOptions());

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card className="p-5">
					<div className="text-xs uppercase text-muted-foreground">Active licenses</div>
					{statsQuery.isLoading ? (
						<Skeleton className="mt-2 h-6 w-16 rounded-sm" />
					) : (
						<div className="mt-2 text-2xl font-semibold">
							{statsQuery.data?.licensesActive ?? 0}
						</div>
					)}
				</Card>
				<Card className="p-5">
					<div className="text-xs uppercase text-muted-foreground">Expiring soon (30d)</div>
					{statsQuery.isLoading ? (
						<Skeleton className="mt-2 h-6 w-16 rounded-sm" />
					) : (
						<div className="mt-2 text-2xl font-semibold">
							{statsQuery.data?.licensesExpiringSoon ?? 0}
						</div>
					)}
				</Card>
				<Card className="p-5">
					<div className="text-xs uppercase text-muted-foreground">Activations reached</div>
					{statsQuery.isLoading ? (
						<Skeleton className="mt-2 h-6 w-16 rounded-sm" />
					) : (
						<div className="mt-2 text-2xl font-semibold">
							{statsQuery.data?.activationsReached ?? 0}
						</div>
					)}
				</Card>
				<Card className="p-5">
					<div className="text-xs uppercase text-muted-foreground">Total licenses</div>
					{statsQuery.isLoading ? (
						<Skeleton className="mt-2 h-6 w-16 rounded-sm" />
					) : (
						<div className="mt-2 text-2xl font-semibold">
							{statsQuery.data?.licenses ?? 0}
						</div>
					)}
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card className="p-6">
					<h2 className="text-lg font-semibold">Quick actions</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Create key records without leaving the dashboard.
					</p>
					<div className="mt-4 flex flex-wrap gap-2">
						<Button size="sm" onClick={() => navigate({ to: "/dashboard/products" })}>
							New product
						</Button>
						<Button size="sm" variant="outline" onClick={() => navigate({ to: "/dashboard/customers" })}>
							New customer
						</Button>
						<Button size="sm" variant="outline" onClick={() => navigate({ to: "/dashboard/licenses" })}>
							New license
						</Button>
					</div>
				</Card>
				<Card className="p-6">
					<h2 className="text-lg font-semibold">Status breakdown</h2>
					{statsQuery.isLoading ? (
						<div className="mt-3 space-y-2">
							<Skeleton className="h-4 w-48 rounded-sm" />
							<Skeleton className="h-4 w-40 rounded-sm" />
							<Skeleton className="h-4 w-44 rounded-sm" />
						</div>
					) : (
						<div className="mt-3 grid gap-2 text-sm text-muted-foreground">
							<div>Active: {statsQuery.data?.licensesActive ?? 0}</div>
							<div>Suspended: {statsQuery.data?.licensesSuspended ?? 0}</div>
							<div>Expired: {statsQuery.data?.licensesExpired ?? 0}</div>
							<div>Revoked: {statsQuery.data?.licensesRevoked ?? 0}</div>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
