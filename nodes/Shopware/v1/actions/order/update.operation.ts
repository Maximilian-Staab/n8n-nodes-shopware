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
} from 'n8n-workflow';
import type {
	Address,
	AddressValues,
	CustomerData,
	Delivery,
	GenericPrice,
	Transaction,
	OrderResponse,
} from './types';
import { apiRequest } from '../../transport';
import { orderFields } from './fields';
import {
	wrapData,
	uuidv7,
	getCustomerByNumber,
	getPrePaymentOrderStates,
	getLineItemDataBatch,
	getShippingMethodFullData,
} from '../../helpers/utils';
import { extractOrderUpdateParams } from '../../helpers/params';
import {
	buildLineItemPayload,
	buildDeliveryPayload,
	buildOrderAddressPayload,
	buildTransactionPayload,
	buildOrderPrice,
	buildOrderUpdatePayload,
	aggregateDeliveryShippingCostsWithExisting,
	cleanPayload,
} from '../../helpers/payloadBuilders';
import { calculateOrderTotals } from '../../helpers/pricing';
import { validateShopwareId } from '../../helpers/validation';

const properties: INodeProperties[] = [
	{
		displayName: 'Order ID',
		name: 'id',
		type: 'string',
		default: '',
		placeholder: 'e.g. 2a88d9b59d474...',
		required: true,
		description:
			'ID of the order to update. You can find the ID in the URL when viewing the order in Shopware Admin (e.g. https://your-domain.com/admin#/sw/order/detail/&lt;orderId&gt;).',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{
				displayName: 'Billing Address',
				name: 'billingAddressUi',
				placeholder: 'Add Billing Address',
				type: 'fixedCollection',
				default: {},
				typeOptions: {
					multipleValues: false,
				},
				description: 'Add customer billing address',
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
				displayName: 'Shipping Address',
				name: 'shippingAddressUi',
				placeholder: 'Add Shipping Address',
				type: 'fixedCollection',
				default: {},
				typeOptions: {
					multipleValues: false,
				},
				description: 'Add customer shipping address',
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
				displayName: 'State',
				name: 'state',
				type: 'options',
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
					},
					{
						name: 'Complete',
						value: 'complete',
					},
					{
						name: 'None',
						value: '',
					},
					{
						name: 'Process',
						value: 'process',
					},
					{
						name: 'Reopen',
						value: 'reopen',
					},
				],
				default: '',
				description: 'Choose the order state from the list',
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
		],
	},
];

