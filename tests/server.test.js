'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');

test('local API exposes health, state and a SCALE-1 contract', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/api/health`).then(response => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.protocol, 'SCALE-1');

  const state = await fetch(`${base}/api/state`).then(response => response.json());
  assert.equal(state.database.engine, 'SQLite');
  assert.ok(state.use_cases.length >= 3);

  const contract = await fetch(`${base}/api/use-cases/${state.use_cases[0].id}/contract`).then(response => response.json());
  assert.equal(contract.scale1_version, '1.0');
  assert.ok(contract.metrics.length >= 6);
  assert.ok(contract.controls.length >= 5);

  const roundTrip = await fetch(`${base}/api/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contract)
  });
  assert.equal(roundTrip.status, 200);
  assert.equal((await roundTrip.json()).valid, true);

  const broken = await fetch(`${base}/api/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...contract, metrics: [null] })
  });
  assert.equal(broken.status, 422);
  const body = await broken.json();
  assert.equal(body.valid, false);
  assert.ok(body.errors.includes('metrics[0] must be an object.'));
});

function rawRequest(port, { method = 'GET', path: requestPath = '/', headers = {}, body } = {}) {
  const http = require('node:http');
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: requestPath, headers }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

test('client mistakes get 4xx answers and never stop the server', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();

  // A malformed Host header used to throw outside the handler and stop the process.
  const badHost = await rawRequest(port, { path: '/api/health', headers: { Host: 'a b' } });
  assert.equal(badHost.status, 200);
  assert.equal(badHost.body.ok, true);

  const badPath = await rawRequest(port, { path: '/%E0%A4%A' });
  assert.equal(badPath.status, 400);
  assert.equal(badPath.body.error, 'Malformed URL.');

  for (const [method, route] of [
    ['POST', '/api/use-cases'],
    ['PATCH', '/api/use-cases/1'],
    ['POST', '/api/use-cases/1/metrics'],
    ['PATCH', '/api/controls/1']
  ]) {
    for (const body of ['null', '[]', '5', '"text"']) {
      const response = await rawRequest(port, { method, path: route, body, headers: { 'Content-Type': 'application/json' } });
      assert.equal(response.status, 400, `${method} ${route} with ${body}`);
      assert.equal(response.body.error, 'Request body must be a JSON object.');
    }
  }

  const missingName = await rawRequest(port, { method: 'POST', path: '/api/use-cases', body: '{}' });
  assert.equal(missingName.status, 400);
  assert.equal(missingName.body.error, 'Use-case name is required.');

  const missingKey = await rawRequest(port, { method: 'POST', path: '/api/use-cases/1/metrics', body: '{"value": 1}' });
  assert.equal(missingKey.status, 400);
  assert.equal(missingKey.body.error, 'Metric key is required.');

  // POST /api/validate keeps its SCALE-1 answer for a non-object contract.
  const arrayContract = await rawRequest(port, { method: 'POST', path: '/api/validate', body: '[]' });
  assert.equal(arrayContract.status, 422);

  const health = await rawRequest(port, { path: '/api/health' });
  assert.equal(health.status, 200);
});
