import { randomBytes } from 'crypto';
import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';
import { currencyFields } from '../actions/product/fields';
import { apiRequest } from '../transport';
import {
	genericFields,
	lineItemFields,
	orderAddressFields,
	orderCustomerFields,
	salutationFields,
} from '../actions/fields';
import {
	CustomerAddressResponse,
	CountryStateResponse,
	CustomerResponse,
	DeliveryTimeResponse,
	LineItemResponse,
	OrderCustomerResponse,
	PaginationData,
	ProductResponse,
	SearchBodyConstruct,
	ShippingMethodFullDataResponse,
	ShippingMethodDataResponse,
	ShippingMethodPrice,
} from '../actions/types';
import { categoryFilterHandlers, customerFilterHandlers, orderFilterHandlers, productFilterHandlers } from './handlers';

function getFirstDataEntry<T>(
	this: IExecuteFunctions,
	response: unknown,
	message: string,
	description: string,
	itemIndex?: number,
): T {
	const data = (response as { data?: T[] } | undefined)?.data;
	const entry = data?.[0];

	if (!entry) {
		throw new NodeOperationError(this.getNode(), message, {
			description,
			itemIndex,
		});
	}

	return entry;
}

export function wrapData(data: IDataObject | IDataObject[]): INodeExecutionData[] {
	if (!Array.isArray(data)) {
		return [{ json: data }];
	}
	return data.map((item) => ({
		json: item,
	}));
}

/**
 * Generates shopware UUIDv7.
 *
 * @returns A promise resolving to a string representing the uuid
 */
export function uuidv7(): string {
	const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');

	const now = Date.now();
	const timeHex = hex(now, 12);

	const randBuf = randomBytes(10);
	const rand1 = hex(randBuf.readUInt16BE(0), 4);
	const rand2 = hex(randBuf.readUInt16BE(2), 4);
	const rand3 = hex(randBuf.readUIntBE(4, 3), 6);
	const rand4 = hex(randBuf.readUIntBE(7, 3), 6);

	return timeHex.slice(0, 8) + timeHex.slice(8, 12) + '7' + rand1.slice(1) + rand2 + rand3 + rand4;
}

/**
 * Retrieves the Shopware instance's default installation currency.
 *
 * @returns A promise resolving to a string representing the currencyId
 */
export async function getDefaultCurrencyId(this: IExecuteFunctions): Promise<string> {
	const body = {
		fields: currencyFields,
		includes: {
			currency: currencyFields,
		},
		filter: [
			{
				type: 'equals',
				field: 'factor',
				value: 1,
			},
		],
	};
	const response = await apiRequest.call(this, 'POST', `/search/currency`, body);
	const currency = getFirstDataEntry.call(
		this,
		response,
		'No default currency found',
		'Could not find a Shopware currency with factor 1.',
	) as { id: string };
	return currency.id;
}

/**
 * Retrieves the Shopware instance's default installation language.
 *
 * @returns A promise resolving to a string representing the languageId
 */
export async function getDefaultLanguageId(this: IExecuteFunctions): Promise<string> {
	const body = {
		fields: genericFields,
		includes: {
			language: genericFields,
		},
		filter: [
			{
				type: 'equals',
				field: 'translationCode.systemDefault',
				value: true,
			},
		],
	};

	try {
		const response = await apiRequest.call(this, 'POST', `/search/language`, body);
		const defaultLanguage = (response as { data?: Array<{ id: string }> }).data?.[0];
		if (defaultLanguage) {
			return defaultLanguage.id;
		}
	} catch {}

	const fallbackResponse = await apiRequest.call(this, 'POST', `/search/language`, {
		fields: genericFields,
		includes: {
			language: genericFields,
		},
		limit: 1,
		sort: [
			{
				field: 'createdAt',
				order: 'ASC',
			},
		],
	});
	const language = getFirstDataEntry.call(
		this,
		fallbackResponse,
		'No default language found',
		'Could not determine a default Shopware language from the instance configuration.',
	) as { id: string };
	return language.id;
}

