import * as React from "react";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ComboboxRootProps<Value> = React.ComponentProps<typeof BaseCombobox.Root<Value>>;

export function Combobox(props: React.ComponentProps<typeof BaseCombobox.Root<any>>) {
	return <BaseCombobox.Root {...props} />;
}

type ComboboxInputProps = React.ComponentProps<typeof BaseCombobox.Input> & {
	children?: React.ReactNode;
};

export function ComboboxInput({ className, children, ...props }: ComboboxInputProps) {
	const hasAddon = Boolean(children);
	return (
		<div className="relative">
			{hasAddon && (
				<div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
					{children}
				</div>
			)}
			<BaseCombobox.Input
				className={cn(
					"w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/30",
					hasAddon && "pl-10",
					className,
				)}
				{...props}
			/>
			<BaseCombobox.Trigger className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
				<ChevronDownIcon className="size-4" />
			</BaseCombobox.Trigger>
		</div>
	);
}

type ComboboxContentProps = React.ComponentProps<typeof BaseCombobox.Popup> & {
	alignOffset?: number;
	sideOffset?: number;
};

export function ComboboxContent({
	className,
	children,
	alignOffset = 0,
	sideOffset = 6,
	...props
}: ComboboxContentProps) {
	return (
		<BaseCombobox.Portal>
			<BaseCombobox.Positioner alignOffset={alignOffset} sideOffset={sideOffset} className="z-50">
				<BaseCombobox.Popup
					className={cn(
						"w-[--anchor-width] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg outline-none",
						className,
					)}
					{...props}
				>
					{children}
				</BaseCombobox.Popup>
			</BaseCombobox.Positioner>
		</BaseCombobox.Portal>
	);
}

export function ComboboxList({
	className,
	...props
}: React.ComponentProps<typeof BaseCombobox.List>) {
	return (
		<BaseCombobox.List
			className={cn("max-h-60 overflow-auto py-1", className)}
			{...props}
		/>
	);
}

export function ComboboxGroup({
	className,
	...props
}: React.ComponentProps<typeof BaseCombobox.Group>) {
	return <BaseCombobox.Group className={cn("px-1", className)} {...props} />;
}

export function ComboboxLabel({
	className,
	...props
}: React.ComponentProps<typeof BaseCombobox.GroupLabel>) {
	return (
		<BaseCombobox.GroupLabel
			className={cn("px-2 py-1 text-xs font-medium text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function ComboboxCollection(props: React.ComponentProps<typeof BaseCombobox.Collection>) {
	return <BaseCombobox.Collection {...props} />;
}

export function ComboboxEmpty({
	className,
	...props
}: React.ComponentProps<typeof BaseCombobox.Empty>) {
	return (
		<BaseCombobox.Empty
			className={cn("px-2 py-2 text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function ComboboxItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof BaseCombobox.Item>) {
	return (
		<BaseCombobox.Item
			className={cn(
				"relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
				className,
			)}
			{...props}
		>
			<BaseCombobox.ItemIndicator className="mr-2 inline-flex size-4 items-center justify-center text-muted-foreground">
				<CheckIcon className="size-3" />
			</BaseCombobox.ItemIndicator>
			{children}
		</BaseCombobox.Item>
	);
}
