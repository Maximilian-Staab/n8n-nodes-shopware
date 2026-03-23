/* eslint-disable n8n-nodes-base/node-param-description-wrong-for-dynamic-options */
/* eslint-disable n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options */
/* We only allow to select existing entities (e.g. categories, manufacturers, tax rates, etc.) by name for UX convenience. Therefore, we disable the relevant ESLint rules. */

import {
	type INodeExecutionData,
	type INodeProperties,
	type IExecuteFunctions,
	type JsonObject,
	NodeApiError,
	updateDisplayOptions,
	NodeOperationError,
	randomString,
} from 'n8n-workflow';
import type {
	Address,
	AddressValues,
	CustomerData,
	Delivery,
	GenericPrice,
	GlobalDefaults,
	OrderCustomer,
	Transaction,
} from './types';
import { apiRequest } from '../../transport';
import { orderFields } from './fields';
import {
	wrapData,
	uuidv7,
	getCustomerByNumber,
	getLineItemDataBatch,
	getShippingMethodFullData,
	getDefaultShippingMethod,
	getDefaultLanguageId,
} from '../../helpers/utils';
import {
	buildLineItemPayload,
	buildDeliveryPayload,
	buildOrderAddressPayload,
	buildTransactionPayload,
	aggregateDeliveryShippingCosts,
	buildOrderPrice,
	buildOrderCreatePayload,
	cleanPayload,
} from '../../helpers/payloadBuilders';
import { calculateOrderTotals } from '../../helpers/pricing';
import { extractOrderCreateParams } from '../../helpers/params';

