import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { locatorValue, withoutEmpty, workspaceLocator } from '../shared/fields';
import { subtraqApiRequest } from '../shared/transport';

const SHOW = { resource: ['sale'], operation: ['record'] };

export const saleOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['sale'] } },
		options: [
			{
				name: 'Record',
				value: 'record',
				description:
					'Record a sale and tie it to the placement the person first came from. Recording the same invoice ID twice never counts it twice.',
				action: 'Record a sale',
			},
		],
		default: 'record',
	},
];

export const saleFields: INodeProperties[] = [
	workspaceLocator(SHOW, 'The workspace (client, brand or project) the sale belongs to'),
	{
		displayName: 'Amount (in Cents)',
		name: 'amount',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 0, numberPrecision: 0 },
		description:
			'The amount as a whole number of cents: 43.00 is 4300. Subtraq never stores money as a decimal number.',
		displayOptions: { show: SHOW },
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'string',
		required: true,
		default: 'USD',
		placeholder: 'e.g. EUR',
		description: 'Three-letter currency code (ISO 4217)',
		displayOptions: { show: SHOW },
	},
	{
		displayName: 'Invoice ID',
		name: 'invoiceId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. INV-2026-0042',
		description:
			'Your invoice or order number. It makes the call safe to repeat: the same invoice ID in the same workspace is recorded once.',
		displayOptions: { show: SHOW },
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		description:
			"The buyer's email address: the simplest way for Subtraq to find who they are. Give at least one of Email, External ID or Click ID.",
		displayOptions: { show: SHOW },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: SHOW },
		options: [
			{
				displayName: 'Click ID',
				name: 'clickId',
				type: 'string',
				default: '',
				description: 'The click identifier (st_id) Subtraq added to the landing page URL, if you kept it',
			},
			{
				displayName: 'Event Name',
				name: 'eventName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Annual plan',
				description: 'A name for the sale, up to 80 characters',
			},
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				description: 'The ID of the buyer in your own system, if they have one',
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description: 'Extra data stored with the sale, as a JSON object',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: "The buyer's name, up to 200 characters",
			},
		],
	},
];

function parseMetadata(this: IExecuteFunctions, value: unknown, i: number): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	let parsed: unknown = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new NodeOperationError(this.getNode(), 'Metadata is not valid JSON', {
				description: 'Write a JSON object, for example {"plan": "annual"}.',
				itemIndex: i,
			});
		}
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), 'Metadata must be a JSON object', {
			description: 'Write a JSON object, for example {"plan": "annual"}.',
			itemIndex: i,
		});
	}
	return Object.keys(parsed).length > 0 ? (parsed as IDataObject) : undefined;
}

export async function executeSale(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation !== 'record') {
		throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
			itemIndex: i,
		});
	}

	const amount = this.getNodeParameter('amount', i) as number;
	if (!Number.isInteger(amount) || amount < 0) {
		throw new NodeOperationError(this.getNode(), 'The amount must be a whole number of cents', {
			description: `Received ${amount}. Write 4300 for 43.00.`,
			itemIndex: i,
		});
	}

	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const { metadata, ...rest } = additional;
	const body = withoutEmpty({
		space: locatorValue.call(this, 'space', i),
		amount,
		currency: (this.getNodeParameter('currency', i) as string).toUpperCase(),
		invoiceId: this.getNodeParameter('invoiceId', i) as string,
		email: this.getNodeParameter('email', i, '') as string,
		...rest,
	});
	const meta = parseMetadata.call(this, metadata, i);
	if (meta) body.metadata = meta;

	if (!body.email && !body.externalId && !body.clickId) {
		throw new NodeOperationError(this.getNode(), 'Subtraq needs to know who bought', {
			description: 'Give at least one of Email, External ID or Click ID.',
			itemIndex: i,
		});
	}

	return await subtraqApiRequest.call(this, {
		method: 'POST',
		path: '/sales',
		body,
		itemIndex: i,
	});
}
