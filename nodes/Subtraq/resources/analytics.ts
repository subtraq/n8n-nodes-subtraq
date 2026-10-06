import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { locatorValue, workspaceLocator } from '../shared/fields';
import { subtraqApiRequest } from '../shared/transport';

const SHOW = { resource: ['analytics'], operation: ['getSummary', 'getPlacements'] };

export const analyticsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['analytics'] } },
		options: [
			{
				name: 'Get Per Placement',
				value: 'getPlacements',
				description:
					'One item per link and placement: clicks, leads, sales and attributed revenue. Ready for a spreadsheet.',
				action: 'Get analytics per placement',
			},
			{
				name: 'Get Summary',
				value: 'getSummary',
				description:
					'The totals of a workspace: clicks, leads, sales, attributed and unattributed revenue',
				action: 'Get the analytics summary of a workspace',
			},
		],
		default: 'getSummary',
	},
];

export const analyticsFields: INodeProperties[] = [
	workspaceLocator(SHOW, 'The workspace (client, brand or project) to read'),
	{
		displayName: 'Period',
		name: 'period',
		type: 'options',
		default: '30d',
		displayOptions: { show: SHOW },
		options: [
			{ name: 'Last 7 Days', value: '7d' },
			{ name: 'Last 30 Days', value: '30d' },
			{ name: 'Last 90 Days', value: '90d' },
			{ name: 'All Time', value: 'all' },
		],
	},
	{
		displayName: 'Attribution Model',
		name: 'model',
		type: 'options',
		default: 'first',
		displayOptions: { show: SHOW },
		description:
			'How each conversion is credited. In every model, attributed plus unattributed revenue equals total revenue.',
		options: [
			{
				name: 'First Click',
				value: 'first',
				description: 'The first placement the person clicked gets the credit. The reference in Subtraq.',
			},
			{
				name: 'Last Click',
				value: 'last',
				description: 'The last placement clicked before the conversion gets the credit',
			},
			{
				name: 'Linear',
				value: 'linear',
				description: 'The credit is shared between every placement the person clicked, to the cent',
			},
		],
	},
	{
		displayName:
			'Amounts are in cents, as everywhere in Subtraq: 4300 means 43.00. Subtraq does not convert currencies: when "mixedCurrencies" is true, the totals only cover "currency".',
		name: 'amountsNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: SHOW },
	},
];

export async function executeAnalytics(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation !== 'getSummary' && operation !== 'getPlacements') {
		throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
			itemIndex: i,
		});
	}

	const report = await subtraqApiRequest.call(this, {
		method: 'GET',
		path: '/analytics',
		qs: {
			space: locatorValue.call(this, 'space', i),
			period: this.getNodeParameter('period', i) as string,
			model: this.getNodeParameter('model', i) as string,
		},
		itemIndex: i,
	});

	const space = (report.space ?? {}) as IDataObject;
	const totals = (report.totals ?? {}) as IDataObject;

	if (operation === 'getSummary') {
		return {
			space: space.slug,
			spaceName: space.name,
			period: report.period,
			model: report.model,
			clicks: totals.clicks,
			leads: totals.leads,
			sales: totals.sales,
			revenueAttributedMinor: totals.revenueAttributedMinor,
			revenueUnattributedMinor: totals.revenueUnattributedMinor,
			currency: totals.currency,
			mixedCurrencies: totals.mixedCurrencies,
			byCurrency: totals.byCurrency,
			multiTouchPeople: report.multiTouchPeople,
			unattributed: report.unattributed,
		};
	}

	// One item per placement, each carrying the context it was computed in: a row of a
	// spreadsheet must still say which workspace, period, model and currency it belongs to.
	return ((report.placements as IDataObject[] | undefined) ?? []).map((row) => ({
		space: space.slug,
		period: report.period,
		model: report.model,
		currency: report.currency,
		...row,
	}));
}
