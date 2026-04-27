import {
	type INodeExecutionData,
	type INodeProperties,
	type IExecuteFunctions,
	type JsonObject,
	NodeApiError,
	updateDisplayOptions,
} from 'n8n-workflow';
import { apiRequest } from '../../transport';
import { wrapData } from '../../helpers/utils';
import { validateShopwareId } from '../../helpers/validation';

const properties: INodeProperties[] = [
	{
		displayName: 'Manufacturer ID',
		name: 'id',
		type: 'string',
		default: '',
		placeholder: 'e.g. 2a88d9b59d474...',
		required: true,
		description:
			'ID of the manufacturer to delete. You can find the ID in the URL when viewing the manufacturer in Shopware Admin.',
	},
];

const displayOptions = {
	show: {
		resource: ['manufacturer'],
		operation: ['deleteManufacturer'],
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

			await apiRequest.call(this, 'DELETE', `/product-manufacturer/${id}`);

			const executionData = this.helpers.constructExecutionMetaData(
				wrapData({ success: true, id, message: `Manufacturer ${id} deleted successfully` }),
				{
					itemData: { item: i },
				},
			);

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
