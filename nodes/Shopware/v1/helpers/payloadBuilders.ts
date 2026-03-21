import type { IDataObject, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type {
	Address,
	Delivery,
	GenericPrice,
	LineItem,
	OrderCreatePayload,
	OrderUpdatePayload,
	Rounding,
	Transaction,
	OrderCustomer,
	CustomerData,
	GlobalDefaults,
} from '../actions/order/types';
import type { ProductCreatePayload, ProductUpdatePayload, NodePrice } from '../actions/product/types';
import type { CustomerCreatePayload, CustomerUpdatePayload, NodeCustomerAddress } from '../actions/customer/types';
import type { CategoryCreatePayload, CategoryUpdatePayload, NodeChildCategory } from '../actions/category/types';
import type { DeliveryTimeResponse } from '../actions/types';
import {
	aggregateGenericPrices,
	buildGenericPrice,
	calculateLineItemPrice,
	calculateNetFromGross,
} from './pricing';

export interface LineItemInput {
	identifier: string;
	productId: string;
	label: string;
	states: string[];
	unitPrice: number;
	taxRate: number;
	quantity: number;
}

/**
 * Builds a single line item payload for the order API.
 *
 * @param input - The line item data including product info, pricing, and quantity
 * @returns A LineItem object ready for the order payload
 */
export function buildLineItemPayload(input: LineItemInput): LineItem {
	const { unitPrice, totalPrice, tax, taxPrice } = calculateLineItemPrice(
		input.unitPrice,
		input.quantity,
		input.taxRate,
	);

	const price = {
		unitPrice,
		totalPrice,
		quantity: input.quantity,
		calculatedTaxes: [
			{
				tax,
				taxRate: input.taxRate,
				price: taxPrice,
			},
		],
		taxRules: [
			{
				taxRate: input.taxRate,
				percentage: 100,
			},
		],
	};

	return {
		identifier: input.identifier,
		productId: input.productId,
		quantity: input.quantity,
		label: input.label,
		states: input.states,
		price,
	};
}

export interface DeliveryInput {
	shippingOrderAddressId: string;
	shippingMethodId: string;
	stateId: string;
	shippingPrice: number;
	shippingTaxRate: number;
	deliveryTime: DeliveryTimeResponse;
}

/**
 * Builds a delivery payload for the order API.
 *
 * @param input - The delivery data including shipping method, address, pricing, and delivery time
 * @returns A Delivery object ready for the order payload
 */
export function buildDeliveryPayload(input: DeliveryInput): Delivery {
	const shippingCosts = buildGenericPrice(input.shippingPrice, input.shippingTaxRate, 1);

	const shippingDateEarliest = new Date();
	const shippingDateLatest = new Date();
	switch (input.deliveryTime.unit) {
		case 'hour':
			shippingDateEarliest.setHours(shippingDateEarliest.getHours() + input.deliveryTime.min);
			shippingDateLatest.setHours(shippingDateLatest.getHours() + input.deliveryTime.max);
			break;
		case 'day':
			shippingDateEarliest.setDate(shippingDateEarliest.getDate() + input.deliveryTime.min);
			shippingDateLatest.setDate(shippingDateLatest.getDate() + input.deliveryTime.max);
			break;
		case 'week':
			shippingDateEarliest.setDate(
				shippingDateEarliest.getDate() + input.deliveryTime.min * 7,
			);
			shippingDateLatest.setDate(shippingDateLatest.getDate() + input.deliveryTime.max * 7);
			break;
	}

	return {
		shippingOrderAddressId: input.shippingOrderAddressId,
		shippingMethodId: input.shippingMethodId,
		stateId: input.stateId,
		shippingDateEarliest,
		shippingDateLatest,
		shippingCosts,
	};
}

export interface OrderAddressInput {
	id: string;
	countryId: string;
	firstName: string;
	lastName: string;
	city: string;
	street: string;
}

/**
 * Builds an order address payload from address data.
 *
 * @param input - The address fields
 * @returns An Address object ready for the order payload
 */
export function buildOrderAddressPayload(input: OrderAddressInput): Address {
	return {
		id: input.id,
		countryId: input.countryId,
		firstName: input.firstName,
		lastName: input.lastName,
		city: input.city,
		street: input.street,
	};
}

export interface TransactionInput {
	paymentMethodId: string;
	stateId: string;
	netPrice: number;
	totalPrice: number;
	quantity: number;
	calculatedTaxes: GenericPrice['calculatedTaxes'];
	taxRules: GenericPrice['taxRules'];
}

/**
 * Builds a transaction payload for the order API.
 *
 * @param input - The transaction data including payment method, state, and pricing
 * @returns A Transaction object ready for the order payload
 */
export function buildTransactionPayload(input: TransactionInput): Transaction {
	const amount: GenericPrice = {
		unitPrice: input.netPrice,
		totalPrice: input.totalPrice,
		quantity: input.quantity,
		calculatedTaxes: input.calculatedTaxes,
		taxRules: input.taxRules,
	};

	return {
		paymentMethodId: input.paymentMethodId,
		stateId: input.stateId,
		amount,
	};
}

/**
 * Aggregates shipping costs from multiple deliveries.
 *
 * @param deliveries - Array of Delivery objects
 * @returns A GenericPrice representing the combined shipping costs
 */
export function aggregateDeliveryShippingCosts(deliveries: Delivery[]): GenericPrice {
	return aggregateGenericPrices(deliveries.map((delivery) => delivery.shippingCosts));
}

/**
 * Aggregates shipping costs from new deliveries plus existing order shipping data.
 * Used by order update when adding deliveries on top of existing shipping costs.
 *
 * @param deliveries - Array of new Delivery objects
 * @param existingShippingData - The existing order shipping costs
 * @returns A GenericPrice representing the combined shipping costs
 */
export function aggregateDeliveryShippingCostsWithExisting(
	deliveries: Delivery[],
	existingShippingData: GenericPrice,
): GenericPrice {
	return aggregateGenericPrices([
		...deliveries.map((delivery) => delivery.shippingCosts),
		existingShippingData,
	]);
}

// Order Price builder

export interface OrderPriceInput {
	netPrice: number;
	totalPrice: number;
	calculatedTaxes: OrderCreatePayload['price']['calculatedTaxes'];
	taxRules: OrderCreatePayload['price']['taxRules'];
}

/**
 * Builds the order-level price object for create and update payloads.
 */
export function buildOrderPrice(input: OrderPriceInput): OrderCreatePayload['price'] {
	return {
		netPrice: input.netPrice,
		totalPrice: input.totalPrice,
		calculatedTaxes: input.calculatedTaxes,
		taxRules: input.taxRules,
		positionPrice: input.netPrice,
		rawTotal: input.netPrice,
		taxStatus: 'gross',
	};
}

// Order Create full payload

export interface OrderCreatePayloadInput {
	orderId: string;
	currencyData: string[];
	globalDefaults: Partial<GlobalDefaults>;
	customerData: Partial<CustomerData>;
	orderCustomer: OrderCustomer;
	lineItems: LineItem[];
	price: OrderCreatePayload['price'];
	shippingCosts: GenericPrice;
	transactions: Transaction[];
	deliveries: Delivery[];
	addresses: Address[];
	orderNumber: string;
	dateAndTime: Date;
	stateId: string;
}

/**
 * Assembles the full order create payload from pre-built components.
 */
export function buildOrderCreatePayload(input: OrderCreatePayloadInput): OrderCreatePayload {
	const parsedItemRounding = JSON.parse(input.currencyData[3]);
	const itemRounding: Rounding = {
		decimals: parsedItemRounding.decimals,
		interval: parsedItemRounding.interval,
		roundForNet: parsedItemRounding.roundForNet,
	};
	const parsedTotalRounding = JSON.parse(input.currencyData[4]);
	const totalRounding: Rounding = {
		decimals: parsedTotalRounding.decimals,
		interval: parsedTotalRounding.interval,
		roundForNet: parsedTotalRounding.roundForNet,
	};

	const serializedBillingAddress = buildOrderAddressPayload({
		id: input.customerData.billingAddress!.id,
		countryId: input.customerData.billingAddress!.countryId,
		firstName: input.customerData.billingAddress!.firstName,
		lastName: input.customerData.billingAddress!.lastName,
		city: input.customerData.billingAddress!.city,
		street: input.customerData.billingAddress!.street,
	});

	return {
		id: input.orderId,
		currencyId: input.currencyData[0],
		languageId: input.globalDefaults.languageId!,
		salesChannelId: input.globalDefaults.salesChannelId!,
		billingAddressId: input.customerData.billingAddress!.id,
		orderNumber: input.orderNumber,
		orderDateTime: input.dateAndTime,
		stateId: input.stateId,
		currencyFactor: parseFloat(input.currencyData[2]),
		itemRounding,
		totalRounding,
		orderCustomer: input.orderCustomer,
		billingAddress: serializedBillingAddress,
		lineItems: input.lineItems,
		price: input.price,
		shippingCosts: input.shippingCosts,
		transactions: input.transactions,
		deliveries: input.deliveries,
		addresses: input.addresses,
	};
}

// Order Update payload

export interface OrderUpdatePayloadInput {
	customerData: Partial<CustomerData>;
	lineItems: LineItem[];
	price: OrderCreatePayload['price'] | null;
	shippingCosts: GenericPrice | null;
	transactions: Transaction[];
	deliveries: Delivery[];
	addresses: Address[];
}

/**
 * Assembles the order update payload from pre-built components.
 */
export function buildOrderUpdatePayload(input: OrderUpdatePayloadInput): OrderUpdatePayload {
	let serializedBillingAddress: Address | null = null;
	if (input.customerData.billingAddress) {
		serializedBillingAddress = {
			id: input.customerData.billingAddress.id,
			countryId: input.customerData.billingAddress.countryId,
			firstName: input.customerData.billingAddress.firstName,
			lastName: input.customerData.billingAddress.lastName,
			city: input.customerData.billingAddress.city,
			street: input.customerData.billingAddress.street,
		};
	}

	return {
		billingAddressId: input.customerData.billingAddress ? input.customerData.billingAddress.id : null,
		billingAddress: serializedBillingAddress,
		lineItems: input.lineItems,
		price: input.price,
		shippingCosts: input.shippingCosts,
		transactions: input.transactions,
		deliveries: input.deliveries,
		addresses: input.addresses,
	};
}

// Product Create payload

export interface ProductCreatePayloadInput {
	parentId: string;
	productNumber: string;
	ean: string;
	name: string;
	description: string;
	defaultGrossPrice: number;
	defaultNetPrice: number;
	defaultCurrencyId: string;
	nodePrices: NodePrice[] | null;
	taxRateRaw: string;
	manufacturer: string;
	stock: number;
	categories: string[];
	salesChannels: string[];
	active: boolean;
}

/**
 * Builds the product create payload from extracted parameters.
 */
export function buildProductCreatePayload(input: ProductCreatePayloadInput): ProductCreatePayload {
	const taxId = (JSON.parse(input.taxRateRaw) as string[])[0];
	const taxRate = parseFloat((JSON.parse(input.taxRateRaw) as string[])[2]);

	const price = [
		{
			currencyId: input.defaultCurrencyId,
			gross: input.defaultGrossPrice,
			net: input.defaultNetPrice,
			linked: true,
		},
		...(input.nodePrices
			? input.nodePrices.map((p) => ({
					currencyId: p.currency,
					gross: p.grossPrice,
					net: p.autoCalculateNet ? 0 : p.netPrice,
					linked: true,
				}))
			: []),
	];

	// Auto-calculate net prices where net is 0
	price.forEach((p) => {
		if (p.net === 0) {
			p.net = calculateNetFromGross(p.gross, taxRate);
		}
	});

	const createBody: ProductCreatePayload = {
		parentId: input.parentId,
		productNumber: input.productNumber,
		ean: input.ean,
		name: input.name,
		description: input.description,
		price,
		taxId,
		manufacturer: input.manufacturer
			? { name: input.manufacturer }
			: undefined,
		stock: input.stock,
		categories: input.categories.map((category) => {
			const categoryData = JSON.parse(category) as string[];
			return {
				id: categoryData[0],
				name: categoryData[1],
			};
		}),
		visibilities: input.salesChannels.map((salesChannelId) => ({
			salesChannelId,
			visibility: 30,
		})),
		active: input.active,
	};

	return createBody;
}

// Product Update payload

/**
 * Builds the product update payload from update fields.
 */
export function buildProductUpdatePayload(
	updateFields: Record<string, unknown>,
): ProductUpdatePayload {
	return {
		parentId: updateFields.parentId as string,
		ean: updateFields.ean as string,
		name: updateFields.name as string,
		description: updateFields.description as string,
		price: [
			...((
				updateFields.prices as {
					price: Array<NodePrice> | null;
				} | null
			)?.price
				? (
						updateFields.prices as {
							price: Array<NodePrice>;
						}
					).price.map((price) => ({
						currencyId: price.currency,
						gross: price.grossPrice,
						net: price.autoCalculateNet ? 0 : price.netPrice,
						linked: true,
					}))
				: []),
		],
		taxId: updateFields.taxRate ? (JSON.parse(updateFields.taxRate as string) as string[])[0] : undefined,
		manufacturer: (updateFields.manufacturer as string)
			? {
					name: updateFields.manufacturer as string,
				}
			: undefined,
		stock: updateFields.stock as number,
		categories: (updateFields.categories as string[])?.map((category) => {
			const categoryData = JSON.parse(category) as string[];
			return {
				id: categoryData[0],
				name: categoryData[1],
			};
		}),
		visibilities: (updateFields.salesChannels as string[])?.map((salesChannelId) => ({
			salesChannelId,
			visibility: 30,
		})),
		active: updateFields.active as boolean,
	};
}

/**
 * Applies auto-calculated net prices to product price entries where net is 0.
 */
export function applyAutoNetPrices(
	prices: Array<{ currencyId: string; gross: number; net: number; linked: boolean }>,
	taxRate: number,
): void {
	prices.forEach((price) => {
		if (price.net === 0) {
			price.net = calculateNetFromGross(price.gross, taxRate);
		}
	});
}

// Customer Create payload

export interface CustomerAddressResult {
	addresses: CustomerCreatePayload['addresses'];
	defaultShippingAddressId: string | null;
	defaultBillingAddressId: string | null;
}

/**
 * Builds customer addresses from node address inputs, tracking default shipping/billing.
 * Throws NodeOperationError for duplicate defaults.
 */
export function buildCustomerAddresses(
	nodeAddresses: NodeCustomerAddress[],
	salutationId: string,
	uuidFn: () => string,
	node: INode,
	itemIndex: number,
): CustomerAddressResult {
	let defaultShippingAddressId: string | null = null;
	let defaultBillingAddressId: string | null = null;

	const addresses = nodeAddresses.map((address) => {
		const addressId = uuidFn();

		if (address.defaultShippingAddress) {
			if (defaultShippingAddressId) {
				throw new NodeOperationError(node, 'Duplicate default shipping address', {
					description: 'Only one address can be a default shipping address',
					itemIndex,
				});
			}
			defaultShippingAddressId = addressId;
		}

		if (address.defaultBillingAddress) {
			if (defaultBillingAddressId) {
				throw new NodeOperationError(node, 'Duplicate default billing address', {
					description: 'Only one address can be a default billing address',
					itemIndex,
				});
			}
			defaultBillingAddressId = addressId;
		}

		return {
			id: addressId,
			countryId: address.country,
			firstName: address.firstName,
			lastName: address.lastName,
			city: address.city,
			street: address.street,
			salutationId,
		};
	});

	return {
		addresses,
		defaultShippingAddressId,
		defaultBillingAddressId,
	};
}

/**
 * Builds the customer create payload from extracted parameters and processed addresses.
 */
export function buildCustomerCreatePayload(input: {
	firstName: string;
	lastName: string;
	email: string;
	customerNumber: string;
	paymentMethod: string;
	language: string;
	salesChannel: string;
	salutationId: string;
	group: string;
	defaultShippingAddressId: string;
	defaultBillingAddressId: string;
	addresses: CustomerCreatePayload['addresses'];
}): CustomerCreatePayload {
	return {
		firstName: input.firstName,
		lastName: input.lastName,
		email: input.email,
		customerNumber: input.customerNumber,
		defaultPaymentMethodId: input.paymentMethod,
		languageId: input.language,
		salesChannelId: input.salesChannel,
		salutationId: input.salutationId,
		groupId: input.group,
		defaultShippingAddressId: input.defaultShippingAddressId,
		defaultBillingAddressId: input.defaultBillingAddressId,
		addresses: input.addresses,
	};
}

/**
 * Builds the customer update payload from update fields and processed addresses.
 */
export function buildCustomerUpdatePayload(
	updateFields: Record<string, unknown>,
	addresses: CustomerUpdatePayload['addresses'] | undefined,
	defaultShippingAddressId: string | null,
	defaultBillingAddressId: string | null,
): CustomerUpdatePayload {
	return {
		firstName: updateFields.firstName as string,
		lastName: updateFields.lastName as string,
		email: updateFields.email as string,
		customerNumber: updateFields.customerNumber as string,
		defaultPaymentMethodId: updateFields.paymentMethod as string,
		languageId: updateFields.language as string,
		salesChannelId: updateFields.salesChannel as string,
		groupId: updateFields.group as string,
		defaultShippingAddressId,
		defaultBillingAddressId,
		addresses,
	};
}

// Category Create payload

/**
 * Builds the category create payload.
 */
export function buildCategoryCreatePayload(input: {
	id: string;
	categoryName: string;
	categoryDescription: string;
	parentId: string | null;
	parentCategoryName: string | null;
	parentCategoryDescription: string | null;
	nodeChildCategories: NodeChildCategory[] | null;
}): CategoryCreatePayload {
	let parent: CategoryCreatePayload['parent'] | null = null;
	let children: CategoryCreatePayload['children'] | null = null;

	if (input.parentCategoryName) {
		parent = {
			name: input.parentCategoryName,
			description: input.parentCategoryDescription!,
		};
	}

	if (input.nodeChildCategories && input.nodeChildCategories.length > 0) {
		children = input.nodeChildCategories.map((category) => ({
			name: category.categoryName,
			description: category.categoryDescription,
		}));
	}

	const createBody: CategoryCreatePayload = {
		id: input.id,
		name: input.categoryName,
		description: input.categoryDescription,
		parentId: input.parentId,
		parent,
		children,
	};

	return createBody;
}

/**
 * Builds the category update payload.
 */
export function buildCategoryUpdatePayload(
	updateFields: Record<string, unknown>,
): CategoryUpdatePayload {
	return {
		active: updateFields.active as boolean,
		parentId: updateFields.parentId ? (JSON.parse(updateFields.parentId as string) as string[])[0] : '',
		name: updateFields.name as string,
		description: updateFields.description as string,
	};
}

// Shared payload cleanup

/**
 * Removes empty strings, empty arrays, and null values from a payload object.
 * Mutates and returns the object. Matches the original inline cleanup logic
 * used across all create/update operations.
 */
export function cleanPayload<T extends IDataObject>(
	payload: T,
	removeNull: boolean = false,
): T {
	for (const key in payload) {
		const value = payload[key];

		if (
			Array.isArray(value) &&
			(value as Array<unknown>).length === 0
		) {
			delete payload[key];
		} else if (value === '') {
			delete payload[key];
		} else if (removeNull && value === null) {
			delete payload[key];
		}
	}
	return payload;
}

/**
 * Removes null-only values from a payload object (used by category create).
 */
export function cleanNullPayload<T extends IDataObject>(payload: T): T {
	for (const key in payload) {
		if (payload[key] === null) {
			delete payload[key];
		}
	}
	return payload;
}
