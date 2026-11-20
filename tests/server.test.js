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
