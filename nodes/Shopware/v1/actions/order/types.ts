
export interface Rounding {
	decimals: number;
	interval: number;
	roundForNet: boolean;
}

interface CalculatedTax {
	tax: number;
	taxRate: number;
	price: number;
}

interface TaxRule {
	taxRate: number;
	percentage: number;
}

interface OrderPrice {
	netPrice: number;
	totalPrice: number;
	calculatedTaxes: CalculatedTax[];
	taxRules: TaxRule[];
	positionPrice: number;
	rawTotal: number;
	taxStatus: string;
}

export interface LineItemPrice {
	unitPrice: number;
	totalPrice: number;
	quantity: number;
	calculatedTaxes: CalculatedTax[];
	taxRules: TaxRule[];
}

export interface OrderCustomer {
	firstName: string;
	lastName: string;
	email: string;
	salutationId: string;
	customerId?: string;
	customerNumber: string;
}

interface BillingAddress {
	id: string;
	countryId: string;
	countryStateId?: string | null;
	salutationId: string;
	firstName: string;
	lastName: string;
	zipcode: string;
	street: string;
	city: string;
}

export interface GenericPrice {
	unitPrice: number;
	totalPrice: number;
	quantity: number;
	calculatedTaxes: CalculatedTax[];
	taxRules: TaxRule[];
}

export interface Transaction {
	paymentMethodId: string;
	stateId: string;
	amount: GenericPrice;
}

export interface DeliveryPosition {
	id: string;
	orderLineItemId: string;
	price: LineItemPrice;
}

export interface Delivery {
	id: string;
	shippingOrderAddress: Address;
	shippingMethodId: string;
	stateId: string;
	shippingDateEarliest: Date;
	shippingDateLatest: Date;
	shippingCosts: GenericPrice;
	positions: DeliveryPosition[];
}

export interface Address {
	id: string;
	countryId: string;
	countryStateId?: string | null;
	salutationId: string;
	firstName: string;
	lastName: string;
	zipcode: string;
	street: string;
	city: string;
}

export interface LineItem {
	id: string;
	type: string;
	identifier: string;
	productId: string;
	referencedId: string;
	quantity: number;
	label: string;
	states: string[];
	payload: { productNumber: string };
	price: LineItemPrice;
}

interface OrderBody {
	id?: string;
	orderNumber: string;
	billingAddressId: string;
	currencyId: string;
	languageId: string;
	salesChannelId: string;
	orderDateTime: Date;
	currencyFactor: number;
	stateId: string;
	itemRounding: Rounding;
	totalRounding: Rounding;
	orderCustomer: OrderCustomer;
	price: OrderPrice;
	billingAddress: BillingAddress;
	shippingCosts: GenericPrice;
	transactions?: Transaction[];
	deliveries?: Delivery[];
	lineItems: LineItem[];
}

export type OrderCreatePayload = OrderBody;

type NullablePartial<T> = {
  [P in keyof T]?: T[P] | null;
};

export type OrderUpdatePayload = Omit<NullablePartial<OrderCreatePayload>, 'orderCustomer'> & {
	orderCustomer?: Partial<OrderCustomer> | null
}

export interface OrderResponse extends OrderBody {
	id: string;
	amountNet: number;
	currency: { id: string };
}

export type SalutationOption = {
	id: string;
	displayName: string;
};

export type NodeLineItem = {
	productNumber: string;
	quantity: number;
};

export type NodeTransaction = {
	paymentMethod: string;
	state: string;
};

export type NodeDelivery = {
	shippingMethod: string;
	state: string;
	customerShippingAddress: boolean;
	addressUi: {
		addressValues: AddressValues
	}
};

export type AddressValues = {
	country: string;
	state?: string;
	countryStateId?: string;
	firstName: string;
	lastName: string;
	zipcode?: string;
	city: string;
	street: string;
}

export type CustomerData = {
	firstName: string;
	lastName: string;
	email: string;
	salutationId: string;
	billingAddress: Address;
	shippingAddress: Address;
}

export type GlobalDefaults = {
	salesChannelId: string;
	languageId: string;
}

export type NodeCustomerDetails = {
	firstName: string;
	lastName: string;
	email: string;
	salutation: string;
}

export type NodeCustomerAddressDetails = {
	country: string;
	state?: string;
	countryStateId?: string | null;
	firstName: string;
	lastName: string;
	zipcode?: string;
	city: string;
	street: string;
}
