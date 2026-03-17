import type React from "react";

import { cn } from "@/lib/utils";

type InputGroupAddonProps = React.HTMLAttributes<HTMLDivElement>;

export function InputGroupAddon({ className, ...props }: InputGroupAddonProps) {
	return (
		<div
			className={cn(
				"inline-flex items-center text-muted-foreground [&>svg]:size-4",
				className,
			)}
			{...props}
		/>
	);
}
