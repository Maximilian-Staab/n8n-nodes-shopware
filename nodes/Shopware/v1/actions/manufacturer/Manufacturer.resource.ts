import type { INodeProperties } from 'n8n-workflow';

import * as create from './create.operation';
import * as deleteManufacturer from './deleteManufacturer.operation';
import * as get from './get.operation';
import * as getMany from './getMany.operation';
import * as update from './update.operation';

export { create, deleteManufacturer, get, getMany, update };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a manufacturer',
				action: 'Create a manufacturer',
			},
			{
				name: 'Delete',
				value: 'deleteManufacturer',
				description: 'Delete a manufacturer',
				action: 'Delete a manufacturer',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a manufacturer',
				action: 'Get a manufacturer',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				description: 'Retrieve many manufacturers',
				action: 'Get many manufacturers',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a manufacturer',
				action: 'Update a manufacturer',
			},
		],
		default: 'get',
		displayOptions: {
			show: {
				resource: ['manufacturer'],
			},
		},
	},
	...create.description,
	...deleteManufacturer.description,
	...get.description,
	...getMany.description,
	...update.description,
];
