import {
	type INodeExecutionData,
	type INodeProperties,
	type IExecuteFunctions,
	type JsonObject,
	NodeApiError,
	updateDisplayOptions,
} from 'n8n-workflow';
import { apiRequest } from '../../transport';
import { manufacturerFields } from './fields';
import { wrapData } from '../../helpers/utils';

const properties: INodeProperties[] = [
	{
		displayName: 'Manufacturer ID',
		name: 'id',
		type: 'string',
		default: '',
		placeholder: 'e.g. 2a88d9b59d474...',
		required: true,
		description:
			'ID of the manufacturer to get. You can find the ID in the URL when viewing the manufacturer in Shopware Admin.',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		options: [
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'string',
				default: '',
				description:
					'Fields the manufacturer will return, formatted as a string of comma-separated values. By default all the fields are returned.',
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['manufacturer'],
		operation: ['get'],
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
			let fields = manufacturerFields;

			const id = this.getNodeParameter('id', i) as string;
			const filters = this.getNodeParameter('filters', i);

			const shrinkedFields = filters.fields;

			if (shrinkedFields) {
				fields = (shrinkedFields as string).split(',').map((field) => field.trim());
			}

			const body = {
				fields,
				includes: {
					'product-manufacturer': fields,
				},
				filter: [{ type: 'equals', field: 'id', value: id }],
				associations: {
					media: {},
					products: {},
				},
			};

			const response = await apiRequest.call(this, 'POST', `/search/product-manufacturer`, body);

			const executionData = this.helpers.constructExecutionMetaData(wrapData(response.data), {
				itemData: { item: i },
			});

			returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: error.message } });
				continue;
			}

			throw new NodeApiError(this.getNode(), error as JsonObject);
		}
	}

	return returnData;
}
