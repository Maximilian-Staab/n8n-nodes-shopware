import { buildLineItemPayload } from '../../../v1/helpers/payloadBuilders';
import {
	aggregateGenericPrices,
	buildGenericPrice,
	calculateLineItemPrice,
	calculateNetFromGross,
	calculateOrderTotals,
} from '../../../v1/helpers/pricing';

describe('pricing helpers', () => {
	it('calculates net from gross with cent rounding', () => {
		expect(calculateNetFromGross(11.99, 19)).toBe(10.08);
	});

	it('rounds line item price components consistently', () => {
		expect(calculateLineItemPrice(19.99, 3, 19)).toEqual({
			unitPrice: 19.99,
			totalPrice: 59.97,
			tax: 11.39,
			taxPrice: 71.36,
		});
	});

	it('aggregates mixed line-item tax rates into order totals', () => {
		const lineItems = [
			buildLineItemPayload({
				identifier: 'line-1',
				productId: 'product-1',
				productNumber: 'SW10001',
				label: 'Tax 10',
				states: [],
				unitPrice: 10,
				taxRate: 10,
				quantity: 1,
			}),
			buildLineItemPayload({
				identifier: 'line-2',
				productId: 'product-2',
				productNumber: 'SW10002',
				label: 'Tax 20',
				states: [],
				unitPrice: 20,
				taxRate: 20,
				quantity: 1,
			}),
		];

		expect(calculateOrderTotals(lineItems)).toEqual({
			netPrice: 30,
			totalPrice: 35,
			taxTotal: 5,
			quantity: 2,
			calculatedTaxes: [
				{ tax: 1, taxRate: 10, price: 11 },
				{ tax: 4, taxRate: 20, price: 24 },
			],
			taxRules: [
				{ taxRate: 10, percentage: 33.33 },
				{ taxRate: 20, percentage: 66.67 },
			],
		});
	});

	it('aggregates generic prices across mixed tax rates', () => {
		const shippingCosts = aggregateGenericPrices([
			buildGenericPrice(10, 10),
			buildGenericPrice(20, 20),
		]);

		expect(shippingCosts).toEqual({
			unitPrice: 30,
			totalPrice: 30,
			quantity: 1,
			calculatedTaxes: [
				{ tax: 1, taxRate: 10, price: 11 },
				{ tax: 4, taxRate: 20, price: 24 },
			],
			taxRules: [
				{ taxRate: 10, percentage: 33.33 },
				{ taxRate: 20, percentage: 66.67 },
			],
		});
	});
});
