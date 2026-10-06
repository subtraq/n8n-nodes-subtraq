import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class SubtraqApi implements ICredentialType {
	name = 'subtraqApi';

	displayName = 'Subtraq API';

	icon: Icon = { light: 'file:../icons/subtraq.svg', dark: 'file:../icons/subtraq.dark.svg' };

	documentationUrl = 'https://subtraq.co/en/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'stq_sk_…',
			description:
				'Create a key in Subtraq under Settings → API keys. Tick the permissions the operations you use need: links:read (workspaces, links, and the connection test), links:write, analytics:read, events:write (sales), and webhooks:write for the Subtraq Trigger node.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://subtraq.co',
			description: 'The address of the Subtraq server. Keep the default.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/spaces',
			qs: { limit: 1 },
			method: 'GET',
		},
	};
}