const properties: INodeProperties[] = [
	{
		displayName: 'Order Number',
		name: 'orderNumber',
		type: 'string',
		default: '',
		placeholder: 'e.g. ON752834790',
		description: 'Optional order identifier',
	},
	{
		displayName: 'Date and Time',
		name: 'dateAndTime',
		type: 'dateTime',
		required: true,
		default: '',
		description: 'Optional order date and time',
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'options',
		required: true,
		typeOptions: {
			loadOptionsMethod: 'getOrderCurrencies',
		},
		default: '',
		description: 'Choose the order currency from the list',
	},
	{
		displayName: 'State',
		name: 'state',
		type: 'options',
		required: true,
		typeOptions: {
			loadOptionsMethod: 'getOrderStates',
		},
		default: '',
		description: 'Choose the order state from the list',
	},
	{
		displayName: 'Guest Order',
		name: 'guestOrder',
		type: 'boolean',
		default: false,
		description: 'Whether the order is a guest order',
	},
	{
		displayName: 'Guest',
		name: 'guestUi',
		placeholder: 'Add Guest Details',
		type: 'fixedCollection',
		default: {},
		typeOptions: {
			multipleValues: false,
		},
		displayOptions: {
			show: {
				guestOrder: [true],
			},
		},
		description: 'Add guest order details',
		options: [
			{
				name: 'guestValues',
				displayName: 'Guest Details',
				values: [
					{
						displayName: 'First Name',
						name: 'firstName',
						type: 'string',
						required: true,
						default: '',
						description: 'Guest customer first name',
					},
					{
						displayName: 'Last Name',
						name: 'lastName',
						type: 'string',
						required: true,
						default: '',
						description: 'Guest customer last name',
					},
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						placeholder: 'name@email.com',
						required: true,
						default: '',
						description: 'Guest customer email',
					},
					{
						displayName: 'Salutation',
						name: 'salutation',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getSalutations',
						},
						required: true,
						default: '',
						description: 'Guest customer salutation',
					},
				],
			},
		],
	},
	{
		displayName: 'Billing Address',
		name: 'billingAddressUi',
		placeholder: 'Add Billing Address',
		type: 'fixedCollection',
		default: {},
		typeOptions: {
			multipleValues: false,
		},
		displayOptions: {
			show: {
				guestOrder: [true],
			},
		},
		description: 'Add guest billing address',
		options: [
			{
				name: 'billingAddressValues',
				displayName: 'Billing Address',
				values: [
					{
						displayName: 'Country',
						name: 'country',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getCountries',
						},
						required: true,
						default: '',
						description: 'Country of the billing address',
					},
					{
						displayName: 'First Name',
						name: 'firstName',
						type: 'string',
						required: true,
						default: '',
						description: 'Customer first name',
					},
					{
						displayName: 'Last Name',
						name: 'lastName',
						type: 'string',
						required: true,
						default: '',
						description: 'Customer last name',
					},
					{
						displayName: 'City',
						name: 'city',
						type: 'string',
						required: true,
						default: '',
						description: 'Billing address city',
					},
					{
						displayName: 'Street',
						name: 'street',
						type: 'string',
						required: true,
						default: '',
						description: 'Billing address street',
					},
				],
			},
		],
	},
	{
		displayName: 'Shipping Address',
		name: 'shippingAddressUi',
		placeholder: 'Add Shipping Address',
		type: 'fixedCollection',
		default: {},
		typeOptions: {
			multipleValues: false,
		},
		displayOptions: {
			show: {
				guestOrder: [true],
			},
		},
		description: 'Add guest shipping address',
		options: [
			{
				name: 'shippingAddressValues',
				displayName: 'Shipping Address',
				values: [
					{
						displayName: 'Country',
						name: 'country',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getCountries',
						},
						required: true,
						default: '',
						description: 'Country of the shipping address',
					},
					{
						displayName: 'First Name',
						name: 'firstName',
						type: 'string',
						required: true,
						default: '',
						description: 'Customer first name',
					},
					{
						displayName: 'Last Name',
						name: 'lastName',
						type: 'string',
						required: true,
						default: '',
						description: 'Customer last name',
					},
					{
						displayName: 'City',
						name: 'city',
						type: 'string',
						required: true,
						default: '',
						description: 'Shipping address city',
					},
					{
						displayName: 'Street',
						name: 'street',
						type: 'string',
						required: true,
						default: '',
						description: 'Shipping address street',
					},
				],
			},
		],
	},
	{
		displayName: 'Sales Channel',
		name: 'salesChannel',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getSalesChannels',
		},
		displayOptions: {
			show: {
				guestOrder: [true],
			},
		},
		default: '',
		description: 'Select sales channel for the guest order',
	},
	{
		displayName: 'Customer Number',
		name: 'customerNumber',
		type: 'string',
		displayOptions: {
			show: {
				guestOrder: [false],
			},
		},
		default: '',
		placeholder: 'e.g. C10001',
		description: 'Number of the order customer',
	},
	{
		displayName: 'Line Items',
		name: 'lineItems',
		placeholder: 'Add Line Item',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		description: 'Order line items',
		default: {},
		options: [
			{
				name: 'lineItem',
				displayName: 'Line Item',
				values: [
					{
						displayName: 'Product Number',
						name: 'productNumber',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'e.g. P10001',
						description: 'Line item product number',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						typeOptions: {
							maxValue: 999000000,
							minValue: 1,
						},
						required: true,
						default: 1,
						placeholder: 'e.g. 5',
						description: 'Line item quantity',
					},
				],
			},
		],
	},
	{
		displayName: 'Transactions',
		name: 'transactions',
		placeholder: 'Add Transaction',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		description: 'Order transactions',
		default: {},
		options: [
			{
				name: 'transaction',
				displayName: 'Transaction',
				values: [
					{
						displayName: 'Payment Method',
						name: 'paymentMethod',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getPaymentMethods',
						},
						required: true,
						default: '',
						description: 'Transaction payment method',
					},
					{
						displayName: 'State',
						name: 'state',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTransactionStates',
						},
						required: true,
						default: '',
						description: 'State of the transaction (e.g. Paid)',
					},
				],
			},
		],
	},
	{
		displayName: 'Deliveries',
		name: 'deliveries',
		placeholder: 'Add Delivery',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		description: 'Order deliveries',
		default: {},
		options: [
			{
				name: 'delivery',
				displayName: 'Delivery',
				values: [
					{
						displayName: 'Shipping Method',
						name: 'shippingMethod',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getShippingMethods',
						},
						required: true,
						default: '',
						description: 'Delivery shipping method',
					},
					{
						displayName: 'State',
						name: 'state',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getDeliveryStates',
						},
						required: true,
						default: '',
						description: 'State of the delivery (e.g. Shipped)',
					},
					{
						displayName: 'Use Customer Shipping Address',
						name: 'customerShippingAddress',
						type: 'boolean',
						default: true,
						description: 'Whether to use the customer shipping address',
					},
					{
						displayName: 'Address',
						name: 'addressUi',
						placeholder: 'Add Address',
						type: 'fixedCollection',
						default: {},
						typeOptions: {
							multipleValues: false,
						},
						displayOptions: {
							show: {
								customerShippingAddress: [false],
							},
						},
						description: 'Add delivery shipping address',
						options: [
							{
								name: 'addressValues',
								displayName: 'Address',
								values: [
									{
										displayName: 'Country',
										name: 'country',
										type: 'options',
										typeOptions: {
											loadOptionsMethod: 'getCountries',
										},
										required: true,
										default: '',
										description: 'Country of the shippng address',
									},
									{
										displayName: 'First Name',
										name: 'firstName',
										type: 'string',
										required: true,
										default: '',
										description: 'Customer first name',
									},
									{
										displayName: 'Last Name',
										name: 'lastName',
										type: 'string',
										required: true,
										default: '',
										description: 'Customer last name',
									},
									{
										displayName: 'City',
										name: 'city',
										type: 'string',
										required: true,
										default: '',
										description: 'Shipping address city',
									},
									{
										displayName: 'Street',
										name: 'street',
										type: 'string',
										required: true,
										default: '',
										description: 'Shipping address street',
									},
								],
							},
						],
					},
				],
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['order'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	let defaultLanguageIdPromise: Promise<string> | undefined;
	let defaultShippingMethodPromise: Promise<string> | undefined;
	const shippingMethodDataCache = new Map<
		string,
		Promise<Awaited<ReturnType<typeof getShippingMethodFullData>>>
	>();

	for (let i = 0; i < items.length; i++) {
		try {
			const orderId = uuidv7();

			const params = extractOrderCreateParams.call(this, i);
			const lineItemLookup = await getLineItemDataBatch.call(
				this,
				(params.nodeLineItems ?? []).map((lineItem) => lineItem.productNumber),
				params.currencyData[0] as string,
				i,
			);

			const customerData: Partial<CustomerData> = {};
			const globalDefaults: Partial<GlobalDefaults> = {};
			let orderCustomer: OrderCustomer;

			if (params.customerNumber) {
				const customer = await getCustomerByNumber.call(this, params.customerNumber, i);
				globalDefaults.languageId = customer.languageId;
				globalDefaults.salesChannelId = customer.salesChannelId;
				customerData.firstName = customer.firstName;
				customerData.lastName = customer.lastName;
				customerData.email = customer.email;
				customerData.salutationId = customer.salutationId;
				customerData.billingAddress = customer.billingAddress;
				customerData.shippingAddress = customer.shippingAddress;
				orderCustomer = {
					firstName: customer.firstName,
					lastName: customer.lastName,
					email: customer.email,
					salutationId: customer.salutationId,
					customerId: customer.id,
					customerNumber: params.customerNumber,
				};
			} else {
				defaultLanguageIdPromise ??= getDefaultLanguageId.call(this);
				globalDefaults.languageId = await defaultLanguageIdPromise;
				globalDefaults.salesChannelId = params.salesChannel!;
				customerData.firstName = params.guest!.firstName;
				customerData.lastName = params.guest!.lastName;
				customerData.email = params.guest!.email;
				customerData.salutationId = params.guest!.salutation;
				customerData.billingAddress = {
					id: uuidv7(),
					countryId: params.guestBillingAddress!.country,
					firstName: params.guestBillingAddress!.firstName,
					lastName: params.guestBillingAddress!.lastName,
					city: params.guestBillingAddress!.city,
					street: params.guestBillingAddress!.street,
				};
				customerData.shippingAddress = {
					id: uuidv7(),
					countryId: params.guestShippingAddress!.country,
					firstName: params.guestShippingAddress!.firstName,
					lastName: params.guestShippingAddress!.lastName,
					city: params.guestShippingAddress!.city,
					street: params.guestShippingAddress!.street,
				};
				orderCustomer = {
					firstName: params.guest!.firstName,
					lastName: params.guest!.lastName,
					email: params.guest!.email,
					salutationId: params.guest!.salutation,
					customerNumber: 'guest-' + randomString(6),
				};
			}

			if (!params.nodeLineItems || params.nodeLineItems.length === 0) {
				throw new NodeOperationError(this.getNode(), 'Missing order line items', {
					description: 'At least one line item must be provided',
					itemIndex: i,
				});
			}

			const lineItems = await Promise.all(
				params.nodeLineItems.map(async (lineItem) => {
					const itemData = lineItemLookup.get(lineItem.productNumber);
					if (!itemData) {
						throw new NodeOperationError(this.getNode(), 'No product found', {
							description: 'There is no product associated with product number ' + lineItem.productNumber,
							itemIndex: i,
						});
					}
					return buildLineItemPayload({ ...itemData, quantity: lineItem.quantity });
				}),
			);

			const orderTotals = calculateOrderTotals(lineItems);
			const price = buildOrderPrice({
				netPrice: orderTotals.netPrice,
				totalPrice: orderTotals.totalPrice,
				calculatedTaxes: orderTotals.calculatedTaxes,
				taxRules: orderTotals.taxRules,
			});

			let transactions: Transaction[] = [];
			if (params.nodeTransactions && params.nodeTransactions.length > 0) {
				transactions = params.nodeTransactions.map((transaction) =>
					buildTransactionPayload({
						paymentMethodId: transaction.paymentMethod,
						stateId: transaction.state,
						netPrice: orderTotals.netPrice,
						totalPrice: orderTotals.totalPrice,
						quantity: orderTotals.quantity,
						calculatedTaxes: orderTotals.calculatedTaxes,
						taxRules: orderTotals.taxRules,
					}),
				);
			}

			const customerShippingAddress: Address = buildOrderAddressPayload({
				id: customerData.shippingAddress!.id,
				countryId: customerData.shippingAddress!.countryId,
				firstName: customerData.shippingAddress!.firstName,
				lastName: customerData.shippingAddress!.lastName,
				city: customerData.shippingAddress!.city,
				street: customerData.shippingAddress!.street,
			});

			let deliveries: Delivery[] = [];
			if (params.nodeDeliveries && params.nodeDeliveries.length > 0) {
				deliveries = await Promise.all(
					params.nodeDeliveries.map(async (delivery) => {
						let shippingAddress: Address;

						if (delivery.customerShippingAddress) {
							shippingAddress = { ...customerShippingAddress, id: uuidv7() };
						} else {
							const address = delivery.addressUi.addressValues;
							if (!address) {
								throw new NodeOperationError(this.getNode(), 'Missing shipping address', {
									description: 'A shipping address must be provided for the selected delivery if not using the customer one',
									itemIndex: i,
								});
							}
							for (const key in address) {
								if (address[key as keyof AddressValues] === '') {
									throw new NodeOperationError(this.getNode(), 'Missing required value for shipping address', {
										description: `Shipping address ${key} must be a valid value.`,
										itemIndex: i,
									});
								}
							}
							shippingAddress = buildOrderAddressPayload({
								id: uuidv7(),
								countryId: address.country,
								firstName: address.firstName,
								lastName: address.lastName,
								city: address.city,
								street: address.street,
							});
						}
						const shippingMethodDataKey = `${delivery.shippingMethod}:${params.currencyData[0] as string}`;
						if (!shippingMethodDataCache.has(shippingMethodDataKey)) {
							shippingMethodDataCache.set(
								shippingMethodDataKey,
								Promise.resolve(
									getShippingMethodFullData.call(this, delivery.shippingMethod, params.currencyData[0] as string),
								),
							);
						}
						const shippingMethodData = await shippingMethodDataCache.get(shippingMethodDataKey)!;
						return buildDeliveryPayload({
							shippingAddress,
							shippingMethodId: delivery.shippingMethod,
							stateId: delivery.state,
							shippingPrice: shippingMethodData.unitPrice,
							shippingTaxRate: shippingMethodData.taxRate,
							deliveryTime: shippingMethodData.deliveryTime,
							lineItems,
							uuidFn: uuidv7,
						});
					}),
				);
			}

			let shippingCosts: GenericPrice;
			if (deliveries.length === 0) {
				defaultShippingMethodPromise ??= getDefaultShippingMethod.call(this);
				const defaultShippingMethod = await defaultShippingMethodPromise;
				const shippingMethodDataKey = `${defaultShippingMethod}:${params.currencyData[0] as string}`;
				if (!shippingMethodDataCache.has(shippingMethodDataKey)) {
					shippingMethodDataCache.set(
						shippingMethodDataKey,
						Promise.resolve(
							getShippingMethodFullData.call(this, defaultShippingMethod, params.currencyData[0] as string),
						),
					);
				}
				const shippingMethodData = await shippingMethodDataCache.get(shippingMethodDataKey)!;
				deliveries = [
					buildDeliveryPayload({
						shippingAddress: { ...customerShippingAddress, id: uuidv7() },
						shippingMethodId: defaultShippingMethod,
						stateId: params.stateId,
						shippingPrice: shippingMethodData.unitPrice,
						shippingTaxRate: shippingMethodData.taxRate,
						deliveryTime: shippingMethodData.deliveryTime,
						lineItems,
						uuidFn: uuidv7,
					}),
				];
				shippingCosts = aggregateDeliveryShippingCosts(deliveries);
			} else {
				shippingCosts = aggregateDeliveryShippingCosts(deliveries);
			}

			const createBody = buildOrderCreatePayload({
				orderId,
				currencyData: params.currencyData,
				globalDefaults,
				customerData,
				orderCustomer,
				lineItems,
				price,
				shippingCosts,
				transactions,
				deliveries,
				orderNumber: params.orderNumber,
				dateAndTime: params.dateAndTime,
				stateId: params.stateId,
			});

			cleanPayload(createBody);

			await apiRequest.call(this, 'POST', `/order`, createBody);

			const searchBody = {
				fields: orderFields,
				includes: { order: orderFields },
				filter: [{ type: 'equals', field: 'id', value: orderId }],
				associations: {
					currency: {},
					deliveries: {},
					transactions: {},
					lineItems: {},
				},
			};
			const response = await apiRequest.call(this, 'POST', `/search/order`, searchBody);

			const executionData = this.helpers.constructExecutionMetaData(wrapData(response.data), {
				itemData: { item: i },
			});

			returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: error.message } });
				continue;
			}

			if (error instanceof NodeOperationError || error instanceof NodeApiError) {
				throw error;
			}

			throw new NodeApiError(this.getNode(), error as JsonObject);
		}
	}

	return returnData;
}
