/* eslint-disable n8n-nodes-base/node-param-description-wrong-for-dynamic-options */
/* eslint-disable n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options */
/* We only allow to select existing entities (e.g. groups, salesChannels, languages, etc.) by name for UX convenience. Therefore, we disable the relevant ESLint rules. */

import {
	type INodeExecutionData,
	type INodeProperties,
	type IExecuteFunctions,
	type JsonObject,
	NodeApiError,
	updateDisplayOptions,
	NodeOperationError,
} from 'n8n-workflow';
import { apiRequest } from '../../transport';
import { customerFields } from './fields';
import type { CountryStateResponse } from '../types';
import { getDefaultSalutationId, resolveCountryStateId, uuidv7, wrapData } from '../../helpers/utils';
import { extractCustomerCreateParams } from '../../helpers/params';
import { buildCustomerAddresses, buildCustomerCreatePayload, cleanPayload } from '../../helpers/payloadBuilders';

const properties: INodeProperties[] = [
	{
		displayName: 'Customer Number',
		name: 'customerNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 2a88d9b59d474...',
		description: 'Unique customer number',
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
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. name@email.com',
		description: 'Customer email',
	},
	{
		displayName: 'Payment Method',
		name: 'paymentMethod',
		type: 'options',
		required: true,
		typeOptions: {
			loadOptionsMethod: 'getPaymentMethods',
		},
		default: '',
		description: 'Select the payment method from the list',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'options',
		required: true,
		typeOptions: {
			loadOptionsMethod: 'getLanguages',
		},
		default: '',
		description: 'Select the language from the list',
	},
	{
		displayName: 'Salutation',
		name: 'salutation',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getSalutations',
		},
		default: '',
		description: 'Select the salutation from the list',
	},
	{
		displayName: 'Group',
		name: 'group',
		type: 'options',
		required: true,
		typeOptions: {
			loadOptionsMethod: 'getCustomerGroups',
		},
		default: '',
		description: 'Select the customer group from the list',
	},
	{
		displayName: 'Sales Channel',
		name: 'salesChannel',
		type: 'options',
		required: true,
		typeOptions: {
			loadOptionsMethod: 'getSalesChannels',
		},
		default: '',
		description: 'Select the sales channel from the list',
	},
	{
		displayName: 'Addresses',
		name: 'addresses',
		placeholder: 'Add Address',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		description: 'Customer addresses',
		default: {},
		options: [
			{
				name: 'address',
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
						description: 'Choose the country from the list',
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
						displayName: 'Zip Code',
						name: 'zipcode',
						type: 'string',
						default: '',
						description: "Customer's postal code",
					},
					{
						displayName: 'State / Province',
						name: 'state',
						type: 'string',
						default: '',
						description: 'Optional state or province name/code for the address',
					},
					{
						displayName: 'City',
						name: 'city',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'e.g. München',
						description: "Name of the customer's city",
					},
					{
						displayName: 'Street',
						name: 'street',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'e.g. Schillerstraße',
						description: "Name of the customer's city",
					},
					{
						displayName: 'Set as Default Shipping Address',
						name: 'defaultShippingAddress',
						type: 'boolean',
						default: false,
						description: 'Whether to set the current address as default shipping address',
					},
					{
						displayName: 'Set as Default Billing Address',
						name: 'defaultBillingAddress',
						type: 'boolean',
						default: false,
						description: 'Whether to set the current address as default billing address',
					},
				],
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['customer'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			const countryStateCache = new Map<string, Promise<CountryStateResponse[]>>();
			const params = extractCustomerCreateParams.call(this, i);

			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
				throw new NodeOperationError(this.getNode(), 'Invalid email address', {
					description: `The email address '${params.email}' in the 'email' field isn't valid`,
					itemIndex: i,
				});
			}

			if (!params.nodeAddresses || params.nodeAddresses.length === 0) {
				throw new NodeOperationError(this.getNode(), 'Missing default address', {
					description: 'At least one address must be provided',
					itemIndex: i,
				});
			}

			let salutationId = params.salutation;
			if (!salutationId) {
				salutationId = await getDefaultSalutationId.call(this);
			}

			const resolvedAddresses = await Promise.all(
				params.nodeAddresses.map(async (address) => ({
					...address,
					countryStateId: await resolveCountryStateId.call(
						this,
						address.country,
						address.state,
						countryStateCache,
						i,
						'State / Province',
					),
				})),
			);

			const addressResult = buildCustomerAddresses(
				resolvedAddresses,
				salutationId,
				uuidv7,
				this.getNode(),
				i,
			);

			if (!addressResult.defaultShippingAddressId) {
				throw new NodeOperationError(this.getNode(), 'Missing default shipping address', {
					description: 'Customer must have a default shipping address',
					itemIndex: i,
				});
			}
			if (!addressResult.defaultBillingAddressId) {
				throw new NodeOperationError(this.getNode(), 'Missing default billing address', {
					description: 'Customer must have a default billing address',
					itemIndex: i,
				});
			}

			const createBody = buildCustomerCreatePayload({
				firstName: params.firstName,
				lastName: params.lastName,
				email: params.email,
				customerNumber: params.customerNumber,
				paymentMethod: params.paymentMethod,
				language: params.language,
				salesChannel: params.salesChannel,
				salutationId,
				group: params.group,
				defaultShippingAddressId: addressResult.defaultShippingAddressId,
				defaultBillingAddressId: addressResult.defaultBillingAddressId,
				addresses: addressResult.addresses,
			});

			cleanPayload(createBody);

			const searchBody = {
				fields: customerFields,
				includes: {
					customer: customerFields,
				},
				filter: [{ type: 'equals', field: 'customerNumber', value: createBody.customerNumber }],
				associations: {
					addresses: {},
					defaultBillingAddress: {},
					defaultShippingAddress: {},
				},
			};

			await apiRequest.call(this, 'POST', `/customer`, createBody);

			const response = await apiRequest.call(this, 'POST', `/search/customer`, searchBody);

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
