import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ClipboardCopyProps = {
	value: string;
	label?: string;
	className?: string;
};

export function ClipboardCopy({ value, label, className }: ClipboardCopyProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			toast.success(label ? "copied!" : "Copied to clipboard");
			setTimeout(() => setCopied(false), 1500);
		} catch (error) {
			toast.error("Unable to copy");
		}
	};

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={handleCopy}
			className={cn(
				"inline-flex items-center gap-2 font-mono text-xs uppercase",
				className,
			)}
		>
			<span>{value}</span>
			{copied ? (
				<Check className="h-3.5 w-3.5" aria-hidden />
			) : (
				<Copy className="h-3.5 w-3.5" aria-hidden />
			)}
			<span className="sr-only">{`Copy ${label ?? value}`}</span>
		</Button>
	);
}
