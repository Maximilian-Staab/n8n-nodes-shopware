import type { IExecuteFunctions } from 'n8n-workflow';
import type {
	NodeCustomerAddressDetails,
	NodeCustomerDetails,
	NodeDelivery,
	NodeLineItem,
	NodeTransaction,
} from '../actions/order/types';
import type { NodePrice, NodeProductMedia } from '../actions/product/types';
import type { NodeCustomerAddress } from '../actions/customer/types';
import type { NodeChildCategory } from '../actions/category/types';

// Order Create

export interface OrderCreateParams {
	guestOrder: boolean;
	customerNumber: string | null;
	guest: NodeCustomerDetails | null;
	guestBillingAddress: NodeCustomerAddressDetails | null;
	guestShippingAddress: NodeCustomerAddressDetails | null;
	salesChannel: string | null;
	currencyData: string[];
	nodeLineItems: NodeLineItem[] | null;
	nodeTransactions: NodeTransaction[] | null;
	nodeDeliveries: NodeDelivery[] | null;
	orderNumber: string;
	dateAndTime: Date;
	stateId: string;
}

export function extractOrderCreateParams(
	this: IExecuteFunctions,
	i: number,
): OrderCreateParams {
	const guestOrder = this.getNodeParameter('guestOrder', i) as boolean;

	const customerNumber = !guestOrder
		? (this.getNodeParameter('customerNumber', i) as string)
		: null;

	let guest: NodeCustomerDetails | null = null;
	let guestBillingAddress: NodeCustomerAddressDetails | null = null;
	let guestShippingAddress: NodeCustomerAddressDetails | null = null;
	let salesChannel: string | null = null;

	if (guestOrder) {
		guest = (this.getNodeParameter('guestUi', i) as { guestValues: NodeCustomerDetails })
			.guestValues;
		guestBillingAddress = (
			this.getNodeParameter('billingAddressUi', i) as {
				billingAddressValues: NodeCustomerAddressDetails;
			}
		).billingAddressValues;
		guestShippingAddress = (
			this.getNodeParameter('shippingAddressUi', i) as {
				shippingAddressValues: NodeCustomerAddressDetails;
			}
		).shippingAddressValues;
		salesChannel = this.getNodeParameter('salesChannel', i) as string;
	}

	const currencyData = JSON.parse(this.getNodeParameter('currency', i) as string) as string[];

	const nodeLineItems = (
		this.getNodeParameter('lineItems', i) as { lineItem: Array<NodeLineItem> | null }
	).lineItem;

	const nodeTransactions = (
		this.getNodeParameter('transactions', i) as { transaction: Array<NodeTransaction> | null }
	).transaction;

	const nodeDeliveries = (
		this.getNodeParameter('deliveries', i) as { delivery: Array<NodeDelivery> | null }
	).delivery;

	const orderNumber = this.getNodeParameter('orderNumber', i) as string;
	const dateAndTime = this.getNodeParameter('dateAndTime', i) as Date;
	const stateId = this.getNodeParameter('state', i) as string;

	return {
		guestOrder,
		customerNumber,
		guest,
		guestBillingAddress,
		guestShippingAddress,
		salesChannel,
		currencyData,
		nodeLineItems,
		nodeTransactions,
		nodeDeliveries,
		orderNumber,
		dateAndTime,
		stateId,
	};
}

// Order Update

export interface OrderUpdateParams {
	id: string;
	orderState: unknown;
	billingAddress: NodeCustomerAddressDetails | undefined;
	shippingAddress: NodeCustomerAddressDetails | undefined;
	nodeLineItems: NodeLineItem[] | null | undefined;
	nodeTransactions: NodeTransaction[] | null | undefined;
	nodeDeliveries: NodeDelivery[] | null | undefined;
	updateFields: Record<string, unknown>;
}

export function extractOrderUpdateParams(
	this: IExecuteFunctions,
	i: number,
): OrderUpdateParams {
	const id = this.getNodeParameter('id', i) as string;
	const { state: orderState, ...updateFields } = this.getNodeParameter('updateFields', i);

	const billingAddress = (
		updateFields.billingAddressUi as {
			billingAddressValues: NodeCustomerAddressDetails;
		} | null
	)?.billingAddressValues;

	const shippingAddress = (
		updateFields.shippingAddressUi as {
			shippingAddressValues: NodeCustomerAddressDetails;
		} | null
	)?.shippingAddressValues;

	const nodeLineItems = (
		updateFields.lineItems as { lineItem: Array<NodeLineItem> | null } | null
	)?.lineItem;

	const nodeTransactions = (
		updateFields.transactions as { transaction: Array<NodeTransaction> | null } | null
	)?.transaction;

	const nodeDeliveries = (
		updateFields.deliveries as { delivery: Array<NodeDelivery> | null } | null
	)?.delivery;

	return {
		id,
		orderState,
		billingAddress,
		shippingAddress,
		nodeLineItems,
		nodeTransactions,
		nodeDeliveries,
		updateFields,
	};
}

// Product Create

export interface ProductCreateParams {
	parentId: string;
	productNumber: string;
	ean: string;
	name: string;
	description: string;
	defaultGrossPrice: number;
	defaultAutoCalculateNet: boolean;
	defaultNetPrice: number;
	nodePrices: NodePrice[] | null;
	taxRateRaw: string;
	manufacturer: string;
	stock: number;
	categories: string[];
	salesChannels: string[];
	nodeMedia: NodeProductMedia[] | null;
	active: boolean;
}

