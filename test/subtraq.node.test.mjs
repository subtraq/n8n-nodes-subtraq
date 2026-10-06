import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeContext, NodeApiError, NodeOperationError, ok, refusal, Subtraq } from './helpers.mjs';

const node = new Subtraq();
const SPACE = { mode: 'list', value: 'maison-lartigue' };

/* ----------------------------------- links ---------------------------------- */

test('link › create: a link to a page sends the destination and drops empty fields', async () => {
	const { ctx, calls } = executeContext({
		params: {
			resource: 'link',
			operation: 'create',
			space: SPACE,
			linkType: 'parent',
			destination: 'https://example.com/landing',
			additionalFields: { label: 'Site', slug: '', utmSource: 'newsletter' },
		},
		responses: [ok({ id: 'l1', shortUrl: 'https://sbtq.link/abc' }, 201)],
	});
	const [[item]] = await node.execute.call(ctx);
	assert.equal(item.json.shortUrl, 'https://sbtq.link/abc');
	assert.equal(calls[0].method, 'POST');
	assert.equal(calls[0].baseURL, 'https://subtraq.test/api/v1');
	assert.equal(calls[0].url, '/links');
	assert.deepEqual(calls[0].body, {
		space: 'maison-lartigue',
		label: 'Site',
		utmSource: 'newsletter',
		destination: 'https://example.com/landing',
	});
});

test('link › create: a placement sends its parent, never a destination, and the idempotency key as a header', async () => {
	const { ctx, calls } = executeContext({
		params: {
			resource: 'link',
			operation: 'create',
			space: SPACE,
			linkType: 'placement',
			parentId: { mode: 'id', value: ' p1 ' },
			additionalFields: { label: 'Meta ad', idempotencyKey: 'post-42' },
		},
		responses: [ok({ id: 'l2' }, 201)],
	});
	await node.execute.call(ctx);
	assert.deepEqual(calls[0].body, { space: 'maison-lartigue', label: 'Meta ad', parentId: 'p1' });
	assert.equal(calls[0].headers['Idempotency-Key'], 'post-42');
});

test('link › update: nothing to update is refused before any call', async () => {
	const { ctx, calls } = executeContext({
		params: { resource: 'link', operation: 'update', linkId: { mode: 'id', value: 'l1' }, updateFields: { label: '' } },
	});
	await assert.rejects(node.execute.call(ctx), NodeOperationError);
	assert.equal(calls.length, 0);
});

test('link › get many: follows nextCursor and stops at the limit', async () => {
	const { ctx, calls } = executeContext({
		params: { resource: 'link', operation: 'getAll', returnAll: false, limit: 3, filters: { status: 'all', space: '' } },
		responses: [
			ok({ data: [{ id: 'a' }, { id: 'b' }], nextCursor: 'c1' }),
			ok({ data: [{ id: 'c' }, { id: 'd' }], nextCursor: 'c2' }),
		],
	});
	const [items] = await node.execute.call(ctx);
	assert.deepEqual(items.map((i) => i.json.id), ['a', 'b', 'c']);
	assert.deepEqual(calls[0].qs, { status: 'all', limit: 3 });
	assert.deepEqual(calls[1].qs, { status: 'all', limit: 1, cursor: 'c1' });
});

/* ----------------------------------- errors --------------------------------- */

test('errors: a Subtraq refusal keeps its code and says what to do', async () => {
	const { ctx } = executeContext({
		params: {
			resource: 'link',
			operation: 'create',
			space: SPACE,
			linkType: 'parent',
			destination: 'https://example.com',
			additionalFields: { slug: 'spring' },
		},
		responses: [refusal(409, 'slug_taken', 'This slug is already taken.', { suggestion: 'spring-2' })],
	});
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.match(error.message, /already taken \(slug_taken\)/);
		assert.match(error.description, /Choose another slug/);
		assert.match(error.description, /spring-2/);
		assert.equal(error.httpCode, '409');
		return true;
	});
});

test('errors: with Continue On Fail, the item carries the error and the run goes on', async () => {
	const { ctx } = executeContext({
		continueOnFail: true,
		params: { resource: 'space', operation: 'getAll', returnAll: true },
		responses: [refusal(403, 'missing_scope', 'This key lacks links:read.')],
	});
	const [[item]] = await node.execute.call(ctx);
	assert.match(item.json.error, /permission/);
});

