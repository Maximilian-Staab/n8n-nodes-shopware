import type { GenericPrice } from '../actions/order/types';

/**
 * Calculates the net price from a gross price and tax rate.
 *
 * @param gross - The gross price
 * @param taxRate - The tax rate percentage
 * @returns The net price rounded to 2 decimal places
 */
export function calculateNetFromGross(gross: number, taxRate: number): number {
	return parseFloat((gross / (1 + taxRate / 100)).toFixed(2));
}

export interface LineItemPriceResult {
	unitPrice: number;
	totalPrice: number;
	tax: number;
	taxPrice: number;
}

/**
 * Calculates line item price components from a unit price, quantity, and tax rate.
 *
 * @param unitPrice - The unit price (net)
 * @param quantity - The quantity
 * @param taxRate - The tax rate percentage
 * @returns An object with unitPrice, totalPrice, tax, and taxPrice
 */
export function calculateLineItemPrice(
	unitPrice: number,
	quantity: number,
	taxRate: number,
): LineItemPriceResult {
	const totalPrice = unitPrice * quantity;
	const tax = totalPrice * (taxRate / 100);
	const taxPrice = totalPrice + tax;

	return { unitPrice, totalPrice, tax, taxPrice };
}

/**
 * Sums the totalPrice of all line items.
 *
 * @param lineItems - Array of objects with a price.totalPrice property
 * @returns The sum of all line item totalPrices
 */
export function calculateOrderTotals(
	lineItems: Array<{ price: { totalPrice: number } }>,
): number {
	return lineItems.reduce((acc, item) => acc + item.price.totalPrice, 0);
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
	const tax = basePrice * (taxRate / 100);
	const taxPrice = basePrice + tax;

	return {
		unitPrice: basePrice,
		totalPrice: basePrice,
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