export function extractProductCreateParams(
	this: IExecuteFunctions,
	i: number,
): ProductCreateParams {
	return {
		parentId: !this.getNodeParameter('parent', i)
			? (this.getNodeParameter('parentId', i) as string)
			: '',
		productNumber: this.getNodeParameter('productNumber', i) as string,
		ean: this.getNodeParameter('ean', i) as string,
		name: this.getNodeParameter('name', i) as string,
		description: this.getNodeParameter('description', i) as string,
		defaultGrossPrice: this.getNodeParameter('defaultGrossPrice', i) as number,
		defaultAutoCalculateNet: this.getNodeParameter('defaultAutoCalculateNet', i) as boolean,
		defaultNetPrice: this.getNodeParameter('defaultAutoCalculateNet', i)
			? 0
			: (this.getNodeParameter('defaultNetPrice', i) as number),
		nodePrices: (
			this.getNodeParameter('prices', i) as {
				price: Array<NodePrice> | null;
			}
		).price,
		taxRateRaw: this.getNodeParameter('taxRate', i) as string,
		manufacturer: this.getNodeParameter('manufacturer', i) as string,
		stock: this.getNodeParameter('stock', i) as number,
		categories: this.getNodeParameter('categories', i) as string[],
		salesChannels: this.getNodeParameter('salesChannels', i) as string[],
		nodeMedia: (
			this.getNodeParameter('media', i) as {
				mediaItem: Array<NodeProductMedia> | null;
			}
		).mediaItem,
		active: this.getNodeParameter('active', i) as boolean,
	};
}

// Product Update

export interface ProductUpdateParams {
	id: string;
	updateFields: Record<string, unknown>;
}

export function extractProductUpdateParams(
	this: IExecuteFunctions,
	i: number,
): ProductUpdateParams {
	return {
		id: this.getNodeParameter('id', i) as string,
		updateFields: this.getNodeParameter('updateFields', i) as Record<string, unknown>,
	};
}

// Customer Create

export interface CustomerCreateParams {
	customerNumber: string;
	firstName: string;
	lastName: string;
	email: string;
	paymentMethod: string;
	language: string;
	salutation: string;
	group: string;
	salesChannel: string;
	nodeAddresses: NodeCustomerAddress[] | null;
}

export function extractCustomerCreateParams(
	this: IExecuteFunctions,
	i: number,
): CustomerCreateParams {
	return {
		customerNumber: this.getNodeParameter('customerNumber', i) as string,
		firstName: this.getNodeParameter('firstName', i) as string,
		lastName: this.getNodeParameter('lastName', i) as string,
		email: this.getNodeParameter('email', i) as string,
		paymentMethod: this.getNodeParameter('paymentMethod', i) as string,
		language: this.getNodeParameter('language', i) as string,
		salutation: this.getNodeParameter('salutation', i) as string,
		group: this.getNodeParameter('group', i) as string,
		salesChannel: this.getNodeParameter('salesChannel', i) as string,
		nodeAddresses: (
			this.getNodeParameter('addresses', i) as {
				address: Array<NodeCustomerAddress> | null;
			}
		).address,
	};
}

// Customer Update

export interface CustomerUpdateParams {
	id: string;
	updateFields: Record<string, unknown>;
}

export function extractCustomerUpdateParams(
	this: IExecuteFunctions,
	i: number,
): CustomerUpdateParams {
	return {
		id: this.getNodeParameter('id', i) as string,
		updateFields: this.getNodeParameter('updateFields', i) as Record<string, unknown>,
	};
}

// Category Create

export interface CategoryCreateParams {
	isParent: boolean;
	createParent: boolean;
	parentId: string | null;
	parentCategoryName: string | null;
	parentCategoryDescription: string | null;
	categoryName: string;
	categoryDescription: string;
	nodeChildCategories: NodeChildCategory[] | null;
}

export function extractCategoryCreateParams(
	this: IExecuteFunctions,
	i: number,
): CategoryCreateParams {
	const isParent = this.getNodeParameter('parent', i) as boolean;
	const createParent = !isParent ? (this.getNodeParameter('createParent', i) as boolean) : false;

	let parentId: string | null = null;
	let parentCategoryName: string | null = null;
	let parentCategoryDescription: string | null = null;

	if (!isParent) {
		if (createParent) {
			parentCategoryName = this.getNodeParameter('parentCategoryName', i) as string;
			parentCategoryDescription = this.getNodeParameter('parentCategoryDescription', i) as string;
		} else {
			parentId = (JSON.parse(this.getNodeParameter('parentId', i) as string) as string[])[0];
		}
	}

	const nodeChildCategories = (
		this.getNodeParameter('children', i) as {
			category: Array<NodeChildCategory> | null;
		}
	)?.category;

	return {
		isParent,
		createParent,
		parentId,
		parentCategoryName,
		parentCategoryDescription,
		categoryName: this.getNodeParameter('categoryName', i) as string,
		categoryDescription: this.getNodeParameter('categoryDescription', i) as string,
		nodeChildCategories,
	};
}

// Category Update

export interface CategoryUpdateParams {
	id: string;
	updateFields: Record<string, unknown>;
}

export function extractCategoryUpdateParams(
	this: IExecuteFunctions,
	i: number,
): CategoryUpdateParams {
	return {
		id: this.getNodeParameter('id', i) as string,
		updateFields: this.getNodeParameter('updateFields', i) as Record<string, unknown>,
	};
}
