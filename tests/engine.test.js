'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluateContract, validateContract, calculateEconomics } = require('../src/engine');

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'examples', name), 'utf8'));
}

test('a critical privacy failure overrides strong ROI and quality', () => {
  const result = evaluateContract(fixture('support-copilot.scale.json'), { now: '2026-09-23T00:00:00.000Z' });
  assert.equal(result.decision, 'REPAIR');
  assert.ok(result.economics.first_year_roi > 25);
  assert.ok(result.pillars.quality > 90);
  assert.ok(result.blockers.some(item => item.code === 'control-privacy-redaction'));
  assert.ok(result.blockers.some(item => item.code === 'pii-incidents'));
});

test('an evidence-limited legal workflow receives conditional scale', () => {
  const result = evaluateContract(fixture('contract-review-agent.scale.json'), { now: '2026-09-23T00:00:00.000Z' });
  assert.equal(result.decision, 'CONDITIONAL_SCALE');
  assert.equal(result.blockers.length, 0);
  assert.ok(result.warnings.some(item => item.code === 'sample-small'));
  assert.ok(result.conditions.length >= 1);
});

test('a complete evidence package can pass the scale gate', () => {
  const result = evaluateContract(fixture('demand-forecast.scale.json'), { now: '2026-09-23T00:00:00.000Z' });
  assert.equal(result.decision, 'SCALE');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.confidence >= 90);
  assert.equal(result.valid_until, '2027-03-22');
});

test('fully loaded economics include setup, inference and human review', () => {
  const contract = fixture('support-copilot.scale.json');
  const value = calculateEconomics(contract.use_case, contract.metrics);
  assert.ok(value.first_year_cost > contract.use_case.setup_cost + contract.use_case.annual_platform_cost);
  assert.ok(value.review_cost > 0);
  assert.ok(value.inference_cost > 0);
  assert.equal(value.first_year_net, value.annual_benefit - value.first_year_cost);
});

test('contract validation rejects duplicate metric keys', () => {
  const contract = fixture('demand-forecast.scale.json');
  contract.metrics.push({ ...contract.metrics[0] });
  const validation = validateContract(contract);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.includes('Duplicate metric key')));
});
