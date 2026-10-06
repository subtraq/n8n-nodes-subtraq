import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	hookContext,
	NodeApiError,
	ok,
	refusal,
	sign,
	signature,
	SubtraqTrigger,
	webhookContext,
} from './helpers.mjs';

const methods = new SubtraqTrigger().webhookMethods.default;
const URL_N8N = 'https://n8n.example.com/webhook/abc/webhook';
const ONE = { events: ['sale'], scope: 'one', space: { mode: 'list', value: 'maison-lartigue' } };
const ALL = { events: ['sale', 'lead'], scope: 'all' };
const BODY = JSON.stringify({ event: 'sale', amountMinor: 4300, currency: 'EUR', eventId: 'e1' });

/* ------------------------------- the signature ------------------------------ */

test('signature: a genuine call passes', async () => {
	assert.equal(signature.verifySignature('whsub_a', await sign('whsub_a', BODY), BODY), true);
});

test('signature: a changed body, a wrong secret, an old call or a garbled header are refused', async () => {
	const now = Math.floor(Date.now() / 1000);
	const header = await sign('whsub_a', BODY, now);
	assert.equal(signature.verifySignature('whsub_a', header, BODY.replace('4300', '9999')), false);
	assert.equal(signature.verifySignature('whsub_b', header, BODY), false);
	assert.equal(signature.verifySignature('whsub_a', await sign('whsub_a', BODY, now - 301), BODY), false);
	assert.equal(signature.verifySignature('whsub_a', 'garbage', BODY), false);
	assert.equal(signature.verifySignature('whsub_a', undefined, BODY), false);
	assert.equal(signature.verifySignature('', header, BODY), false);
});

/* ------------------------------ the subscription ---------------------------- */

test('create: removes a subscription left for the same address, then subscribes one workspace and keeps the secret', async () => {
	const { ctx, calls, staticData } = hookContext({
		params: ONE,
		responses: [
			ok({ data: [{ id: 'w_old', url: URL_N8N }, { id: 'w_other', url: 'https://crm.example.com/hook' }], nextCursor: null }),
			ok({ id: 'w_old', deleted: true }),
			ok({ id: 'w_new', secret: 'whsub_new', url: URL_N8N, events: ['sale'], space: 'maison-lartigue' }, 201),
		],
	});
	assert.equal(await methods.create.call(ctx), true);
	assert.deepEqual(
		calls.map((c) => `${c.method} ${c.url}`),
		['GET /webhooks', 'DELETE /webhooks/w_old', 'POST /webhooks'],
	);
	assert.deepEqual(calls[2].body, { url: URL_N8N, events: ['sale'], space: 'maison-lartigue' });
	assert.deepEqual(staticData, { webhookId: 'w_new', webhookSecret: 'whsub_new' });
});

test('create: every workspace sends no space at all', async () => {
	const { ctx, calls } = hookContext({
		params: ALL,
		responses: [ok({ data: [], nextCursor: null }), ok({ id: 'w1', secret: 'whsub_1' }, 201)],
	});
	await methods.create.call(ctx);
	assert.deepEqual(calls[1].body, { url: URL_N8N, events: ['sale', 'lead'] });
});

test('create: an http address refused by Subtraq explains WEBHOOK_URL', async () => {
	const { ctx } = hookContext({
		params: ALL,
		webhookUrl: 'http://localhost:5678/webhook/abc/webhook',
		responses: [
			ok({ data: [], nextCursor: null }),
			refusal(400, 'webhook_url_not_https', 'An https address is required.'),
		],
	});
	await assert.rejects(methods.create.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.match(error.description, /WEBHOOK_URL/);
		return true;
	});
});