/**
 * Retrieves the default customer salutation.
 *
 * @returns A promise resolving to a string representing the salutation ID
 */
export async function getDefaultSalutationId(this: IExecuteFunctions): Promise<string> {
	const body = {
		fields: salutationFields,
		includes: {
			salutation: salutationFields,
		},
		filter: [
			{
				type: 'equals',
				field: 'salutationKey',
				value: 'not_specified',
			},
		],
	};
	const response = await apiRequest.call(this, 'POST', `/search/salutation`, body);
	const salutation = getFirstDataEntry.call(
		this,
		response,
		'No default salutation found',
		'Could not find the Shopware salutation with key "not_specified".',
	) as { id: string };
	return salutation.id;
}

/**
 * Retrieves the system default tax rate.
 *
 * @returns A promise resolving to a number representing the default tax rate
 */
export async function getDefaultTaxRate(this: IExecuteFunctions): Promise<number> {
	const body = {
		fields: ['configurationValue'],
		filter: [
			{
				type: 'equals',
				field: 'configurationKey',
				value: 'core.tax.defaultTaxRate',
			},
		],
	};

	const configEntry = getFirstDataEntry.call(
		this,
		await apiRequest.call(this, 'POST', `/search/system-config`, body),
		'No default tax configuration found',
		'Could not find the Shopware system configuration entry for the default tax rate.',
	) as { configurationValue?: string };
	const taxId = configEntry.configurationValue;
	if (!taxId) {
		throw new NodeOperationError(this.getNode(), 'Default tax configuration is invalid', {
			description: 'The Shopware default tax configuration does not contain a tax ID.',
		});
	}

	const taxRate = await getTaxRate.call(this, taxId);

	return taxRate;
}

/**
 * Retrieves the default shipping method.
 *
 * @returns A promise resolving to a string representing the shipping method
 */
export async function getDefaultShippingMethod(this: IExecuteFunctions): Promise<string> {
	const body = {
		filter: [
			{
				type: 'equals',
				field: 'technicalName',
				value: 'shipping_standard',
			},
		],
	};

	const shippingMethod = getFirstDataEntry.call(
		this,
		await apiRequest.call(this, 'POST', `/search/shipping-method`, body),
		'No default shipping method found',
		'Could not find the Shopware shipping method with technical name "shipping_standard".',
	) as { id: string };

	return shippingMethod.id;
}

/**
 * Retrieves shipping method data for orders.
 *
 * @param shippingMethodId - The ID of the shpping method
 * @param currencyId - Order currency ID
 * @returns A promise resolving to a shipping method data response
 */
export async function getShippingMethodData(
	this: IExecuteFunctions,
	shippingMethodId: string,
	currencyId: string,
): Promise<ShippingMethodDataResponse> {
	const { unitPrice, taxRate } = await getShippingMethodFullData.call(this, shippingMethodId, currencyId);
	return { unitPrice, taxRate };
}

export async function getShippingMethodFullData(
	this: IExecuteFunctions,
	shippingMethodId: string,
	currencyId: string,
): Promise<ShippingMethodFullDataResponse> {
	const body = {
		associations: {
			prices: {},
			deliveryTime: {},
		},
		filter: [
			{
				type: 'equals',
				field: 'id',
				value: shippingMethodId,
			},
		],
	};
	const shippingMethod = (await apiRequest.call(this, 'POST', `/search/shipping-method`, body))
		.data[0];

	if (!shippingMethod) {
		throw new NodeOperationError(this.getNode(), 'Shipping method not found', {
			description: `Could not find the shipping method with ID ${shippingMethodId}.`,
		});
	}

	const shippingPrice = (shippingMethod.prices?.[0]?.currencyPrice as Array<ShippingMethodPrice> | undefined)?.find(
		(price) => price.currencyId === currencyId,
	);
	if (!shippingPrice) {
		throw new NodeOperationError(this.getNode(), 'Shipping method price missing', {
			description: `Shipping method ${shippingMethodId} does not have a price for currency ${currencyId}.`,
		});
	}
	const unitPrice = shippingPrice.net;
	const deliveryTime = shippingMethod.deliveryTime as DeliveryTimeResponse | undefined;
	if (!deliveryTime) {
		throw new NodeOperationError(this.getNode(), 'Shipping delivery time missing', {
			description: `Shipping method ${shippingMethodId} does not define a delivery time.`,
		});
	}

	const taxId = shippingMethod.taxId as string;

	let taxRate: number;
	if (taxId) {
		taxRate = await getTaxRate.call(this, taxId);
	} else {
		taxRate = await getDefaultTaxRate.call(this);
	}

	return { unitPrice, taxRate, deliveryTime };
}

