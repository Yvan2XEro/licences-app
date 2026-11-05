import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { createCallable } from "react-call";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { orpc, queryClient } from "@/utils/orpc";

import { type Customer, CustomerSheet } from "./customer-sheet";
import { type Product, ProductSheet } from "./product-sheet";

export type LicenseStatus = "active" | "suspended" | "expired" | "revoked";
export type LicenseType = "trial" | "monthly" | "yearly" | "lifetime";

export type LicenseRow = {
	license: {
		id: string;
		key: string;
		status: LicenseStatus;
		type: string;
		expiresAt: Date | null;
		maxActivations: number | null;
	};
	productSlug: string;
	productName: string;
	customerEmail: string | null;
	customerName: string;
	customerCompanySlug: string | null;
	customerCompanyName: string | null;
	customerPhone: string | null;
};

interface Props {
	initialValues?: LicenseRow;
}

// Pickers load a single large page; nested creations are inserted into this
// exact cache entry so the new option is selectable immediately.
const PICKER_INPUT = { page: 1, pageSize: 200 };

const UNMOUNT_DELAY = 200;

export const LicenseSheet = createCallable<Props, boolean>(
	({ call, initialValues }) => {
		const isEdit = Boolean(initialValues);

		// While a nested callable (product/customer creation) is open, the
		// license sheet must neither trap focus nor dismiss itself.
		const [nestedCount, setNestedCount] = useState(0);
		const runNested = useCallback(
			async <T,>(fn: () => Promise<T>): Promise<T> => {
				setNestedCount((count) => count + 1);
				try {
					return await fn();
				} finally {
					setNestedCount((count) => count - 1);
				}
			},
			[],
		);
		const nestedActive = nestedCount > 0;

		const productsQuery = useQuery(
			orpc.admin.products.list.queryOptions({ input: PICKER_INPUT }),
		);
		const customersQuery = useQuery(
			orpc.admin.customers.list.queryOptions({ input: PICKER_INPUT }),
		);

		const createMutation = useMutation({
			...orpc.admin.licenses.create.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.licenses.list.queryKey(),
				});
			},
		});
		const updateMutation = useMutation({
			...orpc.admin.licenses.update.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.licenses.list.queryKey(),
				});
			},
		});

		const productOptions = (productsQuery.data?.items ?? []).map((item) => ({
			value: item.id,
			label: item.name,
			description: undefined as string | undefined,
		}));
		const customerOptions = (customersQuery.data?.items ?? []).map((item) => ({
			value: item.id,
			label: item.companyName ?? item.name,
			description:
				[item.companySlug, item.email].filter(Boolean).join(" · ") || undefined,
		}));

		const insertProduct = (created: Product) => {
			queryClient.setQueryData(
				orpc.admin.products.list.queryKey({ input: PICKER_INPUT }),
				(old) =>
					old && !old.items.some((item) => item.id === created.id)
						? { ...old, items: [created, ...old.items], total: old.total + 1 }
						: old,
			);
		};
		const insertCustomer = (created: Customer) => {
			queryClient.setQueryData(
				orpc.admin.customers.list.queryKey({ input: PICKER_INPUT }),
				(old) =>
					old && !old.items.some((item) => item.id === created.id)
						? { ...old, items: [created, ...old.items], total: old.total + 1 }
						: old,
			);
		};

		const form = useForm({
			defaultValues: {
				productId: "",
				customerId: "",
				type: "monthly" as LicenseType,
				expiresAt: initialValues?.license.expiresAt
					? new Date(initialValues.license.expiresAt).toISOString().slice(0, 16)
					: "",
				maxActivations: initialValues?.license.maxActivations?.toString() ?? "",
				status: initialValues?.license.status ?? ("active" as LicenseStatus),
			},
			onSubmit: async ({ value }) => {
				try {
					if (initialValues) {
						await updateMutation.mutateAsync({
							id: initialValues.license.id,
							status: value.status,
							expiresAt: value.expiresAt
								? new Date(value.expiresAt).toISOString()
								: null,
							maxActivations: value.maxActivations
								? Number.parseInt(value.maxActivations, 10)
								: null,
						});
						toast.success("License updated");
					} else {
						await createMutation.mutateAsync({
							productId: value.productId,
							customerId: value.customerId,
							type: value.type,
							status: value.status,
							expiresAt: value.expiresAt
								? new Date(value.expiresAt).toISOString()
								: null,
							maxActivations: value.maxActivations
								? Number.parseInt(value.maxActivations, 10)
								: null,
						});
						toast.success("License created");
					}
					call.end(true);
				} catch (error) {
					toast.error(
						error instanceof Error ? error.message : "Failed to save license",
					);
				}
			},
		});

		const [productInput, setProductInput] = useState("");
		const [customerInput, setCustomerInput] = useState("");

		return (
			<Sheet
				open={!call.ended}
				modal={!nestedActive}
				onOpenChange={(open) => {
					if (!open && !nestedActive) {
						call.end(false);
					}
				}}
			>
				<SheetContent>
					<SheetHeader>
						<SheetTitle>
							{isEdit ? "Edit license" : "Create license"}
						</SheetTitle>
						<SheetDescription>Manage license settings.</SheetDescription>
					</SheetHeader>
					<form
						className="grid gap-4 p-4"
						onSubmit={(event) => {
							event.preventDefault();
							event.stopPropagation();
							form.handleSubmit();
						}}
					>
						{!isEdit && (
							<>
								<form.Field name="productId">
									{(field) => {
										const selected =
											productOptions.find(
												(item) => item.value === field.state.value,
											) ?? null;
										return (
											<div className="space-y-2">
												<Label>Product</Label>
												<div className="flex items-center gap-2">
													<div className="min-w-0 flex-1">
														<Combobox
															items={productOptions}
															value={selected}
															onValueChange={(item) => {
																field.handleChange(item?.value ?? "");
																setProductInput(item?.label ?? "");
															}}
															isItemEqualToValue={(a, b) => a.value === b.value}
															itemToStringLabel={(item) => item.label}
															itemToStringValue={(item) => item.value}
															inputValue={productInput}
															onInputValueChange={setProductInput}
														>
															<ComboboxInput placeholder="Select a product" />
															<ComboboxContent>
																<ComboboxEmpty>
																	No products found.
																</ComboboxEmpty>
																<ComboboxList>
																	<ComboboxCollection>
																		{(item) => (
																			<ComboboxItem
																				key={item.value}
																				value={item}
																			>
																				{item.label}
																			</ComboboxItem>
																		)}
																	</ComboboxCollection>
																</ComboboxList>
															</ComboboxContent>
														</Combobox>
													</div>
													<Button
														type="button"
														variant="outline"
														size="icon"
														aria-label="New product"
														onClick={async () => {
															const created = await runNested(() =>
																ProductSheet.call({}),
															);
															if (!created) return;
															insertProduct(created);
															field.handleChange(created.id);
															setProductInput(created.name);
														}}
													>
														<PlusIcon />
													</Button>
												</div>
											</div>
										);
									}}
								</form.Field>
								<form.Field name="customerId">
									{(field) => {
										const selected =
											customerOptions.find(
												(item) => item.value === field.state.value,
											) ?? null;
										return (
											<div className="space-y-2">
												<Label>Customer</Label>
												<div className="flex items-center gap-2">
													<div className="min-w-0 flex-1">
														<Combobox
															items={customerOptions}
															value={selected}
															onValueChange={(item) => {
																field.handleChange(item?.value ?? "");
																setCustomerInput(item?.label ?? "");
															}}
															isItemEqualToValue={(a, b) => a.value === b.value}
															itemToStringLabel={(item) => item.label}
															itemToStringValue={(item) => item.value}
															inputValue={customerInput}
															onInputValueChange={setCustomerInput}
														>
															<ComboboxInput placeholder="Select a customer" />
															<ComboboxContent>
																<ComboboxEmpty>
																	No customers found.
																</ComboboxEmpty>
																<ComboboxList>
																	<ComboboxCollection>
																		{(item) => (
																			<ComboboxItem
																				key={item.value}
																				value={item}
																			>
																				<div className="flex flex-col">
																					<span>{item.label}</span>
																					{item.description && (
																						<span className="text-muted-foreground text-xs">
																							{item.description}
																						</span>
																					)}
																				</div>
																			</ComboboxItem>
																		)}
																	</ComboboxCollection>
																</ComboboxList>
															</ComboboxContent>
														</Combobox>
													</div>
													<Button
														type="button"
														variant="outline"
														size="icon"
														aria-label="New customer"
														onClick={async () => {
															const created = await runNested(() =>
																CustomerSheet.call({}),
															);
															if (!created) return;
															insertCustomer(created);
															field.handleChange(created.id);
															setCustomerInput(
																created.companyName ?? created.name,
															);
														}}
													>
														<PlusIcon />
													</Button>
												</div>
											</div>
										);
									}}
								</form.Field>
								<form.Field name="type">
									{(field) => (
										<div className="space-y-2">
											<Label>Type</Label>
											<Select
												value={field.state.value}
												onValueChange={(v) =>
													field.handleChange(v as LicenseType)
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="trial">Trial</SelectItem>
													<SelectItem value="monthly">Monthly</SelectItem>
													<SelectItem value="yearly">Yearly</SelectItem>
													<SelectItem value="lifetime">Lifetime</SelectItem>
												</SelectContent>
											</Select>
										</div>
									)}
								</form.Field>
							</>
						)}
						<form.Field name="expiresAt">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={`${call.key}-expires`}>
										Expires at (optional)
									</Label>
									<Input
										id={`${call.key}-expires`}
										type="datetime-local"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="maxActivations">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={`${call.key}-max`}>
										Max activations (optional)
									</Label>
									<Input
										id={`${call.key}-max`}
										type="number"
										min={1}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="status">
							{(field) => (
								<div className="space-y-2">
									<Label>Status</Label>
									<Select
										value={field.state.value}
										onValueChange={(v) =>
											field.handleChange(v as LicenseStatus)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="active">Active</SelectItem>
											<SelectItem value="suspended">Suspended</SelectItem>
											<SelectItem value="expired">Expired</SelectItem>
											<SelectItem value="revoked">Revoked</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>
						<SheetFooter>
							<form.Subscribe>
								{(state) => (
									<Button
										type="submit"
										disabled={!state.canSubmit || state.isSubmitting}
									>
										{state.isSubmitting ? "Saving…" : "Save"}
									</Button>
								)}
							</form.Subscribe>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		);
	},
	UNMOUNT_DELAY,
);
