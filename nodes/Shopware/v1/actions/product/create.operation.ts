/* eslint-disable n8n-nodes-base/node-param-description-wrong-for-dynamic-options */
/* eslint-disable n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options */
/* eslint-disable n8n-nodes-base/node-param-description-wrong-for-dynamic-multi-options */
/* eslint-disable n8n-nodes-base/node-param-display-name-wrong-for-dynamic-multi-options */
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
import { apiRequest } from '../../transport';
import { productFields } from './fields';
import { wrapData, getDefaultCurrencyId } from '../../helpers/utils';
import { extractProductCreateParams } from '../../helpers/params';
import { buildProductCreatePayload, applyAutoNetPrices, cleanPayload } from '../../helpers/payloadBuilders';
import { uploadProductMedia } from '../../helpers/media';

const properties: INodeProperties[] = [
	{
		displayName: 'Parent Product',
		name: 'parent',
		type: 'boolean',
		default: true,
		description: 'Whether to create a parent product or a variant',
	},
	{
		displayName: 'Parent Product ID',
		name: 'parentId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 2a88d9b59d474...',
		description: 'ID of the parent product',
		displayOptions: {
			show: {
				parent: [false],
			},
		},
	},
	{
		displayName: 'Product Number',
		name: 'productNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. SW10001',
		description: 'Unique identifier for the product',
	},
	{
		displayName: 'EAN',
		name: 'ean',
		type: 'string',
		default: '',
		placeholder: 'e.g. 4006381333931',
		description: 'European Article Number (EAN) of the product',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Mobile Phone',
		description: 'Product name',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		placeholder: 'e.g. A high-quality mobile phone with a sleek design and advanced features.',
		description: 'Description of the product',
	},
	{
		displayName: 'Gross Price for Default Currency',
		name: 'defaultGrossPrice',
		type: 'number',
		typeOptions: {
			maxValue: 999000000,
			minValue: 0,
			numberPrecision: 2,
		},
		required: true,
		default: 0,
		placeholder: 'e.g. 499.99',
		description: 'Gross price of the product',
	},
	{
		displayName: 'Autocalculate Net',
		name: 'defaultAutoCalculateNet',
		type: 'boolean',
		default: true,
		description:
			'Whether to automatically calculate the net price based on the gross price and tax rate',
	},
	{
		displayName: 'Net Price',
		name: 'defaultNetPrice',
		type: 'number',
		displayOptions: {
			show: {
				defaultAutoCalculateNet: [false],
			},
		},
		typeOptions: {
			maxValue: 999000000,
			minValue: 0,
			numberPrecision: 2,
		},
		required: true,
		default: 0,
		placeholder: 'e.g. 499.99',
		description: 'Net price of the product',
	},
	{
		displayName: 'Prices',
		name: 'prices',
		placeholder: 'Add Price',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		description: 'Additional prices for different currencies',
		default: {},
		options: [
			{
				name: 'price',
				displayName: 'Price',
				values: [
					{
						displayName: 'Currency',
						name: 'currency',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getCurrencies',
						},
						required: true,
						default: '',
						description: 'Choose the price currency from the list',
					},
					{
						displayName: 'Gross Price',
						name: 'grossPrice',
						type: 'number',
						typeOptions: {
							maxValue: 999000000,
							minValue: 0,
							numberPrecision: 2,
						},
						required: true,
						default: 0,
						placeholder: 'e.g. 499.99',
						description: 'Gross price of the product',
					},
					{
						displayName: 'Autocalculate Net',
						name: 'autoCalculateNet',
						type: 'boolean',
						default: true,
						description:
							'Whether to automatically calculate the net price based on the gross price and tax rate',
					},
					{
						displayName: 'Net Price',
						name: 'netPrice',
						type: 'number',
						typeOptions: {
							maxValue: 999000000,
							minValue: 0,
							numberPrecision: 2,
						},
						displayOptions: {
							show: {
								autoCalculateNet: [false],
							},
						},
						required: true,
						default: 0,
						placeholder: 'e.g. 499.99',
						description: 'Net price of the product',
					},
				],
			},
		],
	},
	{
		displayName: 'Tax Rate',
		name: 'taxRate',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTaxRates',
		},
		required: true,
		default: '',
		description: 'Choose the tax rate from the list',
	},
	{
		displayName: 'Manufacturer',
		name: 'manufacturer',
		type: 'string',
		default: '',
		placeholder: 'e.g. Apple',
		description: 'Name of the manufacturer of the product',
	},
	{
		displayName: 'Stock',
		name: 'stock',
		type: 'number',
		typeOptions: {
			maxValue: 1000000,
			minValue: 0,
		},
		required: true,
		default: 0,
		description: 'Available stock quantity of the product',
	},
	{
		displayName: 'Categories',
		name: 'categories',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getCategories',
		},
		default: [],
		description: 'Choose the categories to assign the product to',
	},
	{
		displayName: 'Sales Channels',
		name: 'salesChannels',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getSalesChannels',
		},
		default: [],
		description: 'Choose the sales channels to assign the product to',
	},
	{
		displayName: 'Media',
		name: 'media',
		placeholder: 'Add Media',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		description: 'Images to upload and attach to the product',
		default: {},
		options: [
			{
				name: 'mediaItem',
				displayName: 'Media Item',
				values: [
					{
						displayName: 'Image URL',
						name: 'url',
						type: 'string',
						required: true,
						default: '',
						placeholder: 'e.g. https://example.com/image.jpg',
						description: 'URL of the image to upload',
					},
					{
						displayName: 'Position',
						name: 'position',
						type: 'number',
						default: 1,
						description: 'Display order of this image (lower = first)',
					},
					{
						displayName: 'Set as Cover',
						name: 'setAsCover',
						type: 'boolean',
						default: false,
						description: 'Whether to use this image as the product cover image',
					},
				],
			},
		],
	},
	{
		displayName: 'Active',
		name: 'active',
		type: 'boolean',
		default: true,
		description: 'Whether the product is active and visible in the storefront',
	},
];

const displayOptions = {
	show: {
		resource: ['product'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	const defaultCurrencyId = await getDefaultCurrencyId.call(this);

	for (let i = 0; i < items.length; i++) {
		try {
			const params = extractProductCreateParams.call(this, i);

			const createBody = buildProductCreatePayload({
				...params,
				defaultNetPrice: params.defaultAutoCalculateNet ? 0 : params.defaultNetPrice,
				defaultCurrencyId,
			});

			const taxRate = parseFloat((JSON.parse(params.taxRateRaw) as string[])[2]);
			applyAutoNetPrices(createBody.price, taxRate);
			cleanPayload(createBody);

			if (params.nodeMedia && params.nodeMedia.length > 0) {
				const { media, coverId } = await uploadProductMedia.call(this, params.nodeMedia);
				createBody.media = media;
				if (coverId) {
					createBody.coverId = coverId;
				}
			}

			const searchBody = {
				fields: productFields,
				includes: {
					product: productFields,
				},
				filter: [{ type: 'equals', field: 'productNumber', value: createBody.productNumber }],
				associations: {
					media: {},
					categories: {},
					manufacturer: {},
					cover: {},
				},
			};

			await apiRequest.call(this, 'POST', `/product`, createBody);

			const response = await apiRequest.call(this, 'POST', `/search/product`, searchBody);

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