/**
 * Retrieves the provided product's tax rate.
 *
 * @param productId - The product UUID
 * @returns A promise resolving to a number representing the tax rate
 */
export async function getProductTaxRate(
	this: IExecuteFunctions,
	productId: string,
): Promise<number> {
	const productBody = {
		fields: ['taxId'],
		includes: {
			product: ['taxId'],
		},
		filter: [
			{
				type: 'equals',
				field: 'id',
				value: productId,
			},
		],
	};

	const product = getFirstDataEntry.call(
		this,
		await apiRequest.call(this, 'POST', `/search/product`, productBody),
		'Product not found',
		`Could not find the product with ID ${productId}.`,
	) as { taxId?: string };
	const taxId = product.taxId;
	if (!taxId) {
		throw new NodeOperationError(this.getNode(), 'Product tax is missing', {
			description: `Product ${productId} does not have a tax ID assigned.`,
		});
	}

	const taxRate = await getTaxRate.call(this, taxId);

	return taxRate;
}

async function getTaxRate(this: IExecuteFunctions, taxId: string): Promise<number> {
	const taxBody = {
		fields: ['taxRate'],
		includes: {
			tax: ['taxRate'],
		},
		filter: [
			{
				type: 'equals',
				field: 'id',
				value: taxId,
			},
		],
	};

	const tax = getFirstDataEntry.call(
		this,
		await apiRequest.call(this, 'POST', `/search/tax`, taxBody),
		'Tax not found',
		`Could not find the Shopware tax entry with ID ${taxId}.`,
	) as { taxRate: number };
	const taxRate = tax.taxRate;

	return taxRate;
}

/**
 * Retrieves a customer by customer number.
 *
 * @param customerNumber - The customer number to retrieve by
 * @param itemIndex - The index of the current node item
 * @returns A promise resolving to a customer response
 */
export async function getCustomerByNumber(
	this: IExecuteFunctions,
	customerNumber: string,
	itemIndex: number,
): Promise<OrderCustomerResponse> {
	const customerBody = {
		fields: orderCustomerFields,
		includes: {
			customer: orderCustomerFields,
		},
		filter: [
			{
				type: 'equals',
				field: 'customerNumber',
				value: customerNumber,
			},
		],
	};

	const customer = (await apiRequest.call(this, 'POST', `/search/customer`, customerBody))
		.data[0] as CustomerResponse;

	if (!customer) {
		throw new NodeOperationError(this.getNode(), 'No customer found', {
			description: 'There is no customer associated with customer number ' + customerNumber,
			itemIndex,
		});
	}

	const [billingAddress, shippingAddress] = await Promise.all([
		getCustomerAddress.call(this, customer.defaultBillingAddressId),
		getCustomerAddress.call(this, customer.defaultShippingAddressId),
	]);

	return { ...customer, billingAddress, shippingAddress };
}

