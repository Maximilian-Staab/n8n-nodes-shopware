export const genericFields = ['id', 'name'];

export const orderCustomerFields = [
	'id',
	'firstName',
	'lastName',
	'email',
	'salutationId',
	'salesChannelId',
	'languageId',
	'defaultBillingAddressId',
	'defaultShippingAddressId',
];

export const orderAddressFields = [
	'id',
	'countryId',
	'countryStateId',
	'salutationId',
	'firstName',
	'lastName',
	'zipcode',
	'street',
	'city',
];

export const lineItemFields = ['id', 'productNumber', 'name', 'states', 'price', 'taxId']

export const salutationFields = ['id', 'displayName', 'salutationKey'];
