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

test('contract validation reports non-object entries instead of throwing', () => {
  const contract = fixture('demand-forecast.scale.json');
  contract.metrics.push(null);
  contract.controls.push('privacy');
  contract.evidence.push(42);
  const validation = validateContract(contract);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes(`metrics[${contract.metrics.length - 1}] must be an object.`));
  assert.ok(validation.errors.includes(`controls[${contract.controls.length - 1}] must be an object.`));
  assert.ok(validation.errors.includes(`evidence[${contract.evidence.length - 1}] must be an object.`));
});

test('contract validation rejects values that would be silently coerced', () => {
  const contract = fixture('demand-forecast.scale.json');
  contract.metrics[0].value = null;
  contract.metrics[1].value = '';
  contract.use_case.adoption = 1.4;
  contract.use_case.setup_cost = -1000;
  contract.evidence[0].confidence = 2;
  const errors = validateContract(contract).errors;
  assert.ok(errors.includes(`Metric ${contract.metrics[0].key} requires a numeric value.`));
  assert.ok(errors.includes(`Metric ${contract.metrics[1].key} requires a numeric value.`));
  assert.ok(errors.includes('use_case.adoption must be a number between 0 and 1.'));
  assert.ok(errors.includes('use_case.setup_cost must be a non-negative number.'));
  assert.ok(errors.includes('evidence[0] confidence must be a number between 0 and 1.'));
});

test('a mistyped control severity cannot bypass the critical-control blocker', () => {
  const contract = fixture('support-copilot.scale.json');
  const failing = contract.controls.find(item => item.key === 'privacy-redaction');
  failing.severity = 'Critical';
  const validation = validateContract(contract);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.startsWith('Control privacy-redaction severity must be one of')));
  failing.severity = 'critical';
  failing.status = 'passed';
  assert.ok(validateContract(contract).errors.some(error => error.startsWith('Control privacy-redaction status must be one of')));
});

test('every shipped contract passes the stricter validation', () => {
  for (const name of ['demand-forecast.scale.json', 'contract-review-agent.scale.json', 'support-copilot.scale.json']) {
    assert.deepEqual(validateContract(fixture(name)), { valid: true, errors: [] }, name);
  }
  const starter = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'templates', 'starter.scale.json'), 'utf8'));
  assert.deepEqual(validateContract(starter), { valid: true, errors: [] });
});
