import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

type Show = Record<string, Array<string | boolean>>;

/** The workspace picker: a list of the account's workspaces, or a slug typed by hand. */
export function workspaceLocator(show: Show, description: string): INodeProperties {
	return {
		displayName: 'Workspace',
		name: 'space',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		displayOptions: { show },
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
				hint: 'The slug is the part of the Subtraq dashboard URL that names the workspace',
			},
		],
	};
}

/** The link picker: a list of the account's links, or an ID typed by hand. */
export function linkLocator(
	show: Show,
	options: { displayName?: string; name?: string; description: string },
): INodeProperties {
	return {
		displayName: options.displayName ?? 'Link',
		name: options.name ?? 'linkId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: options.description,
		displayOptions: { show },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'getLinks', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. cm8x0k2a90001',
			},
		],
	};
}

/** Return All / Limit, as every "Get Many" operation of n8n offers them. */
export function paginationFields(show: Show): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}

/** A resource locator's value, trimmed. */
export function locatorValue(this: IExecuteFunctions, name: string, i: number): string {
	const value = this.getNodeParameter(name, i, '', { extractValue: true });
	return String(value ?? '').trim();
}

/** Drops the keys whose value is an empty string, so the API applies its own defaults. */
export function withoutEmpty(fields: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		result[key] = typeof value === 'string' ? value.trim() : value;
	}
	return result;
}

/** Idempotency-Key header, when the user gave one. */
export function idempotencyHeader(key: unknown): Record<string, string> | undefined {
	return typeof key === 'string' && key.trim() ? { 'Idempotency-Key': key.trim() } : undefined;
}