test('checkExists: true only for the same address, events, workspace and an enabled subscription', async () => {
	const cases = [
		[ONE, { id: 'w1', url: URL_N8N, events: ['sale'], enabled: true, space: 'maison-lartigue' }, true],
		[ALL, { id: 'w1', url: URL_N8N, events: ['lead', 'sale'], enabled: true, space: null }, true],
		[ONE, { id: 'w1', url: URL_N8N, events: ['sale'], enabled: true, space: null }, false],
		[ALL, { id: 'w1', url: URL_N8N, events: ['sale'], enabled: true, space: null }, false],
		[ONE, { id: 'w1', url: 'https://elsewhere.example/hook', events: ['sale'], enabled: true, space: 'maison-lartigue' }, false],
		[ONE, { id: 'w1', url: URL_N8N, events: ['sale'], enabled: false, space: 'maison-lartigue' }, false],
	];
	for (const [params, subscription, expected] of cases) {
		const { ctx, calls } = hookContext({
			params,
			staticData: { webhookId: 'w1', webhookSecret: 'whsub_1' },
			responses: [ok(subscription)],
		});
		assert.equal(await methods.checkExists.call(ctx), expected, JSON.stringify(subscription));
		assert.equal(calls[0].url, '/webhooks/w1');
	}
});

test('checkExists: a subscription deleted in Subtraq is forgotten', async () => {
	const { ctx, staticData } = hookContext({
		params: ALL,
		staticData: { webhookId: 'w1', webhookSecret: 'whsub_1' },
		responses: [refusal(404, 'not_found', 'Unknown webhook.')],
	});
	assert.equal(await methods.checkExists.call(ctx), false);
	assert.deepEqual(staticData, {});
});

test('checkExists: any other refusal is reported, not taken for a missing subscription', async () => {
	const { ctx } = hookContext({
		params: ALL,
		staticData: { webhookId: 'w1', webhookSecret: 'whsub_1' },
		responses: [refusal(401, 'invalid_token', 'Unknown or revoked key.')],
	});
	await assert.rejects(methods.checkExists.call(ctx), NodeApiError);
});

test('delete: removes the subscription, and a 404 is not an error', async () => {
	for (const response of [ok({ id: 'w1', deleted: true }), refusal(404, 'not_found', 'Unknown webhook.')]) {
		const { ctx, calls, staticData } = hookContext({
			params: ALL,
			staticData: { webhookId: 'w1', webhookSecret: 'whsub_1' },
			responses: [response],
		});
		assert.equal(await methods.delete.call(ctx), true);
		assert.equal(`${calls[0].method} ${calls[0].url}`, 'DELETE /webhooks/w1');
		assert.deepEqual(staticData, {});
	}
});

/* -------------------------------- the delivery ------------------------------ */

test('webhook: a signed call starts the workflow with the event as sent', async () => {
	const { ctx } = webhookContext({
		params: ALL,
		rawBody: BODY,
		headers: { 'X-Subtraq-Signature': await sign('whsub_1', BODY) },
		staticData: { webhookSecret: 'whsub_1' },
	});
	const result = await new SubtraqTrigger().webhook.call(ctx);
	assert.deepEqual(result.workflowData[0][0].json, JSON.parse(BODY));
});

test('webhook: an unsigned or wrongly signed call gets a 401 and starts nothing', async () => {
	for (const headers of [{}, { 'X-Subtraq-Signature': await sign('whsub_other', BODY) }]) {
		const { ctx, response } = webhookContext({
			params: ALL,
			rawBody: BODY,
			headers,
			staticData: { webhookSecret: 'whsub_1' },
		});
		const result = await new SubtraqTrigger().webhook.call(ctx);
		assert.equal(result.noWebhookResponse, true);
		assert.equal(response.statusCode, 401);
		assert.equal(result.workflowData, undefined);
	}
});

test('webhook: an event the node does not listen to is acknowledged and ignored', async () => {
	const lead = JSON.stringify({ event: 'lead', amountMinor: null, eventId: 'e2' });
	const { ctx } = webhookContext({
		params: { events: ['sale'] },
		rawBody: lead,
		headers: { 'X-Subtraq-Signature': await sign('whsub_1', lead) },
		staticData: { webhookSecret: 'whsub_1' },
	});
	const result = await new SubtraqTrigger().webhook.call(ctx);
	assert.equal(result.workflowData, undefined);
	assert.deepEqual(result.webhookResponse, { received: true });
});
