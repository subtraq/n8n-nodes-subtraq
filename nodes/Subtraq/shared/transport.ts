import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'subtraqApi';

const DEFAULT_BASE_URL = 'https://subtraq.co';

const API_REFERENCE = 'https://subtraq.co/en/developers';

type Context = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

export type SubtraqRequest = {
	method: IHttpRequestMethods;
	/** Path under `/api/v1`, starting with a slash. */
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
	headers?: Record<string, string>;
	itemIndex?: number;
};

/**
 * What went wrong, and what to do about it, for each stable error code of the
 * Subtraq API (`{ "error": { "code", "message" } }`). The node shows this text
 * first; the server's own message follows it in the error details.
 */
const ERRORS: Record<string, { message: string; hint: string }> = {
	missing_token: {
		message: 'No API key was sent',
		hint: 'Open the Subtraq credential and paste an API key.',
	},
	invalid_token: {
		message: 'The API key is unknown or revoked',
		hint: 'A key is shown only once in Subtraq. If it is lost or revoked, create a new one under Settings → API keys.',
	},
	missing_scope: {
		message: 'The API key does not have the permission this operation needs',
		hint: 'Keys cannot be widened: create a new key under Settings → API keys with the permission named in the details (links:read, links:write, analytics:read, events:write or webhooks:write).',
	},
	bad_request: {
		message: 'Subtraq refused the parameters',
		hint: 'The details list each parameter that was refused.',
	},
	bad_json: {
		message: 'Subtraq could not read the request body',
		hint: 'Check the values passed to the node, especially JSON fields such as Metadata.',
	},
	space_not_found: {
		message: 'This workspace does not exist in the account of this API key',
		hint: 'Pick the workspace from the list, or check its slug: it is the part of the dashboard URL that names the workspace.',
	},
	space_limit_reached: {
		message: 'Your Subtraq plan has no workspace left',
		hint: 'The workspace limit of your plan is reached: upgrade the plan in Subtraq. Retrying will not help.',
	},
	link_limit_reached: {
		message: 'Your Subtraq plan has no new link left this month',
		hint: 'Upgrade the plan in Subtraq, or wait for next month. Placements under an existing link are not counted. Retrying will not help.',
	},
	not_found: {
		message: 'Not found in the account of this API key',
		hint: 'Check the identifier given to the node.',
	},
	parent_not_found: {
		message: 'The parent link does not exist in this workspace',
		hint: 'A placement must be created in the workspace of its parent link.',
	},
	slug_taken: {
		message: 'This short link address is already taken',
		hint: 'Choose another slug. When Subtraq suggests a free one, it is in the details.',
	},
	placement_slug_taken: {
		message: 'This short link address is already taken',
		hint: 'Choose another slug for the placement, or leave it empty to get a random one.',
	},
	slug_reserved: {
		message: 'This slug is reserved by Subtraq',
		hint: 'Choose another slug, or leave it empty to get a random one.',
	},
	slug_invalid: {
		message: 'This slug is not valid',
		hint: 'Use letters, digits and hyphens, or leave it empty to get a random one.',
	},
	child_destination: {
		message: 'A placement has no destination of its own',
		hint: 'A placement inherits the destination of its parent link: change the destination on the parent link.',
	},
	placement_domain: {
		message: 'A placement keeps the domain of its parent link',
		hint: 'Change the domain on the parent link: its placements follow it.',
	},
	domain_unknown: {
		message: 'This domain is not verified in your Subtraq account',
		hint: 'Use a domain verified in Subtraq, or leave the field empty to use the default domain of the workspace.',
	},
	domain_other_space: {
		message: 'This domain is reserved for another workspace',
		hint: 'Use the domain of this workspace, or leave the field empty.',
	},
	destination_refused: {
		message: 'This destination is reported as dangerous',
		hint: 'Subtraq refuses phishing and malware destinations. Check the address of the page.',
	},
	destination_shortener: {
		message: 'This destination is itself a short link',
		hint: 'Give the final address of the page, not a shortened one.',
	},
	destination_loop: {
		message: 'This destination is already a Subtraq short link',
		hint: 'Give the final address of the page directly.',
	},
	webhook_url_invalid: {
		message: 'Subtraq refused the webhook address of this workflow',
		hint: 'The address is not a valid URL.',
	},
	webhook_url_not_https: {
		message: 'Subtraq only calls https addresses',
		hint: 'On a self-hosted n8n, set the WEBHOOK_URL environment variable of your instance to its public https address.',
	},
	webhook_url_private: {
		message: 'Subtraq does not call local or private addresses',
		hint: 'Subtraq calls this workflow over the internet: on a self-hosted n8n, set the WEBHOOK_URL environment variable of your instance to its public https address.',
	},
	webhook_limit_reached: {
		message: 'The Subtraq account has reached its maximum number of webhooks',
		hint: 'Remove a webhook you no longer use, in Subtraq or by deactivating its workflow, then activate this workflow again.',
	},
};

