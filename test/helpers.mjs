// Test doubles for the n8n execution contexts. They record every HTTP call the
// nodes make and answer from a scripted list, the way n8n's
// `httpRequestWithAuthentication` answers with `returnFullResponse: true`.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const { Subtraq } = require('../dist/nodes/Subtraq/Subtraq.node.js');
export const { SubtraqTrigger } = require('../dist/nodes/SubtraqTrigger/SubtraqTrigger.node.js');
export const { SubtraqApi } = require('../dist/credentials/SubtraqApi.credentials.js');
export const signature = require('../dist/nodes/Subtraq/shared/signature.js');
export const { NodeApiError, NodeOperationError } = require('n8n-workflow');

const NODE = {
	id: 'node-1',
	name: 'Subtraq',
	type: 'n8n-nodes-subtraq.subtraq',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export const ok = (body, statusCode = 200) => ({ statusCode, body, headers: {} });
export const refusal = (statusCode, code, message, details) => ({
	statusCode,
	body: { error: { code, message, ...(details ? { details } : {}) } },
	headers: {},
});

function readParameter(params, name, fallback, options) {
	let value = params[name];
	if (value === undefined) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Parameter "${name}" read but not set by the test`);
	}
	if (options?.extractValue && value && typeof value === 'object' && 'value' in value) {
		value = value.value;
	}
	return value;
}

function recorder(responses, calls) {
	return async (credentialName, options) => {
		calls.push({ credentialName, ...options });
		if (responses.length === 0)
			throw new Error(`Unexpected call: ${options.method} ${options.url}`);
		const next = responses.shift();
		return typeof next === 'function' ? next(options) : next;
	};
}

export function executeContext({
	params,
	items = [{ json: {} }],
	responses = [],
	credentials = { apiKey: 'stq_sk_test', baseUrl: 'https://subtraq.test/' },
	continueOnFail = false,
}) {
	const calls = [];
	const ctx = {
		getInputData: () => items,
		getNodeParameter: (name, _i, fallback, options) =>
			readParameter(params, name, fallback, options),
		getNode: () => NODE,
		getCredentials: async () => credentials,
		continueOnFail: () => continueOnFail,
		helpers: { httpRequestWithAuthentication: recorder(responses, calls) },
	};
	return { ctx, calls, responses };
}

export function hookContext({
	params,
	responses = [],
	staticData = {},
	webhookUrl = 'https://n8n.example.com/webhook/abc/webhook',
}) {
	const calls = [];
	const ctx = {
		getNodeParameter: (name, fallback, options) => readParameter(params, name, fallback, options),
		getNode: () => ({ ...NODE, name: 'Subtraq Trigger', type: 'n8n-nodes-subtraq.subtraqTrigger' }),
		getCredentials: async () => ({ apiKey: 'stq_sk_test', baseUrl: 'https://subtraq.test' }),
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => webhookUrl,
		getWorkflow: () => ({ id: 'wf1', name: 'Sales to CRM', active: true }),
		helpers: { httpRequestWithAuthentication: recorder(responses, calls) },
	};
	return { ctx, calls, staticData };
}

export function webhookContext({ params, rawBody, headers = {}, staticData = {} }) {
	const response = { statusCode: 200, sent: undefined };
	const lowered = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	const req = {
		rawBody: Buffer.from(rawBody, 'utf8'),
		readRawBody: async () => {},
		header: (name) => lowered[name.toLowerCase()],
	};
	const res = {
		status(code) {
			response.statusCode = code;
			return this;
		},
		json(body) {
			response.sent = body;
			return this;
		},
	};
	const ctx = {
		getRequestObject: () => req,
		getResponseObject: () => res,
		getWorkflowStaticData: () => staticData,
		getBodyData: () => JSON.parse(rawBody),
		getNodeParameter: (name, fallback) => readParameter(params, name, fallback),
		getNode: () => ({ ...NODE, name: 'Subtraq Trigger' }),
		helpers: {
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		},
	};
	return { ctx, response };
}

/** Signs a body exactly as the Subtraq server does: HMAC-SHA256 of "<timestamp>.<body>". */
export async function sign(secret, rawBody, timestamp = Math.floor(Date.now() / 1000)) {
	const { createHmac } = await import('node:crypto');
	const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
	return `t=${timestamp},v1=${v1}`;
}
