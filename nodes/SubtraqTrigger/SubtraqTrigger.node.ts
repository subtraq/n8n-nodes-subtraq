import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { getSpaces } from '../Subtraq/listSearch/getSpaces';
import { SIGNATURE_HEADER, verifySignature } from '../Subtraq/shared/signature';
import { httpCodeOf, subtraqApiRequest } from '../Subtraq/shared/transport';

/** The two events Subtraq sends (`WEBHOOK_EVENTS` on the server). */
const EVENTS = [
	{
		name: 'New Lead',
		value: 'lead',
		description: 'A person left their email address on a site tracked by Subtraq',
	},
	{
		name: 'New Sale',
		value: 'sale',
		description: 'A sale was recorded: through the API, a Stripe webhook or this node',
	},
];

type Subscription = {
	id?: string;
	url?: string;
	events?: string[];
	enabled?: boolean;
	space?: string | null;
};

function sameEvents(a: string[] | undefined, b: string[]): boolean {
	if (!a) return false;
	const left = new Set(a);
	const right = new Set(b);
	return left.size === right.size && [...right].every((e) => left.has(e));
}

/** The workspace slug the node listens to, or null for every workspace of the account. */
function selectedSpace(this: IHookFunctions): string | null {
	if ((this.getNodeParameter('scope', 'all') as string) !== 'one') return null;
	const value = this.getNodeParameter('space', '', { extractValue: true });
	const slug = String(value ?? '').trim();
	return slug || null;
}

export class SubtraqTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Subtraq Trigger',
		name: 'subtraqTrigger',
		icon: { light: 'file:../../icons/subtraq.svg', dark: 'file:../../icons/subtraq.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Subtraq records a new lead or a new sale',
		defaults: {
			name: 'Subtraq Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'subtraqApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['sale'],
				options: EVENTS,
				description:
					'The events that start the workflow. Activating the workflow subscribes to them in Subtraq; deactivating it removes the subscription.',
			},
			{
				displayName: 'Workspaces',
				name: 'scope',
				type: 'options',
				default: 'all',
				options: [
					{
						name: 'All Workspaces',
						value: 'all',
						description: 'Every workspace of the account, including the ones created later',
					},
					{
						name: 'One Workspace',
						value: 'one',
						description: 'Only the leads and sales of one client, brand or project',
					},
				],
			},
			{
				displayName: 'Workspace',
				name: 'space',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The workspace to listen to',
				displayOptions: { show: { scope: ['one'] } },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'getSpaces', searchable: true },
					},
					{
						displayName: 'By Slug',
						name: 'slug',
						type: 'string',
						placeholder: 'e.g. maison-lartigue',
					},
				],
			},
			{
				displayName:
					'Subtraq calls this workflow over the internet: the webhook address of your n8n must be public and start with https://. The API key needs the webhooks:write permission. Amounts are in cents (amountMinor: 4300 means 43.00), and "placement" is null when Subtraq could not tie the conversion to a click.',
				name: 'triggerNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	methods = {
		listSearch: {
			getSpaces,
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const id = webhookData.webhookId as string | undefined;
				if (!id || !webhookData.webhookSecret) return false;

				let subscription: Subscription;
				try {
					subscription = (await subtraqApiRequest.call(this, {
						method: 'GET',
						path: `/webhooks/${encodeURIComponent(id)}`,
					})) as Subscription;
				} catch (error) {
					if (httpCodeOf(error) === '404') {
						delete webhookData.webhookId;
						delete webhookData.webhookSecret;
						return false;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				const events = this.getNodeParameter('events') as string[];
				return (
					subscription.url === this.getNodeWebhookUrl('default') &&
					subscription.enabled !== false &&
					sameEvents(subscription.events, events) &&
					(subscription.space ?? null) === selectedSpace.call(this)
				);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				const space = selectedSpace.call(this);
				const webhookData = this.getWorkflowStaticData('node');

				// A subscription left behind for this very address (n8n restarted, events
				// or workspace changed) would deliver every event twice: remove it first.
				const existing = await subtraqApiRequest.call(this, {
					method: 'GET',
					path: '/webhooks',
					qs: { limit: 100 },
				});
				for (const old of ((existing.data as Subscription[] | undefined) ?? []).filter(
					(w) => w.url === webhookUrl && w.id,
				)) {
					try {
						await subtraqApiRequest.call(this, {
							method: 'DELETE',
							path: `/webhooks/${encodeURIComponent(String(old.id))}`,
						});
					} catch (error) {
						if (httpCodeOf(error) !== '404')
							throw new NodeApiError(this.getNode(), error as JsonObject);
					}
				}

				const body: IDataObject = { url: webhookUrl, events };
				if (space) body.space = space;
				const created = await subtraqApiRequest.call(this, {
					method: 'POST',
					path: '/webhooks',
					body,
				});

				if (typeof created.id !== 'string' || typeof created.secret !== 'string') {
					throw new NodeApiError(this.getNode(), created as JsonObject, {
						message: 'Subtraq created the subscription without returning its ID and secret',
						description: 'Deactivate and activate the workflow again.',
					});
				}
				webhookData.webhookId = created.id;
				webhookData.webhookSecret = created.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const id = webhookData.webhookId as string | undefined;
				if (id) {
					try {
						await subtraqApiRequest.call(this, {
							method: 'DELETE',
							path: `/webhooks/${encodeURIComponent(id)}`,
						});
					} catch (error) {
						if (httpCodeOf(error) !== '404')
							throw new NodeApiError(this.getNode(), error as JsonObject);
					}
				}
				delete webhookData.webhookId;
				delete webhookData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = this.getWorkflowStaticData('node').webhookSecret as string | undefined;

		if (!req.rawBody) await req.readRawBody();
		const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
		const header = req.header(SIGNATURE_HEADER);

		if (!secret || !verifySignature(secret, header, rawBody)) {
			const res = this.getResponseObject();
			res.status(401).json({ error: 'invalid_signature' });
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData();
		const events = this.getNodeParameter('events') as string[];
		if (typeof body.event === 'string' && !events.includes(body.event)) {
			return { webhookResponse: { received: true } };
		}

		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}
