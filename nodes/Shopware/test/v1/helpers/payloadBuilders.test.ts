import {
	aggregateDeliveryShippingCosts,
	aggregateDeliveryShippingCostsWithExisting,
	buildCustomerAddresses,
	buildOrderCreatePayload,
	buildOrderPrice,
	buildTransactionPayload,
} from '../../../v1/helpers/payloadBuilders';
import { buildGenericPrice } from '../../../v1/helpers/pricing';

describe('payload builder helpers', () => {
	it('builds order price with aggregated tax data', () => {
		expect(
			buildOrderPrice({
				netPrice: 30,
				totalPrice: 35,
				calculatedTaxes: [
					{ tax: 1, taxRate: 10, price: 11 },
					{ tax: 4, taxRate: 20, price: 24 },
				],
				taxRules: [
					{ taxRate: 10, percentage: 33.33 },
					{ taxRate: 20, percentage: 66.67 },
				],
			}),
		).toEqual({
			netPrice: 30,
			totalPrice: 35,
			calculatedTaxes: [
				{ tax: 1, taxRate: 10, price: 11 },
				{ tax: 4, taxRate: 20, price: 24 },
			],
			taxRules: [
				{ taxRate: 10, percentage: 33.33 },
				{ taxRate: 20, percentage: 66.67 },
			],
			positionPrice: 35,
			rawTotal: 35,
			taxStatus: 'gross',
		});
	});

	it('builds transaction amounts from aggregated tax data', () => {
		expect(
			buildTransactionPayload({
				paymentMethodId: 'payment-id',
				stateId: 'state-id',
				netPrice: 30,
				totalPrice: 35,
				quantity: 2,
				calculatedTaxes: [
					{ tax: 1, taxRate: 10, price: 11 },
					{ tax: 4, taxRate: 20, price: 24 },
				],
				taxRules: [
					{ taxRate: 10, percentage: 33.33 },
					{ taxRate: 20, percentage: 66.67 },
				],
			}),
		).toEqual({
			paymentMethodId: 'payment-id',
			stateId: 'state-id',
			amount: {
				unitPrice: 30,
				totalPrice: 35,
				quantity: 2,
				calculatedTaxes: [
					{ tax: 1, taxRate: 10, price: 11 },
					{ tax: 4, taxRate: 20, price: 24 },
				],
				taxRules: [
					{ taxRate: 10, percentage: 33.33 },
					{ taxRate: 20, percentage: 66.67 },
				],
			},
		});
	});

	it('preserves decimal currencyFactor values in order payloads', () => {
		const orderPayload = buildOrderCreatePayload({
			orderId: 'order-id',
			currencyData: [
				'currency-id',
				'EUR',
				'0.85',
				JSON.stringify({ decimals: 2, interval: 0.01, roundForNet: true }),
				JSON.stringify({ decimals: 2, interval: 0.01, roundForNet: false }),
			],
			globalDefaults: {
				languageId: 'language-id',
				salesChannelId: 'sales-channel-id',
			},
			customerData: {
				billingAddress: {
					id: 'billing-id',
					countryId: 'country-id',
					countryStateId: 'state-id',
					salutationId: 'salutation-id',
					firstName: 'Jane',
					lastName: 'Doe',
					zipcode: '10115',
					city: 'Berlin',
					street: 'Example Street 1',
				},
			},
			orderCustomer: {
				firstName: 'Jane',
				lastName: 'Doe',
				email: 'jane@example.com',
				salutationId: 'salutation-id',
				customerNumber: '10001',
			},
			lineItems: [],
			price: buildOrderPrice({
				netPrice: 30,
				totalPrice: 35,
				calculatedTaxes: [{ tax: 5, taxRate: 19, price: 35 }],
				taxRules: [{ taxRate: 19, percentage: 100 }],
			}),
			shippingCosts: buildGenericPrice(5, 19),
			transactions: [],
			deliveries: [],
			orderNumber: '10001',
			dateAndTime: '2026-03-21T10:00:00.000Z',
			stateId: 'state-id',
		});

		expect(orderPayload.currencyFactor).toBe(0.85);
		expect(orderPayload.billingAddress).toEqual({
			id: 'billing-id',
			countryId: 'country-id',
			countryStateId: 'state-id',
			salutationId: 'salutation-id',
			firstName: 'Jane',
			lastName: 'Doe',
			zipcode: '10115',
			city: 'Berlin',
			street: 'Example Street 1',
		});
	});

	it('aggregates delivery shipping costs across mixed rates and existing shipping data', () => {
		const deliveries = [
			{
			id: 'delivery-1',
				shippingOrderAddress: { id: 'address-1', countryId: 'c1', countryStateId: null, salutationId: 'sal-1', firstName: 'A', lastName: 'B', zipcode: '10000', street: 'S', city: 'C' },
				shippingMethodId: 'shipping-1',
				stateId: 'state-1',
				shippingDateEarliest: new Date('2026-03-21T10:00:00.000Z'),
				shippingDateLatest: new Date('2026-03-22T10:00:00.000Z'),
				shippingCosts: buildGenericPrice(10, 10),
				positions: [],
			},
			{
			id: 'delivery-2',
				shippingOrderAddress: { id: 'address-2', countryId: 'c2', countryStateId: null, salutationId: 'sal-2', firstName: 'C', lastName: 'D', zipcode: '20000', street: 'S2', city: 'C2' },
				shippingMethodId: 'shipping-2',
				stateId: 'state-2',
				shippingDateEarliest: new Date('2026-03-21T10:00:00.000Z'),
				shippingDateLatest: new Date('2026-03-23T10:00:00.000Z'),
				shippingCosts: buildGenericPrice(20, 20),
				positions: [],
			},
		];

		expect(aggregateDeliveryShippingCosts(deliveries)).toEqual({
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

		expect(
			aggregateDeliveryShippingCostsWithExisting(deliveries, buildGenericPrice(5, 19)),
		).toEqual({
			unitPrice: 35,
			totalPrice: 35,
			quantity: 1,
			calculatedTaxes: [
				{ tax: 1, taxRate: 10, price: 11 },
				{ tax: 0.95, taxRate: 19, price: 5.95 },
				{ tax: 4, taxRate: 20, price: 24 },
			],
			taxRules: [
				{ taxRate: 10, percentage: 28.57 },
				{ taxRate: 19, percentage: 14.29 },
				{ taxRate: 20, percentage: 57.14 },
			],
		});
	});

	it('builds customer addresses with zipcode and country state', () => {
		const result = buildCustomerAddresses(
			[
				{
					country: 'country-1',
					countryStateId: 'state-1',
					firstName: 'Jane',
					lastName: 'Doe',
					zipcode: '10115',
					city: 'Berlin',
					street: 'Example Street 1',
					defaultShippingAddress: true,
					defaultBillingAddress: true,
				},
			],
			'salutation-id',
			() => 'address-id',
			{} as never,
			0,
		);

		expect(result).toEqual({
			addresses: [
				{
					id: 'address-id',
					countryId: 'country-1',
					countryStateId: 'state-1',
					firstName: 'Jane',
					lastName: 'Doe',
					zipcode: '10115',
					city: 'Berlin',
					street: 'Example Street 1',
					salutationId: 'salutation-id',
				},
			],
			defaultShippingAddressId: 'address-id',
			defaultBillingAddressId: 'address-id',
		});
	});
});