export async function getBaseUrl(this: Context): Promise<string> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const raw = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
	return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * One call to the Subtraq API.
 *
 * HTTP errors are read here rather than left to n8n's generic handling: a
 * Subtraq error carries a stable `code`, sometimes `details` (the parameters
 * that were refused, a free slug to use instead), which is what the user needs
 * to fix the workflow.
 */
export async function subtraqApiRequest(
	this: Context,
	request: SubtraqRequest,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: request.method,
		baseURL: `${await getBaseUrl.call(this)}/api/v1`,
		url: request.path,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { Accept: 'application/json', ...(request.headers ?? {}) },
	};
	if (request.body !== undefined) options.body = request.body;
	if (request.qs !== undefined) options.qs = request.qs;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL_NAME,
		options,
	)) as { statusCode: number; body: unknown };

	const body = (response.body ?? {}) as IDataObject;
	if (response.statusCode >= 200 && response.statusCode < 300) return body;

	throw toNodeApiError.call(this, response.statusCode, body, request.itemIndex);
}

/** Walks a Subtraq list (`data` / `nextCursor`) and returns its items. */
export async function subtraqApiRequestAllItems(
	this: Context,
	request: SubtraqRequest,
	limit?: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;
	do {
		const pageSize = limit === undefined ? 100 : Math.min(100, limit - items.length);
		const page = await subtraqApiRequest.call(this, {
			...request,
			qs: { ...(request.qs ?? {}), limit: pageSize, ...(cursor ? { cursor } : {}) },
		});
		items.push(...((page.data as IDataObject[] | undefined) ?? []));
		cursor = typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : undefined;
	} while (cursor && (limit === undefined || items.length < limit));

	return limit === undefined ? items : items.slice(0, limit);
}

export function toNodeApiError(
	this: Context,
	statusCode: number,
	body: IDataObject,
	itemIndex?: number,
): NodeApiError {
	const error = (body.error ?? {}) as IDataObject;
	const code = typeof error.code === 'string' ? error.code : undefined;
	const known = code ? ERRORS[code] : undefined;
	// `GET /links?space=unknown` answers 404 with a `warning` rather than an `error`.
	const serverMessage =
		typeof error.message === 'string'
			? error.message
			: typeof body.warning === 'string'
				? body.warning
				: undefined;

	const message = known
		? `${known.message} (${code})`
		: code
			? `Subtraq refused the request (${code})`
			: `Subtraq answered with HTTP ${statusCode}`;
	const parts = [known?.hint ?? `See the Subtraq API reference: ${API_REFERENCE}`];
	if (serverMessage) parts.push(`Subtraq's message: ${serverMessage}`);
	if (error.details) parts.push(`Details: ${JSON.stringify(error.details)}`);

	return new NodeApiError(this.getNode(), body as JsonObject, {
		message,
		description: parts.join('\n\n'),
		httpCode: String(statusCode),
		itemIndex,
	});
}

/** The HTTP status carried by an error thrown by `subtraqApiRequest`. */
export function httpCodeOf(error: unknown): string | undefined {
	if (error instanceof NodeApiError) return error.httpCode ?? undefined;
	return undefined;
}
