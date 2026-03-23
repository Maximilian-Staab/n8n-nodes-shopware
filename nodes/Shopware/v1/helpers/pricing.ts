import type { GenericPrice } from '../actions/order/types';

interface TaxEntry {
	net: number;
	tax: number;
	taxRate: number;
	gross: number;
}

interface TaxSummary {
	calculatedTaxes: GenericPrice['calculatedTaxes'];
	taxRules: GenericPrice['taxRules'];
	taxTotal: number;
	totalPrice: number;
	netPrice: number;
}

export interface OrderTotalsResult extends TaxSummary {
	quantity: number;
}

export function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function summarizeTaxes(entries: TaxEntry[]): TaxSummary {
	const groupedEntries = new Map<number, { net: number; tax: number; gross: number }>();

	for (const entry of entries) {
		const existingEntry = groupedEntries.get(entry.taxRate) ?? { net: 0, tax: 0, gross: 0 };
		groupedEntries.set(entry.taxRate, {
			net: roundCurrency(existingEntry.net + entry.net),
			tax: roundCurrency(existingEntry.tax + entry.tax),
			gross: roundCurrency(existingEntry.gross + entry.gross),
		});
	}

	const netPrice = roundCurrency(entries.reduce((acc, entry) => acc + entry.net, 0));
	const taxTotal = roundCurrency(entries.reduce((acc, entry) => acc + entry.tax, 0));
	const totalPrice = roundCurrency(entries.reduce((acc, entry) => acc + entry.gross, 0));

	const sortedTaxGroups = Array.from(groupedEntries.entries()).sort(([a], [b]) => a - b);
	const calculatedTaxes = sortedTaxGroups.map(([taxRate, values]) => ({
		tax: values.tax,
		taxRate,
		price: values.gross,
	}));
	const taxRules = sortedTaxGroups.map(([taxRate, values]) => ({
		taxRate,
		percentage: netPrice === 0 ? 0 : roundCurrency((values.net / netPrice) * 100),
	}));

	return {
		calculatedTaxes,
		taxRules,
		taxTotal,
		totalPrice,
		netPrice,
	};
}

/**
 * Calculates the net price from a gross price and tax rate.
 *
 * @param gross - The gross price
 * @param taxRate - The tax rate percentage
 * @returns The net price rounded to 2 decimal places
 */
export function calculateNetFromGross(gross: number, taxRate: number): number {
	return roundCurrency(gross / (1 + taxRate / 100));
}

export interface LineItemPriceResult {
	unitPrice: number;
	totalPrice: number;
	tax: number;
	taxPrice: number;
}

/**
 * Calculates line item price components from a gross unit price, quantity, and tax rate.
 *
 * @param grossUnitPrice - The gross unit price (including tax)
 * @param quantity - The quantity
 * @param taxRate - The tax rate percentage
 * @returns An object with unitPrice (gross), totalPrice (gross), tax, and taxPrice (gross total)
 */
export function calculateLineItemPrice(
	grossUnitPrice: number,
	quantity: number,
	taxRate: number,
): LineItemPriceResult {
	const roundedUnitPrice = roundCurrency(grossUnitPrice);
	const totalPrice = roundCurrency(roundedUnitPrice * quantity);
	const tax = roundCurrency(totalPrice - totalPrice / (1 + taxRate / 100));
	const taxPrice = totalPrice;

	return { unitPrice: roundedUnitPrice, totalPrice, tax, taxPrice };
}

/**
 * Aggregates order totals and tax breakdown from line items.
 *
 * @param lineItems - Array of line items with price and quantity data
 * @returns Order totals, tax totals, tax breakdown, and total quantity
 */
export function calculateOrderTotals(
	lineItems: Array<{
		quantity: number;
		price: {
			calculatedTaxes: GenericPrice['calculatedTaxes'];
		};
	}>,
): OrderTotalsResult {
	const entries = lineItems.flatMap((lineItem) =>
		lineItem.price.calculatedTaxes.map((calculatedTax) => ({
			net: roundCurrency(calculatedTax.price - calculatedTax.tax),
			tax: roundCurrency(calculatedTax.tax),
			taxRate: calculatedTax.taxRate,
			gross: roundCurrency(calculatedTax.price),
		})),
	);
	const summary = summarizeTaxes(entries);
	const quantity = lineItems.reduce((acc, item) => acc + item.quantity, 0);

	return {
		...summary,
		quantity,
	};
}

/**
 * Aggregates net, gross, and tax data from GenericPrice entries.
 *
 * @param prices - Array of GenericPrice values to combine
 * @returns A single GenericPrice with merged tax breakdown
 */
export function aggregateGenericPrices(prices: GenericPrice[]): GenericPrice {
	const entries = prices.flatMap((price) =>
		price.calculatedTaxes.map((calculatedTax) => ({
			net: roundCurrency(calculatedTax.price - calculatedTax.tax),
			tax: roundCurrency(calculatedTax.tax),
			taxRate: calculatedTax.taxRate,
			gross: roundCurrency(calculatedTax.price),
		})),
	);
	const summary = summarizeTaxes(entries);

	return {
		unitPrice: summary.netPrice,
		totalPrice: summary.netPrice,
		quantity: 1,
		calculatedTaxes: summary.calculatedTaxes,
		taxRules: summary.taxRules,
	};
}

/**
 * Builds a GenericPrice object from a base price and tax information.
 * Used for shipping costs and transaction amounts.
 *
 * @param basePrice - The base unit price
 * @param taxRate - The tax rate percentage
 * @param quantity - The quantity (defaults to 1)
 * @returns A GenericPrice object
 */
export function buildGenericPrice(
	basePrice: number,
	taxRate: number,
	quantity: number = 1,
): GenericPrice {
	const unitPrice = roundCurrency(basePrice);
	const totalPrice = roundCurrency(unitPrice * quantity);
	const tax = roundCurrency(totalPrice * (taxRate / 100));
	const taxPrice = roundCurrency(totalPrice + tax);

	return {
		unitPrice,
		totalPrice,
		quantity,
		calculatedTaxes: [
			{
				tax,
				taxRate,
				price: taxPrice,
			},
		],
		taxRules: [
			{
				taxRate,
				percentage: 100,
			},
		],
	};
}
