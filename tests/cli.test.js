'use strict';

// The CLI exit code is the contract CI pipelines rely on:
// 0 = valid and SCALE / CONDITIONAL_SCALE, 1 = anything else.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'cli.js');

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function tempFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-gate-cli-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

const cases = [
  ['contracts/examples/demand-forecast.scale.json', 'SCALE', 0],
  ['contracts/examples/contract-review-agent.scale.json', 'CONDITIONAL_SCALE', 0],
  ['contracts/examples/support-copilot.scale.json', 'REPAIR', 1],
  ['contracts/templates/starter.scale.json', 'REJECT', 1]
];

for (const [file, decision, code] of cases) {
  test(`check ${path.basename(file)} -> ${decision}, exit ${code}`, () => {
    const result = run('check', file);
    assert.equal(result.code, code);
    assert.match(result.stdout, new RegExp(`^Decision: ${decision}$`, 'm'));
  });
}

test('--json prints a machine-readable result', () => {
  const result = run('check', 'contracts/examples/demand-forecast.scale.json', '--json');
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'SCALE');
  assert.equal(parsed.blockers.length, 0);
});

test('blockers are listed in the human summary', () => {
  const result = run('check', 'contracts/examples/support-copilot.scale.json');
  assert.match(result.stdout, /^Blockers:$/m);
});

test('a missing file fails with exit 1', () => {
  const result = run('check', 'contracts/does-not-exist.scale.json');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /File not found/);
});

test('malformed JSON fails with exit 1 and names the file', () => {
  const file = tempFile('broken.scale.json', '{ "scale1_version": ');
  const result = run('check', file);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Not valid JSON/);
  assert.ok(result.stderr.includes('broken.scale.json'));
});

test('a structurally invalid contract fails with exit 1', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/examples/demand-forecast.scale.json'), 'utf8'));
  contract.metrics.push({ ...contract.metrics[0] });
  const result = run('check', tempFile('duplicate.scale.json', JSON.stringify(contract)));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid SCALE-1 contract/);
});

test('a null metric entry fails with exit 1 and a readable error, not a stack trace', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/examples/demand-forecast.scale.json'), 'utf8'));
  contract.metrics.push(null);
  const result = run('check', tempFile('null-metric.scale.json', JSON.stringify(contract)));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid SCALE-1 contract/);
  assert.match(result.stderr, /must be an object/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test('help exits 0, unknown command exits 1', () => {
  assert.equal(run('--help').code, 0);
  const unknown = run('deploy', 'contracts/examples/demand-forecast.scale.json');
  assert.equal(unknown.code, 1);
  assert.match(unknown.stdout, /Usage:/);
});