/* ----------------------------------- sales ---------------------------------- */

test('sale › record: cents, upper-case currency, metadata parsed, nothing empty sent', async () => {
	const { ctx, calls } = executeContext({
		params: {
			resource: 'sale',
			operation: 'record',
			space: SPACE,
			amount: 4300,
			currency: 'eur',
			invoiceId: 'INV-1',
			email: 'buyer@example.com',
			additionalFields: { metadata: '{"plan":"annual"}', externalId: '' },
		},
		responses: [ok({ ok: true, attributed: true, duplicate: false }, 201)],
	});
	const [[item]] = await node.execute.call(ctx);
	assert.equal(item.json.attributed, true);
	assert.deepEqual(calls[0].body, {
		space: 'maison-lartigue',
		amount: 4300,
		currency: 'EUR',
		invoiceId: 'INV-1',
		email: 'buyer@example.com',
		metadata: { plan: 'annual' },
	});
});

test('sale › record: refused before any call without a buyer, with a decimal amount, or with bad metadata', async () => {
	const base = { resource: 'sale', operation: 'record', space: SPACE, currency: 'EUR', invoiceId: 'INV-1' };
	for (const params of [
		{ ...base, amount: 4300, email: '', additionalFields: {} },
		{ ...base, amount: 43.5, email: 'a@example.com', additionalFields: {} },
		{ ...base, amount: 4300, email: 'a@example.com', additionalFields: { metadata: '[1,2]' } },
		{ ...base, amount: 4300, email: 'a@example.com', additionalFields: { metadata: '{nope' } },
	]) {
		const { ctx, calls } = executeContext({ params });
		await assert.rejects(node.execute.call(ctx), NodeOperationError, JSON.stringify(params));
		assert.equal(calls.length, 0);
	}
});

/* --------------------------------- analytics -------------------------------- */

const REPORT = {
	space: { slug: 'maison-lartigue', name: 'Maison Lartigue' },
	period: '30d',
	model: 'linear',
	multiTouchPeople: 2,
	totals: {
		clicks: 120,
		leads: 9,
		sales: 3,
		revenueAttributedMinor: 9000,
		revenueUnattributedMinor: 1000,
		currency: 'EUR',
		mixedCurrencies: false,
		byCurrency: [],
	},
	placements: [
		{ linkId: 'l1', slug: 'a', label: 'Newsletter', clicks: 80, leads: 6, sales: 2, revenueMinor: 6000 },
		{ linkId: 'l2', slug: 'b', label: null, clicks: 40, leads: 3, sales: 1, revenueMinor: 3000 },
	],
	unattributed: { leads: 0, sales: 1, revenueMinor: 1000 },
	currency: 'EUR',
};

test('analytics › get summary: one flat item, the model and the period said', async () => {
	const { ctx, calls } = executeContext({
		params: { resource: 'analytics', operation: 'getSummary', space: SPACE, period: '30d', model: 'linear' },
		responses: [ok(REPORT)],
	});
	const [[item]] = await node.execute.call(ctx);
	assert.deepEqual(calls[0].qs, { space: 'maison-lartigue', period: '30d', model: 'linear' });
	assert.equal(item.json.revenueAttributedMinor, 9000);
	assert.equal(item.json.revenueUnattributedMinor, 1000);
	assert.equal(item.json.model, 'linear');
	assert.equal(item.json.clicks, 120);
});

test('analytics › get per placement: one item per placement, each with its context', async () => {
	const { ctx } = executeContext({
		params: { resource: 'analytics', operation: 'getPlacements', space: SPACE, period: '30d', model: 'linear' },
		responses: [ok(REPORT)],
	});
	const [items] = await node.execute.call(ctx);
	assert.equal(items.length, 2);
	assert.deepEqual(items[1].json, {
		space: 'maison-lartigue',
		period: '30d',
		model: 'linear',
		currency: 'EUR',
		linkId: 'l2',
		slug: 'b',
		label: null,
		clicks: 40,
		leads: 3,
		sales: 1,
		revenueMinor: 3000,
	});
	assert.deepEqual(items.map((i) => i.pairedItem), [{ item: 0 }, { item: 0 }]);
});