async function getCustomerAddress(
	this: IExecuteFunctions,
	addressId: string,
): Promise<CustomerAddressResponse> {
	const customerAddressBody = {
		fields: orderAddressFields,
		filter: [
			{
				type: 'equals',
				field: 'id',
				value: addressId,
			},
		],
	};

	const address = (
		await apiRequest.call(this, 'POST', `/search/customer-address`, customerAddressBody)
	).data[0] as CustomerAddressResponse | undefined;

	if (!address) {
		throw new NodeOperationError(this.getNode(), 'Customer address not found', {
			description: `Could not find the customer address with ID ${addressId}.`,
		});
	}

	return address;
}

/**
 * Retrieves order line item data by a product number.
 *
 * @param productNumber - The product number to retrieve the data by
 * @param currencyId - Line item price currency ID
 * @param itemIndex - Index of the current node item
 * @returns A promise resolving to a line item response
 */
export async function getLineItemData(
	this: IExecuteFunctions,
	productNumber: string,
	currencyId: string,
	itemIndex: number,
): Promise<LineItemResponse> {
	const body = {
		fields: lineItemFields,
		includes: {
			product: lineItemFields,
		},
		filter: [
			{
				type: 'equals',
				field: 'productNumber',
				value: productNumber,
			},
		],
	};

	const product = (await apiRequest.call(this, 'POST', `/search/product`, body))
		.data[0] as ProductResponse;

	if (!product) {
		throw new NodeOperationError(this.getNode(), 'No product found', {
			description: 'There is no product associated with product number ' + productNumber,
			itemIndex,
		});
	}

	const taxRate = await getTaxRate.call(this, product.taxId);

	const price = product.price.filter((price) => price.currencyId === currencyId)[0];

	if (!price) {
		throw new NodeOperationError(this.getNode(), 'Line item price missing', {
			description: `Line item with product number ${productNumber} does not have a price for the selected order currency`,
			itemIndex,
		});
	}

	return {
		identifier: product.id,
		productId: product.id,
		productNumber: product.productNumber,
		label: product.name,
		states: product.states,
		unitPrice: price.gross,
		taxRate,
	};
}

