import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { getLinks } from './listSearch/getLinks';
import { getSpaces } from './listSearch/getSpaces';
import { analyticsFields, analyticsOperations, executeAnalytics } from './resources/analytics';
import { executeLink, linkFields, linkOperations } from './resources/link';
import { executeSale, saleFields, saleOperations } from './resources/sale';
import { executeSpace, spaceFields, spaceOperations } from './resources/space';

/**
 * The Subtraq action node.
 *
 * Programmatic style, not declarative: one call to the analytics endpoint
 * becomes either one summary item or one item per placement, a sale is refused
 * before any call when nothing identifies the buyer, and every API error is
 * turned into a message that says what to do, from its stable code.
 */
export class Subtraq implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Subtraq',
		name: 'subtraq',
		icon: { light: 'file:../../icons/subtraq.svg', dark: 'file:../../icons/subtraq.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create tracked short links, read attribution and record sales with Subtraq',
		defaults: {
			name: 'Subtraq',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'subtraqApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Analytics', value: 'analytics' },
					{ name: 'Link', value: 'link' },
					{ name: 'Sale', value: 'sale' },
					{ name: 'Workspace', value: 'space' },
				],
				default: 'link',
			},
			...linkOperations,
			...linkFields,
			...analyticsOperations,
			...analyticsFields,
			...saleOperations,
			...saleFields,
			...spaceOperations,
			...spaceFields,
		],
	};

	methods = {
		listSearch: {
			getLinks,
			getSpaces,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let result: IDataObject | IDataObject[];
				if (resource === 'link') result = await executeLink.call(this, operation, i);
				else if (resource === 'analytics') result = await executeAnalytics.call(this, operation, i);
				else if (resource === 'sale') result = await executeSale.call(this, operation, i);
				else if (resource === 'space') result = await executeSpace.call(this, operation, i);
				else {
					throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`, {
						itemIndex: i,
					});
				}

				for (const json of Array.isArray(result) ? result : [result]) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors hand back an error of their own kind unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
