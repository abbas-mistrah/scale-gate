'use strict';

const REQUIRED_METRICS = [
  'task_success',
  'groundedness',
  'critical_error_rate',
  'reliability',
  'latency_seconds',
  'cost_per_task'
];

const SEVERITY_WEIGHT = { low: 1, medium: 2, high: 3, critical: 5 };

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

function metricMap(metrics = []) {
  return Object.fromEntries(metrics.map(metric => [metric.key, metric]));
}

function scoreMetric(metric) {
  if (!metric) return 0;
  const value = Number(metric.value) || 0;
  const target = Number(metric.target) || 0;
  if (metric.direction === 'max') {
    if (target === 0) return value === 0 ? 1 : 0;
    return clamp(target / Math.max(value, 0.000001));
  }
  if (target === 0) return value > 0 ? 1 : 0;
  return clamp(value / target);
}

function calculateEconomics(useCase, metrics = []) {
  const byKey = metricMap(metrics);
  const targetUsers = Math.max(0, Number(useCase.target_users) || 0);
  const tasksPerUserMonth = Math.max(0, Number(useCase.tasks_per_user_month) || 0);
  const monthlyTasks = targetUsers * tasksPerUserMonth;
  const minutesSaved = Math.max(0, (Number(useCase.baseline_minutes) || 0) - (Number(useCase.treatment_minutes) || 0));
  const grossHoursReleased = monthlyTasks * minutesSaved / 60 * 12;
  const adoption = clamp(useCase.adoption);
  const attribution = clamp(useCase.attribution);
  const attributableHours = grossHoursReleased * adoption * attribution;
  const capacityValue = attributableHours * Math.max(0, Number(useCase.labor_cost_hour) || 0);
  const revenueUplift = Math.max(0, Number(useCase.revenue_uplift) || 0) * adoption * attribution;
  const riskAvoidance = Math.max(0, Number(useCase.risk_avoidance) || 0) * attribution;
  const annualBenefit = capacityValue + revenueUplift + riskAvoidance;

  const costPerTask = Math.max(0, Number(byKey.cost_per_task?.value) || 0);
  const inferenceCost = monthlyTasks * costPerTask * 12;
  const reviewRate = clamp(useCase.human_review_rate);
  const reviewMinutes = Math.max(0, Number(useCase.review_minutes) || 0);
  const reviewCost = monthlyTasks * reviewRate * reviewMinutes / 60 * Math.max(0, Number(useCase.labor_cost_hour) || 0) * 12;
  const platformCost = Math.max(0, Number(useCase.annual_platform_cost) || 0);
  const setupCost = Math.max(0, Number(useCase.setup_cost) || 0);
  const annualRunCost = platformCost + inferenceCost + reviewCost;
  const firstYearCost = setupCost + annualRunCost;
  const annualNet = annualBenefit - annualRunCost;
  const firstYearNet = annualBenefit - firstYearCost;
  const firstYearRoi = firstYearCost > 0 ? firstYearNet / firstYearCost * 100 : 0;
  const monthlyNetAfterLaunch = annualNet / 12;
  const paybackMonths = monthlyNetAfterLaunch > 0 ? setupCost / monthlyNetAfterLaunch : null;
  const costPerSuccessfulTask = monthlyTasks > 0
    ? annualRunCost / 12 / (monthlyTasks * Math.max(0.01, Number(byKey.task_success?.value) || 0.01))
    : 0;

  return {
    target_users: targetUsers,
    monthly_tasks: round(monthlyTasks),
    minutes_saved_per_task: round(minutesSaved, 1),
    gross_hours_released: round(grossHoursReleased),
    attributable_hours: round(attributableHours),
    capacity_value: round(capacityValue),
    revenue_uplift: round(revenueUplift),
    risk_avoidance: round(riskAvoidance),
    annual_benefit: round(annualBenefit),
    setup_cost: round(setupCost),
    platform_cost: round(platformCost),
    inference_cost: round(inferenceCost),
    review_cost: round(reviewCost),
    annual_run_cost: round(annualRunCost),
    first_year_cost: round(firstYearCost),
    annual_net: round(annualNet),
    first_year_net: round(firstYearNet),
    first_year_roi: round(firstYearRoi, 1),
    payback_months: paybackMonths === null ? null : round(paybackMonths, 1),
    cost_per_successful_task: round(costPerSuccessfulTask, 2)
  };
}

