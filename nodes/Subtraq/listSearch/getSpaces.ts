import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { subtraqApiRequest } from '../shared/transport';

/** Workspaces for the resource locator. The value is the workspace slug, as the API expects. */
export async function getSpaces(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const qs: IDataObject = { limit: 100 };
	if (paginationToken) qs.cursor = paginationToken;

	const page = await subtraqApiRequest.call(this, { method: 'GET', path: '/spaces', qs });
	const needle = (filter ?? '').trim().toLowerCase();
	const results: INodeListSearchItems[] = ((page.data as IDataObject[] | undefined) ?? [])
		.filter(
			(s) =>
				!needle ||
				String(s.name ?? '')
					.toLowerCase()
					.includes(needle) ||
				String(s.slug ?? '')
					.toLowerCase()
					.includes(needle),
		)
		.map((s) => ({
			name: `${String(s.name ?? s.slug)} (${String(s.slug)})`,
			value: String(s.slug),
		}));

	return {
		results,
		paginationToken: typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : undefined,
	};
}
