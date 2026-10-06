import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { idempotencyHeader, paginationFields, withoutEmpty } from '../shared/fields';
import { subtraqApiRequest, subtraqApiRequestAllItems } from '../shared/transport';

export const spaceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['space'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a workspace for a client, a brand or a project',
				action: 'Create a workspace',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the workspaces of the account',
				action: 'Get many workspaces',
			},
		],
		default: 'getAll',
	},
];

export const spaceFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Maison Lartigue',
		description: 'The name shown in Subtraq, 2 to 80 characters',
		displayOptions: { show: { resource: ['space'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['space'], operation: ['create'] } },
		options: [
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'A key of your choice. Sending the same key again returns the workspace created the first time instead of creating a second one.',
			},
			{
				displayName: 'Slug',
				name: 'slug',
				type: 'string',
				default: '',
				placeholder: 'e.g. maison-lartigue',
				description: 'The workspace slug used in URLs and by the API. Derived from the name when empty.',
			},
		],
	},
	...paginationFields({ resource: ['space'], operation: ['getAll'] }),
];

export async function executeSpace(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation === 'create') {
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const { idempotencyKey, ...rest } = additional;
		return await subtraqApiRequest.call(this, {
			method: 'POST',
			path: '/spaces',
			body: withoutEmpty({ name: this.getNodeParameter('name', i) as string, ...rest }),
			headers: idempotencyHeader(idempotencyKey),
			itemIndex: i,
		});
	}

	if (operation === 'getAll') {
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
		return await subtraqApiRequestAllItems.call(
			this,
			{ method: 'GET', path: '/spaces', itemIndex: i },
			limit,
		);
	}

	throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
		itemIndex: i,
	});
}
