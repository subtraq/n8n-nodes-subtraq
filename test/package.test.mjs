// What n8n reads before running anything: the package manifest, the files it
// points to, the credential test and the node descriptions.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Subtraq, SubtraqApi, SubtraqTrigger } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('package: community node conventions', () => {
	assert.equal(pkg.name, 'n8n-nodes-subtraq');
	assert.ok(pkg.keywords.includes('n8n-community-node-package'));
	assert.equal(pkg.license, 'MIT');
	assert.equal(pkg.dependencies, undefined, 'no runtime dependency');
	assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
	assert.equal(pkg.repository.url, 'git+https://github.com/subtraq/n8n-nodes-subtraq.git');
	for (const file of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
		assert.ok(existsSync(join(root, file)), `${file} is built`);
	}
	for (const icon of ['subtraq.svg', 'subtraq.dark.svg']) {
		assert.ok(existsSync(join(root, 'dist/icons', icon)), `dist/icons/${icon} is copied`);
	}
});

test('credential: the key is a password field, sent as a Bearer token, tested on /spaces', () => {
	const credential = new SubtraqApi();
	const key = credential.properties.find((p) => p.name === 'apiKey');
	assert.equal(key.typeOptions.password, true);
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}',
	);
	assert.equal(credential.test.request.url, '/api/v1/spaces');
	assert.equal(credential.properties.find((p) => p.name === 'baseUrl').default, 'https://subtraq.co');
});

test('action node: every operation has an action label, and the expected operations exist', () => {
	const { properties } = new Subtraq().description;
	const actions = new Set();
	for (const op of properties.filter((p) => p.name === 'operation')) {
		const resource = op.displayOptions.show.resource[0];
		for (const option of op.options) {
			assert.ok(option.action, `${resource}.${option.value} has an action`);
			actions.add(`${resource}.${option.value}`);
		}
	}
	assert.deepEqual([...actions].sort(), [
		'analytics.getPlacements',
		'analytics.getSummary',
		'link.create',
		'link.get',
		'link.getAll',
		'link.update',
		'sale.record',
		'space.create',
		'space.getAll',
	]);
});

test('trigger node: the two Subtraq events, and no input', () => {
	const { description } = new SubtraqTrigger();
	assert.deepEqual(description.inputs, []);
	const events = description.properties.find((p) => p.name === 'events').options.map((o) => o.value);
	assert.deepEqual(events.sort(), ['lead', 'sale']);
});

test('published texts: English only', () => {
	const files = [];
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			if (['node_modules', 'dist', '.git'].includes(name) || name === 'package-lock.json') continue;
			const path = join(dir, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (/\.(ts|json|md|mjs|yml|svg)$/.test(name)) files.push(path);
		}
	};
	walk(root);
	for (const file of files) {
		// Accented letters, written as escapes so that this file passes its own check.
		const text = readFileSync(file, 'utf8');
		assert.ok(!/[\u00e0\u00e2\u00e7\u00e8-\u00eb\u00ee\u00ef\u00f4\u00f9\u00fb\u00fc\u00ff\u0153]/i.test(text), `${file} has non-English text`);
	}
});