function normalizeCountryStateInput(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getCountryStatesByCountryId(
	this: IExecuteFunctions,
	countryId: string,
	cache: Map<string, Promise<CountryStateResponse[]>>,
): Promise<CountryStateResponse[]> {
	if (!cache.has(countryId)) {
		cache.set(
			countryId,
			(async () => {
				const body = {
					limit: 500,
					fields: ['id', 'name', 'shortCode'],
					includes: {
						'country-state': ['id', 'name', 'shortCode'],
					},
					filter: [
						{
							type: 'equals',
							field: 'countryId',
							value: countryId,
						},
					],
				};

				return ((await apiRequest.call(this, 'POST', `/search/country-state`, body)).data ?? []) as CountryStateResponse[];
			})(),
		);
	}

	return await cache.get(countryId)!;
}

export async function resolveCountryStateId(
	this: IExecuteFunctions,
	countryId: string,
	stateInput: string | undefined,
	cache: Map<string, Promise<CountryStateResponse[]>>,
	itemIndex?: number,
	fieldLabel: string = 'State / Province',
): Promise<string | null> {
	if (!stateInput || stateInput.trim() === '') {
		return null;
	}

	const states = await getCountryStatesByCountryId.call(this, countryId, cache);
	if (states.length === 0) {
		throw new NodeOperationError(this.getNode(), 'State / province not available', {
			description: `${fieldLabel} was provided, but the selected country does not define any states in Shopware.`,
			itemIndex,
		});
	}

	const trimmedInput = stateInput.trim();
	const normalizedInput = normalizeCountryStateInput(trimmedInput);

	const exactIdMatch = states.find((state) => state.id === trimmedInput);
	if (exactIdMatch) {
		return exactIdMatch.id;
	}

	const exactShortCodeMatch = states.find((state) => state.shortCode?.trim() === trimmedInput);
	if (exactShortCodeMatch) {
		return exactShortCodeMatch.id;
	}

	const exactNameMatch = states.find((state) => state.name.trim() === trimmedInput);
	if (exactNameMatch) {
		return exactNameMatch.id;
	}

	const normalizedMatches = states.filter(
		(state) =>
			normalizeCountryStateInput(state.name) === normalizedInput ||
			normalizeCountryStateInput(state.shortCode ?? '') === normalizedInput,
	);

	if (normalizedMatches.length === 1) {
		return normalizedMatches[0].id;
	}

	if (normalizedMatches.length > 1) {
		throw new NodeOperationError(this.getNode(), 'State / province is ambiguous', {
			description: `${fieldLabel} "${stateInput}" matches multiple states for the selected country: ${normalizedMatches.map((state) => state.name).join(', ')}.`,
			itemIndex,
		});
	}

	throw new NodeOperationError(this.getNode(), 'State / province not found', {
		description: `${fieldLabel} "${stateInput}" does not match any state for the selected country.`,
		itemIndex,
	});
}

async function getTaxRatesByIds(
	this: IExecuteFunctions,
	taxIds: string[],
): Promise<Map<string, number>> {
	if (taxIds.length === 0) {
		return new Map();
	}

	const taxBody = {
		fields: ['id', 'taxRate'],
		includes: {
			tax: ['id', 'taxRate'],
		},
		filter: [
			{
				type: 'equalsAny',
				field: 'id',
				value: taxIds,
			},
		],
	};
	const taxes = ((await apiRequest.call(this, 'POST', `/search/tax`, taxBody)).data ?? []) as Array<{
		id: string;
		taxRate: number;
	}>;

	return new Map(taxes.map((tax) => [tax.id, tax.taxRate]));
}

export async function getLineItemDataBatch(
	this: IExecuteFunctions,
	productNumbers: string[],
	currencyId: string,
	itemIndex: number,
): Promise<Map<string, LineItemResponse>> {
	const uniqueProductNumbers = Array.from(new Set(productNumbers));
	if (uniqueProductNumbers.length === 0) {
		return new Map();
	}

	const body = {
		fields: lineItemFields,
		includes: {
			product: lineItemFields,
		},
		filter: [
			{
				type: 'equalsAny',
				field: 'productNumber',
				value: uniqueProductNumbers,
			},
		],
	};
	const products = ((await apiRequest.call(this, 'POST', `/search/product`, body)).data ?? []) as ProductResponse[];
	const productMap = new Map(products.map((product) => [product.productNumber, product]));
	const missingProductNumbers = uniqueProductNumbers.filter((productNumber) => !productMap.has(productNumber));

	if (missingProductNumbers.length > 0) {
		throw new NodeOperationError(this.getNode(), 'No product found', {
			description:
				'There is no product associated with product number ' + missingProductNumbers[0],
			itemIndex,
		});
	}

	const taxRatesById = await getTaxRatesByIds.call(
		this,
		Array.from(new Set(products.map((product) => product.taxId))),
	);

	return new Map(
		uniqueProductNumbers.map((productNumber) => {
			const product = productMap.get(productNumber)!;
			const price = product.price.find((entry) => entry.currencyId === currencyId);

			if (!price) {
				throw new NodeOperationError(this.getNode(), 'Line item price missing', {
					description: `Line item with product number ${productNumber} does not have a price for the selected order currency`,
					itemIndex,
				});
			}

			const taxRate = taxRatesById.get(product.taxId);
			if (taxRate === undefined) {
				throw new NodeOperationError(this.getNode(), 'Tax not found', {
					description: `Could not find the Shopware tax entry with ID ${product.taxId}.`,
					itemIndex,
				});
			}

			return [
				productNumber,
				{
					identifier: product.id,
					productId: product.id,
					productNumber: product.productNumber,
					label: product.name,
					states: product.states,
					unitPrice: price.gross,
					taxRate,
				},
			];
		}),
	);
}

export async function getShippingDeliveryTime(
	this: IExecuteFunctions,
	shippingMethodId: string,
): Promise<DeliveryTimeResponse> {
	const body = {
		filter: [
			{
				type: 'equals',
				field: 'id',
				value: shippingMethodId,
			},
		],
	};
	const shippingMethod = getFirstDataEntry.call(
		this,
		await apiRequest.call(this, 'POST', `/search/shipping-method`, body),
		'Shipping method not found',
		`Could not find the shipping method with ID ${shippingMethodId}.`,
	) as { deliveryTime?: DeliveryTimeResponse };
	if (!shippingMethod.deliveryTime) {
		throw new NodeOperationError(this.getNode(), 'Shipping delivery time missing', {
			description: `Shipping method ${shippingMethodId} does not define a delivery time.`,
		});
	}
	const { min, max, unit } = shippingMethod.deliveryTime;

	return { min, max, unit };
}

export async function getPrePaymentOrderStates(this: IExecuteFunctions): Promise<Array<string>> {
	const body = {
		filter: [
			{
				type: 'equals',
				field: 'technicalName',
				value: 'order.state',
			},
		],
		associations: {
			states: {},
		},
	};

	const stateMachine = getFirstDataEntry.call(
		this,
		await apiRequest.call(this, 'POST', `/search/state-machine`, body),
		'Order state machine not found',
		'Could not find the Shopware order state machine with technical name "order.state".',
	) as { states?: Array<{ id: string; technicalName: string }> };
	const states = stateMachine.states;
	if (!states) {
		throw new NodeOperationError(this.getNode(), 'Order state machine is invalid', {
			description: 'The Shopware order state machine does not include any states.',
		});
	}

	const prePaymentStates = states
		.filter((state) => ['open', 'in_progress'].includes(state.technicalName))
		.map((state) => state.id);

	return prePaymentStates;
}

/**
 *
 * @param paginationData - Body pagination fields
 * @param baseFields - Entity result base fields
 * @param entity - Which entity to construct a search body for (order, customer, product)
 * @param [filters] - Entity fields to filter by
 * @param [associations] - Other entities associated with the entity provided
 * @returns A SearchBodyConstruct object
 */
export function constructSearchBody(
	this: IExecuteFunctions,
	paginationData: PaginationData,
	baseFields: string[],
	entity: 'order' | 'product' | 'customer' | 'category',
	filters?: IDataObject,
	...associations: string[]
): SearchBodyConstruct {
	const stateful = ['transactions', 'deliveries'];
	const searchBody: SearchBodyConstruct = {
		page: paginationData.page,
		limit: paginationData.limit,
		fields: baseFields,
		includes: {
			[entity]: baseFields,
		},
	};

	if (filters && Object.keys(filters).length !== 0) {
		searchBody.filter = [];

		switch (entity) {
			case 'order':
				Object.entries(filters).forEach(([key, value]) => {
					if (orderFilterHandlers[key]) {
						searchBody.filter!.push(orderFilterHandlers[key](value));
					}
				});
				break;
			case 'customer':
				Object.entries(filters).forEach(([key, value]) => {
					if (customerFilterHandlers[key]) {
						searchBody.filter!.push(customerFilterHandlers[key](value));
					}
				});
				break;
			case 'product':
				Object.entries(filters).forEach(([key, value]) => {
					if (productFilterHandlers[key]) {
						searchBody.filter!.push(productFilterHandlers[key](value));
					}
				});
				break;
			case 'category':
				Object.entries(filters).forEach(([key, value]) => {
					if (categoryFilterHandlers[key]) {
						searchBody.filter!.push(categoryFilterHandlers[key](value));
					}
				});
		}

	}

	if (associations && associations.length > 0) {
		searchBody.associations = {};
		associations.forEach((assoc) => {
			if (stateful.includes(assoc)) {
				searchBody.associations![assoc] = {
					associations: {
						stateMachineState: {},
					},
				};
			} else {
				searchBody.associations![assoc] = {};
			}
		});
	}

	return searchBody;
}
