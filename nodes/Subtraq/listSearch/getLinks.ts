import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { subtraqApiRequest } from '../shared/transport';

/**
 * Links for the resource locator, active and archived. When the node already
 * names a workspace, only that workspace's links are listed.
 */
export async function getLinks(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const qs: IDataObject = { limit: 100, status: 'all' };
	if (paginationToken) qs.cursor = paginationToken;
	const space = currentSpace.call(this);
	if (space) qs.space = space;

	const page = await subtraqApiRequest.call(this, { method: 'GET', path: '/links', qs });
	const needle = (filter ?? '').trim().toLowerCase();
	const results: INodeListSearchItems[] = ((page.data as IDataObject[] | undefined) ?? [])
		.filter((link) =>
			!needle
				? true
				: [link.shortUrl, link.label, link.destination, link.slug].some((v) =>
						String(v ?? '')
							.toLowerCase()
							.includes(needle),
					),
		)
		.map((link) => ({
			name: `${String(link.shortUrl ?? link.slug)}${link.label ? ` (${String(link.label)})` : ''}${link.status === 'archived' ? ' [archived]' : ''}`,
			value: String(link.id),
			url: typeof link.shortUrl === 'string' ? link.shortUrl : undefined,
		}));

	return {
		results,
		paginationToken: typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : undefined,
	};
}

/** The workspace slug the node names, when it names one (the Workspace field of Link › Create). */
function currentSpace(this: ILoadOptionsFunctions): string | undefined {
	try {
		const value = this.getCurrentNodeParameter('space', { extractValue: true });
		return typeof value === 'string' && value.trim() ? value.trim() : undefined;
	} catch {
		return undefined;
	}
}
