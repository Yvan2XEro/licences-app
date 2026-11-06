import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/products")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
