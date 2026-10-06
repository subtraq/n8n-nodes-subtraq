import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	idempotencyHeader,
	linkLocator,
	locatorValue,
	paginationFields,
	withoutEmpty,
	workspaceLocator,
} from '../shared/fields';
import { subtraqApiRequest, subtraqApiRequestAllItems } from '../shared/transport';

const UTM_FIELDS: INodeProperties[] = [
	{
		displayName: 'UTM Campaign',
		name: 'utmCampaign',
		type: 'string',
		default: '',
		description: 'Value of utm_campaign, up to 80 characters',
	},
	{
		displayName: 'UTM Content',
		name: 'utmContent',
		type: 'string',
		default: '',
		description: 'Value of utm_content, up to 80 characters',
	},
	{
		displayName: 'UTM Medium',
		name: 'utmMedium',
		type: 'string',
		default: '',
		description: 'Value of utm_medium, up to 80 characters',
	},
	{
		displayName: 'UTM Source',
		name: 'utmSource',
		type: 'string',
		default: '',
		description: 'Value of utm_source, up to 80 characters',
	},
	{
		displayName: 'UTM Term',
		name: 'utmTerm',
		type: 'string',
		default: '',
		description: 'Value of utm_term, up to 80 characters',
	},
];

export const linkOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['link'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Create a short link to a page, or a placement under an existing link to track one post or ad',
				action: 'Create a link',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a link with its final destination and its clicks over 30 days',
				action: 'Get a link',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List links, active or archived',
				action: 'Get many links',
			},
			{
				name: 'Update',
				value: 'update',
				description:
					'Change the destination, label or address of a link, or archive it. Links are never deleted.',
				action: 'Update a link',
			},
		],
		default: 'create',
	},
];

export const linkFields: INodeProperties[] = [
	/* ------------------------------- link:create ------------------------------ */
	workspaceLocator(
		{ resource: ['link'], operation: ['create'] },
		'The workspace (client, brand or project) the link belongs to',
	),
	{
		displayName: 'Link Type',
		name: 'linkType',
		type: 'options',
		noDataExpression: true,
		default: 'parent',
		displayOptions: { show: { resource: ['link'], operation: ['create'] } },
		options: [
			{
				name: 'Link to a Page',
				value: 'parent',
				description: 'A short link that redirects to a destination URL',
			},
			{
				name: 'Placement Under a Link',
				value: 'placement',
				description:
					'A short link for one post, ad or email: it inherits the destination of its parent link and carries its own UTM parameters, so each placement is measured on its own',
			},
		],
	},
	{
		displayName: 'Destination URL',
		name: 'destination',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/landing-page',
		description: 'The page the short link redirects to',
		displayOptions: { show: { resource: ['link'], operation: ['create'], linkType: ['parent'] } },
	},
	linkLocator(
		{ resource: ['link'], operation: ['create'], linkType: ['placement'] },
		{
			displayName: 'Parent Link',
			name: 'parentId',
			description: 'The link whose destination the placement inherits. It must be in the same workspace.',
		},
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['link'], operation: ['create'] } },
		options: [
			{
				displayName: 'Domain',
				name: 'domain',
				type: 'string',
				default: '',
				placeholder: 'e.g. links.example.com',
				description:
					'The domain that carries the short link. Empty: the same choice as in the Subtraq app (the domain of the workspace, then the domain of the account, then the free address of the workspace). A placement keeps the domain of its parent.',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'A key of your choice. Sending the same key again returns the link created the first time instead of creating a second one.',
			},
			{
				displayName: 'Label',
				name: 'label',
				type: 'string',
				default: '',
				placeholder: 'e.g. Meta ad, March',
				description: 'A name for the link or placement, shown in reports. Up to 120 characters.',
			},
			{
				displayName: 'Slug',
				name: 'slug',
				type: 'string',
				default: '',
				placeholder: 'e.g. spring-sale',
				description: 'The path of the short link. A random one is chosen when empty.',
			},
			...UTM_FIELDS,
		],
	},

	/* --------------------------- link:get / update ---------------------------- */
	linkLocator(
		{ resource: ['link'], operation: ['get', 'update'] },
		{ description: 'The link to read or change' },
	),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['link'], operation: ['update'] } },
		options: [
			{
				displayName: 'Archived',
				name: 'archived',
				type: 'boolean',
				default: true,
				description:
					'Whether the link is archived. An archived link stops redirecting but keeps its history; set it to false to reactivate the link.',
			},
			{
				displayName: 'Destination URL',
				name: 'destination',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/new-page',
				description: 'New destination. Parent links only: a placement inherits the destination of its parent.',
			},
			{
				displayName: 'Domain',
				name: 'domain',
				type: 'string',
				default: '',
				placeholder: 'e.g. links.example.com',
				description:
					'New domain for the address of the link. The old address keeps redirecting, and its clicks still count on this link.',
			},
			{
				displayName: 'Label',
				name: 'label',
				type: 'string',
				default: '',
				description: 'New label',
			},
			{
				displayName: 'Slug',
				name: 'slug',
				type: 'string',
				default: '',
				description:
					'New path for the address of the link. The old address keeps redirecting, and its clicks still count on this link.',
			},
		],
	},

	/* ------------------------------ link:getAll ------------------------------- */
	...paginationFields({ resource: ['link'], operation: ['getAll'] }),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['link'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'active',
				options: [
					{ name: 'Active', value: 'active' },
					{ name: 'All', value: 'all' },
					{ name: 'Archived', value: 'archived' },
				],
				description: 'Which links to return',
			},
			{
				displayName: 'Workspace Slug',
				name: 'space',
				type: 'string',
				default: '',
				placeholder: 'e.g. maison-lartigue',
				description: 'Only the links of this workspace. All workspaces when empty.',
			},
		],
	},
];

export async function executeLink(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation === 'create') {
		const space = locatorValue.call(this, 'space', i);
		const linkType = this.getNodeParameter('linkType', i) as string;
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const { idempotencyKey, ...rest } = additional;

		const body: IDataObject = { space, ...rest };
		if (linkType === 'placement') {
			body.parentId = locatorValue.call(this, 'parentId', i);
		} else {
			body.destination = this.getNodeParameter('destination', i) as string;
		}

		return await subtraqApiRequest.call(this, {
			method: 'POST',
			path: '/links',
			body: withoutEmpty(body),
			headers: idempotencyHeader(idempotencyKey),
			itemIndex: i,
		});
	}

	if (operation === 'get') {
		const id = locatorValue.call(this, 'linkId', i);
		return await subtraqApiRequest.call(this, {
			method: 'GET',
			path: `/links/${encodeURIComponent(id)}`,
			itemIndex: i,
		});
	}

	if (operation === 'update') {
		const id = locatorValue.call(this, 'linkId', i);
		const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
		const body = withoutEmpty(updateFields);
		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Nothing to update', {
				description: 'Add at least one field under Update Fields.',
				itemIndex: i,
			});
		}
		return await subtraqApiRequest.call(this, {
			method: 'PATCH',
			path: `/links/${encodeURIComponent(id)}`,
			body,
			itemIndex: i,
		});
	}

	if (operation === 'getAll') {
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		return await subtraqApiRequestAllItems.call(
			this,
			{ method: 'GET', path: '/links', qs: withoutEmpty(filters), itemIndex: i },
			limit,
		);
	}

	throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
		itemIndex: i,
	});
}
