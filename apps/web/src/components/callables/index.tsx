import { CustomerSheet } from "./customer-sheet";
import { LicenseSheet } from "./license-sheet";
import { ProductSheet } from "./product-sheet";

export type { Customer } from "./customer-sheet";
export { CustomerSheet } from "./customer-sheet";
export type {
	LicenseEditValues,
	LicenseRow,
	LicenseStatus,
	LicenseType,
} from "./license-sheet";
export { LicenseSheet } from "./license-sheet";
export type { Product } from "./product-sheet";
export { ProductSheet } from "./product-sheet";

/**
 * Roots of every Callable. Must be mounted exactly once, in a subtree that is
 * always alive (the root layout).
 */
export function AppCallables() {
	return (
		<>
			<ProductSheet />
			<CustomerSheet />
			<LicenseSheet />
		</>
	);
}
