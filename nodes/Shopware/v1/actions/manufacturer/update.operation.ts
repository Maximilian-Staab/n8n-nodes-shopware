import {
	type INodeExecutionData,
	type INodeProperties,
	type IExecuteFunctions,
	type JsonObject,
	updateDisplayOptions,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';
import { apiRequest } from '../../transport';
import { manufacturerFields } from './fields';
import { wrapData } from '../../helpers/utils';
import { validateShopwareId } from '../../helpers/validation';
import type { ManufacturerUpdatePayload } from './types';

const properties: INodeProperties[] = [
	{
		displayName: 'Manufacturer ID',
		name: 'id',
		type: 'string',
		default: '',
		placeholder: 'e.g. 2a88d9b59d474...',
		required: true,
		description:
			'ID of the manufacturer to update. You can find the ID in the URL when viewing the manufacturer in Shopware Admin.',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
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
		],
	},
];

const displayOptions = {
	show: {
		resource: ['manufacturer'],
		operation: ['update'],
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
			const id = validateShopwareId(
				this.getNode(),
				this.getNodeParameter('id', i) as string,
				i,
				'Manufacturer ID',
			);

			const searchBody = {
				fields: manufacturerFields,
				includes: {
					'product-manufacturer': manufacturerFields,
				},
				filter: [{ type: 'equals', field: 'id', value: id }],
				associations: {
					media: {},
					products: {},
				},
			};

			const manufacturer = (
				await apiRequest.call(this, 'POST', `/search/product-manufacturer`, searchBody)
			).data[0];
			if (!manufacturer) {
				throw new NodeOperationError(this.getNode(), 'Manufacturer does not exist', {
					description: 'There is no manufacturer with id ' + id,
					itemIndex: i,
				});
			}

			const updateFields = this.getNodeParameter('updateFields', i) as ManufacturerUpdatePayload;

			const updateBody: ManufacturerUpdatePayload = {};
			if (updateFields.name) {
				updateBody.name = updateFields.name;
			}
			if (updateFields.link !== undefined) {
				updateBody.link = updateFields.link;
			}
			if (updateFields.description !== undefined) {
				updateBody.description = updateFields.description;
			}

			await apiRequest.call(this, 'PATCH', `/product-manufacturer/${id}`, updateBody);

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

			if (error instanceof NodeOperationError || error instanceof NodeApiError) {
				throw error;
			}

			throw new NodeApiError(this.getNode(), error as JsonObject);
		}
	}

	return returnData;
}
