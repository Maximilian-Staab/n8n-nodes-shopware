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
import { constructSearchBody, wrapData } from '../../helpers/utils';

const properties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: {
			show: {
				returnAll: [false],
			},
		},
		typeOptions: {
			minValue: 1,
			maxValue: 500,
		},
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		options: [
			{
				displayName: 'IDs',
				name: 'ids',
				type: 'string',
				default: '',
				description: 'Retrieve only manufacturers specified by a comma-separated list of IDs',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Filter manufacturers by their name',
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'string',
				default: '',
				description:
					'Fields the manufacturers will return, formatted as a string of comma-separated values. By default all the fields are returned.',
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['manufacturer'],
		operation: ['getMany'],
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
			let page = 1;
			let pageSize = 50;
			let iterate = true;
			let fields = manufacturerFields;

			const filters = this.getNodeParameter('filters', i);
			const { fields: shrinkedFields, ...apiFilters } = filters;

			if (shrinkedFields) {
				fields = (shrinkedFields as string).split(',').map((field) => field.trim());
			}

			const returnAll = this.getNodeParameter('returnAll', i);
			if (!returnAll) {
				pageSize = this.getNodeParameter('limit', i);
			}

			while (iterate) {
				const body = constructSearchBody.call(
					this,
					{ page, limit: pageSize },
					fields,
					'product-manufacturer',
					apiFilters,
				);

				const response = await apiRequest.call(this, 'POST', `/search/product-manufacturer`, body);

				const executionData = this.helpers.constructExecutionMetaData(wrapData(response.data), {
					itemData: { item: i },
				});

				returnData.push(...executionData);

				if (returnAll && response.data.length === pageSize) {
					page++;
				} else {
					iterate = false;
				}
			}
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