function evidenceConfidence(contract) {
  const metrics = contract.metrics || [];
  const evidence = contract.evidence || [];
  const byKey = metricMap(metrics);
  const coverage = REQUIRED_METRICS.filter(key => byKey[key]).length / REQUIRED_METRICS.length;
  const metricVerification = metrics.length
    ? metrics.reduce((sum, item) => sum + (item.verified ? 1 : 0), 0) / metrics.length
    : 0;
  const evidenceVerification = evidence.length
    ? evidence.reduce((sum, item) => sum + (item.verified ? 1 : 0), 0) / evidence.length
    : 0;
  const sampleMetrics = metrics.filter(item => ['task_success', 'groundedness', 'critical_error_rate', 'reliability'].includes(item.key));
  const sampleStrength = sampleMetrics.length
    ? sampleMetrics.reduce((sum, item) => sum + clamp((Number(item.sample_size) || 0) / 250), 0) / sampleMetrics.length
    : 0;
  const sourceConfidence = evidence.length
    ? evidence.reduce((sum, item) => sum + clamp(item.confidence), 0) / evidence.length
    : 0;
  const verified = (metricVerification * 0.55) + (evidenceVerification * 0.45);
  const confidence = 0.32 * coverage + 0.28 * verified + 0.22 * sampleStrength + 0.18 * sourceConfidence;
  return {
    score: round(clamp(confidence) * 100, 1),
    coverage: round(coverage * 100, 1),
    verification: round(verified * 100, 1),
    sample_strength: round(sampleStrength * 100, 1),
    source_confidence: round(sourceConfidence * 100, 1)
  };
}

function controlAssessment(controls = []) {
  const mandatory = controls.filter(control => Boolean(control.mandatory));
  const denominator = mandatory.reduce((sum, control) => sum + (SEVERITY_WEIGHT[control.severity] || 1), 0) || 1;
  const passed = mandatory.reduce((sum, control) => sum + (control.status === 'pass' ? (SEVERITY_WEIGHT[control.severity] || 1) : 0), 0);
  return {
    score: round(passed / denominator * 100, 1),
    passed: mandatory.filter(control => control.status === 'pass').length,
    total: mandatory.length,
    failed: mandatory.filter(control => control.status === 'fail').length,
    missing: mandatory.filter(control => control.status === 'missing').length
  };
}

function addIssue(list, code, title, detail, domain, severity = 'medium') {
  if (!list.some(item => item.code === code)) list.push({ code, title, detail, domain, severity });
}

