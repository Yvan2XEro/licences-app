import { useQuery } from "@tanstack/react-query";
import {
	Link,
	Outlet,
	createFileRoute,
	redirect,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import {
	LayoutDashboardIcon,
	PackageIcon,
	UsersIcon,
	KeyIcon,
	User,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarInset,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({
				to: "/login",
				throw: true,
			});
		}
		return { session };
	},
});

function RouteComponent() {
	const { session } = Route.useRouteContext();
	const location = useLocation();
	const navigate = useNavigate();
	const adminQuery = useQuery({
		...orpc.admin.me.queryOptions(),
		retry: false,
	});

	if (adminQuery.isLoading) {
		return (
			<div className="p-6">
				<div className="space-y-3">
					<Skeleton className="h-5 w-40 rounded-sm" />
					<Skeleton className="h-4 w-72 rounded-sm" />
					<Skeleton className="h-4 w-56 rounded-sm" />
				</div>
			</div>
		);
	}

	if (adminQuery.isError) {
		return (
			<div className="p-6">
				<h1 className="text-2xl font-semibold">Access denied</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Your account is not in the admin allowlist.
				</p>
			</div>
		);
	}

	const navItems = [
		{ label: "Overview", to: "/dashboard", icon: LayoutDashboardIcon },
		{ label: "Products", to: "/dashboard/products", icon: PackageIcon },
		{ label: "Customers", to: "/dashboard/customers", icon: UsersIcon },
		{ label: "Licenses", to: "/dashboard/licenses", icon: KeyIcon },
	];
	const pageMeta = [
		{
			match: "/dashboard",
			title: "Overview",
			description: "Key metrics and quick actions.",
		},
		{
			match: "/dashboard/products",
			title: "Products",
			description: "Manage the catalog used for licenses.",
		},
		{
			match: "/dashboard/customers",
			title: "Customers",
			description: "Manage license holders and contact information.",
		},
		{
			match: "/dashboard/licenses",
			title: "Licenses",
			description: "Create and manage license keys.",
		},
	].find((item) =>
		item.match === "/dashboard"
			? location.pathname === "/dashboard"
			: location.pathname.startsWith(item.match),
	);
	const currentTitle = pageMeta?.title ?? "Dashboard";
	const currentDescription = pageMeta?.description ?? "Admin operations.";
	const breadcrumbParts = location.pathname
		.split("/")
		.filter(Boolean)
		.filter((segment) => segment !== "dashboard");
	const breadcrumbs = [
		{ label: "Dashboard", to: "/dashboard" },
		...breadcrumbParts.map((segment, index) => {
			const to = `/dashboard/${breadcrumbParts.slice(0, index + 1).join("/")}`;
			const label = segment.replace(/-/g, " ");
			return { label, to };
		}),
	];

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon">
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Admin</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{navItems.map((item) => {
									const isActive =
										item.to === "/dashboard"
											? location.pathname === "/dashboard"
											: location.pathname.startsWith(item.to);
									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton
												isActive={isActive}
												onClick={() => navigate({ to: item.to })}
											>
												<item.icon className="size-4" />
												<span>{item.label}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenuButton>
						<User className="size-4" />
						<span>{session.data?.user.email}</span>
					</SidebarMenuButton>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<div className="flex flex-col gap-2 border-b px-4 py-3 md:flex-row md:items-center">
					<SidebarTrigger />
					<div className="flex flex-col">
						<div className="text-lg font-semibold">{currentTitle}</div>
						<nav className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							{breadcrumbs.map((crumb, index) => (
								<div key={crumb.to} className="flex items-center gap-2">
									<Link
										to={crumb.to}
										className="hover:text-foreground hover:underline"
									>
										{crumb.label}
									</Link>
									{index < breadcrumbs.length - 1 && <span>/</span>}
								</div>
							))}
						</nav>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<ModeToggle />
						<UserMenu />
					</div>
				</div>
				<div className={cn("p-6")}>
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
