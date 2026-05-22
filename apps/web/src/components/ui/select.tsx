import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function Select<Value = string>(
	props: React.ComponentProps<typeof BaseSelect.Root<Value>>,
) {
	return <BaseSelect.Root {...props} />;
}

export function SelectTrigger({
	className,
	children,
	...props
}: React.ComponentProps<typeof BaseSelect.Trigger>) {
	return (
		<BaseSelect.Trigger
			className={cn(
				"flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm outline-none transition",
				"focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/20",
				"data-[placeholder]:text-muted-foreground",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"hover:bg-accent/40",
				className,
			)}
			{...props}
		>
			{children}
			<BaseSelect.Icon className="shrink-0 text-muted-foreground">
				<ChevronDownIcon className="size-4" />
			</BaseSelect.Icon>
		</BaseSelect.Trigger>
	);
}

export function SelectValue(
	props: React.ComponentProps<typeof BaseSelect.Value>,
) {
	return <BaseSelect.Value {...props} />;
}

export function SelectContent({
	className,
	children,
	sideOffset = 6,
	...props
}: React.ComponentProps<typeof BaseSelect.Popup> & { sideOffset?: number }) {
	return (
		<BaseSelect.Portal>
			<BaseSelect.Positioner sideOffset={sideOffset} className="z-50">
				<BaseSelect.Popup
					className={cn(
						"w-[--anchor-width] min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
						"data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95",
						"data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[starting-style]:zoom-in-95",
						className,
					)}
					{...props}
				>
					<BaseSelect.ScrollUpArrow className="flex h-4 cursor-default items-center justify-center text-muted-foreground" />
					<BaseSelect.List className="max-h-60 overflow-auto py-0.5">
						{children}
					</BaseSelect.List>
					<BaseSelect.ScrollDownArrow className="flex h-4 cursor-default items-center justify-center text-muted-foreground" />
				</BaseSelect.Popup>
			</BaseSelect.Positioner>
		</BaseSelect.Portal>
	);
}

export function SelectItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof BaseSelect.Item>) {
	return (
		<BaseSelect.Item
			className={cn(
				"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
				"data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
				"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<span className="absolute left-2 flex size-3.5 items-center justify-center">
				<BaseSelect.ItemIndicator>
					<CheckIcon className="size-3.5" />
				</BaseSelect.ItemIndicator>
			</span>
			<BaseSelect.ItemText>{children}</BaseSelect.ItemText>
		</BaseSelect.Item>
	);
}

export function SelectGroup(
	props: React.ComponentProps<typeof BaseSelect.Group>,
) {
	return <BaseSelect.Group {...props} />;
}

export function SelectGroupLabel({
	className,
	...props
}: React.ComponentProps<typeof BaseSelect.GroupLabel>) {
	return (
		<BaseSelect.GroupLabel
			className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function SelectSeparator({ className }: { className?: string }) {
	return <div className={cn("-mx-1 my-1 h-px bg-muted", className)} />;
}