const displayOptions = {
	show: {
		resource: ['order'],
		operation: ['update'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	let prePaymentOrderStatesPromise: Promise<Array<string>> | undefined;
	const shippingMethodDataCache = new Map<string, Promise<Awaited<ReturnType<typeof getShippingMethodFullData>>>>();

	for (let i = 0; i < items.length; i++) {
		try {
			const params = extractOrderUpdateParams.call(this, i);
			const orderId = validateShopwareId(this.getNode(), params.id, i, 'Order ID');

			// 1. Fetch previous order
			const searchPrevOrderBody = {
				filter: [{ type: 'equals', field: 'id', value: orderId }],
				associations: { currency: {} },
			};
			const prevOrder = (await apiRequest.call(this, 'POST', `/search/order`, searchPrevOrderBody)).data[0] as OrderResponse;
			if (!prevOrder) {
				throw new NodeOperationError(this.getNode(), 'Order does not exist', {
					description: 'There is no order with id ' + orderId,
					itemIndex: i,
				});
			}

			const {
				currency: currencyData,
				shippingCosts: shippingData,
				orderCustomer: prevOrderCustomer,
				...previousOrderData
			} = prevOrder;

			// 2. Resolve address updates
			const customerData: Partial<CustomerData> = {};
			if (params.billingAddress) {
				prePaymentOrderStatesPromise ??= getPrePaymentOrderStates.call(this);
				const prePaymentStates = await prePaymentOrderStatesPromise;
				if (prePaymentStates.includes(previousOrderData.stateId)) {
					customerData.billingAddress = {
						id: uuidv7(),
						countryId: params.billingAddress.country,
						firstName: params.billingAddress.firstName,
						lastName: params.billingAddress.lastName,
						city: params.billingAddress.city,
						street: params.billingAddress.street,
					};
				}
			}
			if (params.shippingAddress) {
				customerData.shippingAddress = {
					id: uuidv7(),
					countryId: params.shippingAddress.country,
					firstName: params.shippingAddress.firstName,
					lastName: params.shippingAddress.lastName,
					city: params.shippingAddress.city,
					street: params.shippingAddress.street,
				};
			}

			// 3. Build line items and order pricing
			let lineItems: ReturnType<typeof buildLineItemPayload>[] = [];
			let price: ReturnType<typeof buildOrderPrice> | null = null;
			let transactions: Transaction[] = [];

			if (params.nodeLineItems) {
				const lineItemLookup = await getLineItemDataBatch.call(
					this,
					params.nodeLineItems.map((lineItem) => lineItem.productNumber),
					currencyData.id,
					i,
				);
				lineItems = await Promise.all(
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
				price = buildOrderPrice({
					netPrice: orderTotals.netPrice,
					totalPrice: orderTotals.totalPrice,
					calculatedTaxes: orderTotals.calculatedTaxes,
					taxRules: orderTotals.taxRules,
				});

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
			}

			if (!params.nodeLineItems && params.nodeTransactions) {
				throw new NodeOperationError(this.getNode(), 'Missing line items for transaction', {
					description: 'Line items are required for order transactions',
					itemIndex: i,
				});
			}

			// 4. Build addresses
			const addresses: Address[] = [];
			if (params.shippingAddress && customerData.shippingAddress) {
				addresses.push(buildOrderAddressPayload({
					id: customerData.shippingAddress.id,
					countryId: customerData.shippingAddress.countryId,
					firstName: customerData.shippingAddress.firstName,
					lastName: customerData.shippingAddress.lastName,
					city: customerData.shippingAddress.city,
					street: customerData.shippingAddress.street,
				}));
			}

			// 5. Build deliveries and shipping costs
			let deliveries: Delivery[] = [];
			let shippingCosts: GenericPrice | null = null;

			if (params.nodeDeliveries && params.nodeDeliveries.length > 0) {
				const existingCustomer = addresses.length === 0
					&& params.nodeDeliveries.some((delivery) => delivery.customerShippingAddress)
					? await getCustomerByNumber.call(this, prevOrderCustomer.customerNumber, i)
					: null;
				deliveries = await Promise.all(
					params.nodeDeliveries.map(async (delivery) => {
						let shippingOrderAddressId: string;
						if (delivery.customerShippingAddress) {
							if (addresses.length > 0) {
								shippingOrderAddressId = addresses[0].id;
							} else {
								shippingOrderAddressId = existingCustomer!.defaultShippingAddressId;
							}
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
							shippingOrderAddressId = uuidv7();
							addresses.push(buildOrderAddressPayload({
								id: shippingOrderAddressId,
								countryId: address.country,
								firstName: address.firstName,
								lastName: address.lastName,
								city: address.city,
								street: address.street,
							}));
						}
						const shippingMethodDataKey = `${delivery.shippingMethod}:${currencyData.id}`;
						if (!shippingMethodDataCache.has(shippingMethodDataKey)) {
							shippingMethodDataCache.set(
								shippingMethodDataKey,
								getShippingMethodFullData.call(this, delivery.shippingMethod, currencyData.id),
							);
						}
						const shippingMethodData = await shippingMethodDataCache.get(shippingMethodDataKey)!;
						return buildDeliveryPayload({
							shippingOrderAddressId,
							shippingMethodId: delivery.shippingMethod,
							stateId: delivery.state,
							shippingPrice: shippingMethodData.unitPrice,
							shippingTaxRate: shippingMethodData.taxRate,
							deliveryTime: shippingMethodData.deliveryTime,
						});
					}),
				);

				shippingCosts = aggregateDeliveryShippingCostsWithExisting(deliveries, shippingData);
			}

			// 6. Assemble update payload
			const updateBody = buildOrderUpdatePayload({
				customerData,
				lineItems,
				price,
				shippingCosts,
				transactions,
				deliveries,
				addresses,
			});

			cleanPayload(updateBody, true);

			// 7. State transition and update
			if (params.orderState === '') {
				throw new NodeOperationError(this.getNode(), 'Invalid order state', {
					description: 'Please specify a valid order state from the list',
					itemIndex: i,
				});
			}

			if (params.orderState) {
				await apiRequest.call(
					this,
					'POST',
					`/_action/order/${orderId}/state/${params.orderState}`,
				);
			}

			if (Object.keys(params.updateFields).length !== 0) {
				await apiRequest.call(this, 'PATCH', `/order/${orderId}`, updateBody);
			}

			const searchBody = {
				fields: orderFields,
				includes: { order: orderFields },
				filter: [{ type: 'equals', field: 'id', value: orderId }],
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

			if (error instanceof NodeOperationError) {
				throw error;
			}

			throw new NodeApiError(this.getNode(), error as JsonObject);
		}
	}

	return returnData;
}
