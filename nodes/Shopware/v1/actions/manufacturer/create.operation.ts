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
import type { ManufacturerCreatePayload } from './types';

const properties: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Apple',
		description: 'Name of the manufacturer',
	},
	{
		displayName: 'Link',
		name: 'link',
		type: 'string',
		default: '',
		placeholder: 'e.g. https://www.apple.com',
		description: 'URL to the manufacturer website',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		placeholder: 'e.g. Apple Inc. is an American multinational technology company.',
		description: 'Description of the manufacturer',
	},
];

const displayOptions = {
	show: {
		resource: ['manufacturer'],
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
			const name = this.getNodeParameter('name', i) as string;
			const link = this.getNodeParameter('link', i) as string;
			const description = this.getNodeParameter('description', i) as string;

			const createBody: ManufacturerCreatePayload = {
				name,
			};

			if (link) {
				createBody.link = link;
			}

			if (description) {
				createBody.description = description;
			}

			const searchBody = {
				fields: manufacturerFields,
				includes: {
					'product-manufacturer': manufacturerFields,
				},
				filter: [{ type: 'equals', field: 'name', value: name }],
				associations: {
					media: {},
					products: {},
				},
			};

			await apiRequest.call(this, 'POST', `/product-manufacturer`, createBody);

			const response = await apiRequest.call(this, 'POST', `/search/product-manufacturer`, searchBody);

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
