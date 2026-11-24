'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluateContract, validateContract, calculateEconomics, evaluateRegate, formatModelId } = require('../src/engine');

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

function regateFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'examples', 'regate', name), 'utf8'));
}

test('all shipped regate examples pass SCALE-1 validation', () => {
  for (const name of ['baseline-model-v1.scale.json', 'candidate-model-v2-stale.scale.json', 'candidate-model-v2-revalidated.scale.json']) {
    assert.deepEqual(validateContract(regateFixture(name)), { valid: true, errors: [] }, name);
  }
});

test('validateContract accepts string and structured use_case.model and rejects empty ones', () => {
  const contract = fixture('demand-forecast.scale.json');
  contract.use_case.model = { provider: 'northstar', name: 'plan', version: '2.1' };
  assert.equal(validateContract(contract).valid, true);
  assert.equal(formatModelId(contract), 'northstar/plan@2.1');

  contract.use_case.model = '   ';
  assert.equal(validateContract(contract).valid, false);
  assert.ok(validateContract(contract).errors.some(error => error.includes('use_case.model')));
});

test('regate blocks a model upgrade when evaluation evidence was not refreshed', () => {
  const baseline = regateFixture('baseline-model-v1.scale.json');
  const stale = regateFixture('candidate-model-v2-stale.scale.json');
  const result = evaluateRegate(baseline, { candidate: stale, asOf: '2026-11-24' });
  assert.equal(result.regate_status, 'REGATE_REQUIRED');
  assert.ok(result.changes.some(item => item.code === 'model-changed'));
  assert.ok(result.regate_blockers.some(item => item.code === 'stale-evaluation-evidence'));
  assert.ok(result.required_actions.some(item => item.includes('northstar-plan-v2')));
});

test('regate blocks an unverified evaluation entry after a model change', () => {
  const baseline = regateFixture('baseline-model-v1.scale.json');
  const candidate = regateFixture('candidate-model-v2-revalidated.scale.json');
  candidate.evidence = candidate.evidence.map(item => (
    item.evidence_type === 'evaluation' ? { ...item, verified: false } : item
  ));
  const result = evaluateRegate(baseline, { candidate, asOf: '2026-11-24' });
  assert.equal(result.regate_status, 'REGATE_REQUIRED');
  assert.ok(result.regate_blockers.some(item => item.code === 'stale-evaluation-evidence'));
});

test('regate passes a model upgrade backed by fresh verified evaluation evidence', () => {
  const baseline = regateFixture('baseline-model-v1.scale.json');
  const revalidated = regateFixture('candidate-model-v2-revalidated.scale.json');
  const result = evaluateRegate(baseline, { candidate: revalidated, asOf: '2026-11-24' });
  assert.equal(result.regate_status, 'PASS');
  assert.equal(result.regate_blockers.length, 0);
  assert.equal(result.baseline_decision, 'SCALE');
  assert.equal(result.candidate_decision, 'SCALE');
  assert.ok(result.changes.some(item => item.code === 'model-changed'));
  assert.ok(result.delta.first_year_roi > 0);
  assert.ok(result.delta.cost_per_task < 0);
});

test('regate blocks safety or mandatory-control regressions even with fresh evaluation dates', () => {
  const baseline = regateFixture('baseline-model-v1.scale.json');
  const regressed = regateFixture('candidate-model-v2-revalidated.scale.json');
  regressed.controls.find(item => item.key === 'fallback').status = 'fail';
  regressed.metrics.find(item => item.key === 'critical_error_rate').value = 0.019;
  const result = evaluateRegate(baseline, { candidate: regressed, asOf: '2026-11-24' });
  assert.equal(result.regate_status, 'REGATE_REQUIRED');
  assert.ok(result.regate_blockers.some(item => item.code === 'control-regression'));
  assert.ok(result.regate_blockers.some(item => item.code === 'safety-regression'));
});

test('regate blocks mismatched slugs, expired evidence, and single-contract model drift', () => {
  const baseline = regateFixture('baseline-model-v1.scale.json');
  const other = fixture('contract-review-agent.scale.json');
  const mismatch = evaluateRegate(baseline, { candidate: other, asOf: '2026-11-24' });
  assert.equal(mismatch.regate_status, 'REGATE_REQUIRED');
  assert.ok(mismatch.regate_blockers.some(item => item.code === 'slug-mismatch'));

  const expired = evaluateRegate(baseline, { asOf: '2027-01-10' });
  assert.equal(expired.regate_status, 'REGATE_REQUIRED');
  assert.equal(expired.expired_evidence.length, 2);
  assert.ok(expired.regate_blockers.some(item => item.code === 'evidence-expired'));

  const sameModel = evaluateRegate(baseline, { model: 'northstar-plan-v1', asOf: '2026-11-24' });
  assert.equal(sameModel.regate_status, 'PASS');

  const driftedModel = evaluateRegate(baseline, { model: 'northstar-plan-v2', asOf: '2026-11-24' });
  assert.equal(driftedModel.regate_status, 'REGATE_REQUIRED');
  assert.ok(driftedModel.regate_blockers.some(item => item.code === 'model-change-unrevalidated'));
});

test('regate detects scope, autonomy, risk, population, cost and explicit trigger changes', () => {
  const baseline = regateFixture('baseline-model-v1.scale.json');
  const expanded = regateFixture('baseline-model-v1.scale.json');
  expanded.use_case.autonomy_level = 3;
  expanded.use_case.risk_tier = 'high';
  expanded.use_case.target_users = 300;
  expanded.use_case.annual_platform_cost = 210000;
  expanded.use_case.department = 'Global Supply Chain';

  const blocked = evaluateRegate(baseline, { candidate: expanded, triggers: ['data'], asOf: '2026-11-24' });
  assert.equal(blocked.regate_status, 'REGATE_REQUIRED');
  const codes = new Set(blocked.changes.map(item => item.code));
  assert.ok(codes.has('autonomy-increased'));
  assert.ok(codes.has('risk-tier-increased'));
  assert.ok(codes.has('population-expanded'));
  assert.ok(codes.has('cost-increased'));
  assert.ok(codes.has('workflow-changed'));
  assert.ok(codes.has('trigger-data'));
  assert.ok(blocked.regate_blockers.some(item => item.code === 'stale-evaluation-evidence'));

  const singleTrigger = evaluateRegate(baseline, { triggers: ['integration'], asOf: '2026-11-24' });
  assert.equal(singleTrigger.regate_status, 'REGATE_REQUIRED');
  assert.ok(singleTrigger.regate_blockers.some(item => item.code === 'trigger-unrevalidated-integration'));
});