function evaluateContract(contract, options = {}) {
  const useCase = contract.use_case || {};
  const metrics = contract.metrics || [];
  const controls = contract.controls || [];
  const byKey = metricMap(metrics);
  const economics = calculateEconomics(useCase, metrics);
  const evidence = evidenceConfidence(contract);
  const control = controlAssessment(controls);
  const blockers = [];
  const warnings = [];

  const taskSuccess = Number(byKey.task_success?.value) || 0;
  const groundedness = Number(byKey.groundedness?.value) || 0;
  const criticalErrors = Number(byKey.critical_error_rate?.value) || 0;
  const reliability = Number(byKey.reliability?.value) || 0;
  const minSample = Math.min(...['task_success', 'groundedness', 'critical_error_rate', 'reliability']
    .map(key => Number(byKey[key]?.sample_size) || 0));

  if (!(Number(useCase.baseline_minutes) > 0) || !(Number(useCase.tasks_per_user_month) > 0)) {
    addIssue(blockers, 'baseline-missing', 'Operational baseline is incomplete', 'Time and volume baselines are required before a scale decision.', 'value', 'high');
  }
  if (!String(useCase.owner || '').trim() || !String(useCase.business_outcome || '').trim()) {
    addIssue(blockers, 'accountability-missing', 'Accountability is not explicit', 'A named owner and a measurable business outcome are mandatory.', 'governance', 'high');
  }

  for (const item of controls) {
    if (item.mandatory && item.severity === 'critical' && item.status !== 'pass') {
      addIssue(blockers, `control-${item.key}`, item.title, item.status === 'fail' ? 'A critical control failed.' : 'Required critical evidence is missing.', item.domain, 'critical');
    }
  }
  if (Number(byKey.pii_incidents?.value) > 0) {
    addIssue(blockers, 'pii-incidents', 'Personal data exposure detected', 'At least one confirmed privacy incident remains unresolved.', 'privacy', 'critical');
  }
  if (criticalErrors > 0.05) {
    addIssue(blockers, 'critical-errors', 'Critical error rate exceeds 5%', 'The current failure severity is incompatible with broader deployment.', 'quality', 'critical');
  }
  if (taskSuccess > 0 && taskSuccess < 0.65) {
    addIssue(blockers, 'task-success-floor', 'Task success is below the minimum floor', 'The system fails too many end-to-end tasks to justify expansion.', 'quality', 'critical');
  }

  if (taskSuccess < 0.85) addIssue(warnings, 'task-success-target', 'Task success below 85%', 'Improve the workflow and rerun the golden task set.', 'quality', 'high');
  if (groundedness < 0.9) addIssue(warnings, 'groundedness-target', 'Groundedness below 90%', 'Strengthen retrieval, citations or constrained generation.', 'quality', 'high');
  if (criticalErrors > 0.02) addIssue(warnings, 'critical-error-target', 'Critical errors exceed 2%', 'Reduce high-impact failure modes before unrestricted scale.', 'quality', 'high');
  if (reliability < 0.98) addIssue(warnings, 'reliability-target', 'Reliability below 98%', 'Stabilize availability, retries and fallback behavior.', 'reliability', 'medium');
  if (minSample < 100) addIssue(warnings, 'sample-small', 'Evaluation sample is too small', 'Reach at least 100 representative tasks across edge cases.', 'evidence', 'medium');
  if (evidence.score < 80) addIssue(warnings, 'confidence-low', 'Evidence confidence below 80%', 'Verify sources, fill metric gaps and expand the evaluation sample.', 'evidence', 'high');
  if (clamp(useCase.adoption) < 0.55) addIssue(warnings, 'adoption-low', 'Adoption below 55%', 'Prove sustained workflow use, not account activation.', 'adoption', 'medium');
  if (clamp(useCase.human_review_rate) > 0.3) addIssue(warnings, 'review-burden', 'Human review burden exceeds 30%', 'The operating model may not remain economical at target scale.', 'operations', 'medium');
  if (economics.first_year_roi < 25) addIssue(warnings, 'roi-threshold', 'First-year ROI below 25%', 'Reduce full cost or strengthen attributable benefit.', 'value', 'medium');

  const qualityMetrics = ['task_success', 'groundedness', 'critical_error_rate', 'reliability'];
  const qualityScore = qualityMetrics.reduce((sum, key) => sum + scoreMetric(byKey[key]), 0) / qualityMetrics.length * 100;
  const valueScore = clamp((economics.first_year_roi + 25) / 175) * 100;
  const adoptionScore = clamp(Number(useCase.adoption) / 0.7) * 100;

  let decision = 'SCALE';
  if (String(useCase.status).toLowerCase() === 'retired') decision = 'RETIRE';
  else if (economics.first_year_net < 0 && taskSuccess < 0.75) decision = 'REJECT';
  else if (blockers.length) decision = 'REPAIR';
  else if (warnings.length) decision = 'CONDITIONAL_SCALE';

  const conditionMap = {
    'task-success-target': 'Reach ≥85% end-to-end task success on the representative test set.',
    'groundedness-target': 'Reach ≥90% grounded outputs with source traceability.',
    'critical-error-target': 'Reduce critical errors to ≤2%.',
    'reliability-target': 'Demonstrate ≥98% service reliability and tested fallback behavior.',
    'sample-small': 'Expand the evaluation to at least 100 representative tasks.',
    'confidence-low': 'Raise evidence confidence to ≥80% through verified, current sources.',
    'adoption-low': 'Demonstrate ≥55% sustained active adoption in the target workflow.',
    'review-burden': 'Reduce or fund the human-review operating burden.',
    'roi-threshold': 'Demonstrate ≥25% first-year ROI using fully loaded costs.'
  };
  const conditions = warnings.map(item => conditionMap[item.code]).filter(Boolean);
  const validityDays = decision === 'SCALE' ? 180 : decision === 'CONDITIONAL_SCALE' ? 90 : 30;
  const reviewDate = new Date(options.now || Date.now());
  reviewDate.setUTCDate(reviewDate.getUTCDate() + validityDays);

  const decisionCopy = {
    SCALE: 'Evidence supports controlled enterprise scale.',
    CONDITIONAL_SCALE: 'Scale is justified only within explicit limits.',
    REPAIR: 'Do not expand. Resolve the hard blockers and rerun the gate.',
    REJECT: 'The current use case does not justify further investment.',
    RETIRE: 'Withdraw the system and preserve the decision record.'
  };

  return {
    protocol: contract.scale1_version || '1.0',
    evaluated_at: new Date(options.now || Date.now()).toISOString(),
    use_case: useCase,
    decision,
    decision_copy: decisionCopy[decision],
    confidence: evidence.score,
    valid_until: reviewDate.toISOString().slice(0, 10),
    pillars: {
      quality: round(qualityScore, 1),
      value: round(valueScore, 1),
      controls: control.score,
      adoption: round(adoptionScore, 1),
      evidence: evidence.score
    },
    evidence_assessment: evidence,
    control_assessment: control,
    economics,
    blockers,
    warnings,
    conditions: [...new Set(conditions)],
    thresholds: {
      task_success: 0.85,
      groundedness: 0.9,
      critical_error_rate: 0.02,
      reliability: 0.98,
      evidence_confidence: 0.8,
      sustained_adoption: 0.55,
      first_year_roi: 25
    },
    policy: 'Hard blockers always override aggregate scores and projected ROI.'
  };
}

function validateContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== 'object') return { valid: false, errors: ['Contract must be a JSON object.'] };
  if (!String(contract.scale1_version || '').trim()) errors.push('scale1_version is required.');
  if (!contract.use_case || typeof contract.use_case !== 'object') errors.push('use_case is required.');
  const requiredUseCase = ['slug', 'name', 'owner', 'department', 'business_outcome'];
  for (const field of requiredUseCase) {
    if (!String(contract.use_case?.[field] || '').trim()) errors.push(`use_case.${field} is required.`);
  }
  if (!Array.isArray(contract.metrics)) errors.push('metrics must be an array.');
  if (!Array.isArray(contract.controls)) errors.push('controls must be an array.');
  if (!Array.isArray(contract.evidence)) errors.push('evidence must be an array.');
  const keys = new Set();
  for (const metric of contract.metrics || []) {
    if (!metric.key) errors.push('Every metric requires a key.');
    if (keys.has(metric.key)) errors.push(`Duplicate metric key: ${metric.key}.`);
    keys.add(metric.key);
    if (!Number.isFinite(Number(metric.value))) errors.push(`Metric ${metric.key || '?'} requires a numeric value.`);
    if (!['min', 'max'].includes(metric.direction)) errors.push(`Metric ${metric.key || '?'} direction must be min or max.`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  REQUIRED_METRICS,
  calculateEconomics,
  evidenceConfidence,
  controlAssessment,
  evaluateContract,
  validateContract
};
