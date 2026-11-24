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

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);

// Fields the engine reads as numbers. A wrong type or range would otherwise be
// silently coerced (null -> 0, 1.4 -> 1, -5 -> 0) and change the decision.
const USE_CASE_FRACTIONS = ['adoption', 'attribution', 'human_review_rate'];
const USE_CASE_NON_NEGATIVE = [
  'target_users', 'tasks_per_user_month', 'baseline_minutes', 'treatment_minutes',
  'labor_cost_hour', 'setup_cost', 'annual_platform_cost', 'review_minutes',
  'revenue_uplift', 'risk_avoidance'
];
const CONTROL_SEVERITIES = Object.keys(SEVERITY_WEIGHT);
const CONTROL_STATUSES = ['pass', 'fail', 'missing'];

function validateContract(contract) {
  const errors = [];
  if (!isObject(contract)) return { valid: false, errors: ['Contract must be a JSON object.'] };
  if (!String(contract.scale1_version || '').trim()) errors.push('scale1_version is required.');
  if (!isObject(contract.use_case)) errors.push('use_case is required.');
  const useCase = isObject(contract.use_case) ? contract.use_case : {};
  const requiredUseCase = ['slug', 'name', 'owner', 'department', 'business_outcome'];
  for (const field of requiredUseCase) {
    if (!String(useCase[field] || '').trim()) errors.push(`use_case.${field} is required.`);
  }
  for (const field of USE_CASE_FRACTIONS) {
    if (field in useCase && !(isNumber(useCase[field]) && useCase[field] >= 0 && useCase[field] <= 1)) {
      errors.push(`use_case.${field} must be a number between 0 and 1.`);
    }
  }
  for (const field of USE_CASE_NON_NEGATIVE) {
    if (field in useCase && !(isNumber(useCase[field]) && useCase[field] >= 0)) {
      errors.push(`use_case.${field} must be a non-negative number.`);
    }
  }
  if ('model' in useCase && useCase.model !== undefined && !formatModelId({ use_case: useCase })) {
    errors.push('use_case.model must be a non-empty string or an object with a name or id.');
  }

  if (!Array.isArray(contract.metrics)) errors.push('metrics must be an array.');
  if (!Array.isArray(contract.controls)) errors.push('controls must be an array.');
  if (!Array.isArray(contract.evidence)) errors.push('evidence must be an array.');

  const keys = new Set();
  (Array.isArray(contract.metrics) ? contract.metrics : []).forEach((metric, index) => {
    if (!isObject(metric)) {
      errors.push(`metrics[${index}] must be an object.`);
      return;
    }
    if (!metric.key) errors.push('Every metric requires a key.');
    if (keys.has(metric.key)) errors.push(`Duplicate metric key: ${metric.key}.`);
    keys.add(metric.key);
    if (!isNumber(metric.value)) errors.push(`Metric ${metric.key || '?'} requires a numeric value.`);
    if ('target' in metric && !isNumber(metric.target)) errors.push(`Metric ${metric.key || '?'} target must be a number.`);
    if (!['min', 'max'].includes(metric.direction)) errors.push(`Metric ${metric.key || '?'} direction must be min or max.`);
    if ('sample_size' in metric && !(Number.isInteger(metric.sample_size) && metric.sample_size >= 0)) {
      errors.push(`Metric ${metric.key || '?'} sample_size must be a non-negative integer.`);
    }
  });

  (Array.isArray(contract.controls) ? contract.controls : []).forEach((control, index) => {
    if (!isObject(control)) {
      errors.push(`controls[${index}] must be an object.`);
      return;
    }
    const label = control.key || `#${index}`;
    if (!CONTROL_SEVERITIES.includes(control.severity)) {
      errors.push(`Control ${label} severity must be one of ${CONTROL_SEVERITIES.join(', ')}.`);
    }
    if (!CONTROL_STATUSES.includes(control.status)) {
      errors.push(`Control ${label} status must be one of ${CONTROL_STATUSES.join(', ')}.`);
    }
    if ('mandatory' in control && typeof control.mandatory !== 'boolean') {
      errors.push(`Control ${label} mandatory must be true or false.`);
    }
  });

  (Array.isArray(contract.evidence) ? contract.evidence : []).forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`evidence[${index}] must be an object.`);
      return;
    }
    if ('confidence' in item && !(isNumber(item.confidence) && item.confidence >= 0 && item.confidence <= 1)) {
      errors.push(`evidence[${index}] confidence must be a number between 0 and 1.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

const REGATE_TRIGGERS = [
  'model',
  'data',
  'workflow',
  'population',
  'integration',
  'cost',
  'risk',
  'autonomy'
];

const RISK_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

const TRIGGER_EVAL_REQUIRED = new Set(['model', 'data', 'workflow', 'population', 'integration', 'risk', 'autonomy']);

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

function formatModelId(contract) {
  const raw = contract?.use_case?.model ?? contract?.model;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed || null;
  }
  if (isObject(raw)) {
    const name = String(raw.name || raw.id || '').trim();
    if (!name) return null;
    const provider = String(raw.provider || '').trim();
    const version = String(raw.version || '').trim();
    const prefix = provider ? `${provider}/${name}` : name;
    return version ? `${prefix}@${version}` : prefix;
  }
  return null;
}

function findExpiredEvidence(contract, asOfDate) {
  const expired = [];
  for (const item of contract.evidence || []) {
    const expiresAt = parseIsoDate(item?.expires_at);
    if (expiresAt && expiresAt < asOfDate) {
      expired.push({
        title: item.title || 'Unnamed evidence',
        evidence_type: item.evidence_type || 'unknown',
        domain: item.domain || 'General',
        expires_at: expiresAt
      });
    }
  }
  return expired;
}

function latestObservedAt(evidence = [], { types = null, verifiedOnly = false } = {}) {
  const allowedTypes = Array.isArray(types) ? new Set(types.map(item => String(item).toLowerCase())) : null;
  let latest = null;
  for (const item of evidence) {
    if (!isObject(item)) continue;
    if (verifiedOnly && !item.verified) continue;
    if (allowedTypes && !allowedTypes.has(String(item.evidence_type || '').toLowerCase())) continue;
    const observed = parseIsoDate(item.observed_at);
    if (observed && (!latest || observed > latest)) latest = observed;
  }
  return latest;
}

function detectMaterialChanges(baseline, candidate) {
  const changes = [];
  const baseUse = baseline.use_case || {};
  const candUse = candidate.use_case || {};
  const baseMetrics = metricMap(baseline.metrics || []);
  const candMetrics = metricMap(candidate.metrics || []);

  const baseModel = formatModelId(baseline);
  const candModel = formatModelId(candidate);
  if (baseModel !== candModel) {
    changes.push({
      code: 'model-changed',
      trigger: 'model',
      title: 'Model changed',
      detail: `Model changed from ${baseModel || 'unspecified'} to ${candModel || 'unspecified'}.`,
      severity: 'high',
      requires_fresh_evaluation: true
    });
  }

  if (isNumber(baseUse.autonomy_level) && isNumber(candUse.autonomy_level) && candUse.autonomy_level > baseUse.autonomy_level) {
    changes.push({
      code: 'autonomy-increased',
      trigger: 'autonomy',
      title: 'Autonomy level increased',
      detail: `Autonomy increased from level ${baseUse.autonomy_level} to level ${candUse.autonomy_level}.`,
      severity: 'high',
      requires_fresh_evaluation: true
    });
  }

  const baseRisk = RISK_RANK[String(baseUse.risk_tier || '').toLowerCase()] || 0;
  const candRisk = RISK_RANK[String(candUse.risk_tier || '').toLowerCase()] || 0;
  if (baseRisk && candRisk && candRisk > baseRisk) {
    changes.push({
      code: 'risk-tier-increased',
      trigger: 'risk',
      title: 'Risk tier increased',
      detail: `Risk tier increased from ${baseUse.risk_tier} to ${candUse.risk_tier}.`,
      severity: 'high',
      requires_fresh_evaluation: true
    });
  }

  if (Number(baseUse.target_users) > 0 && Number(candUse.target_users) >= Number(baseUse.target_users) * 1.25) {
    changes.push({
      code: 'population-expanded',
      trigger: 'population',
      title: 'Target population expanded',
      detail: `Target users increased from ${baseUse.target_users} to ${candUse.target_users}.`,
      severity: 'medium',
      requires_fresh_evaluation: true
    });
  }

  const costNotes = [];
  const baseTaskCost = Number(baseMetrics.cost_per_task?.value);
  const candTaskCost = Number(candMetrics.cost_per_task?.value);
  if (baseTaskCost > 0 && candTaskCost >= baseTaskCost * 1.2) {
    costNotes.push(`cost_per_task rose from ${baseTaskCost} to ${candTaskCost}`);
  }
  if (Number(baseUse.annual_platform_cost) > 0 && Number(candUse.annual_platform_cost) >= Number(baseUse.annual_platform_cost) * 1.2) {
    costNotes.push(`annual_platform_cost rose from ${baseUse.annual_platform_cost} to ${candUse.annual_platform_cost}`);
  }
  if (Number(baseUse.setup_cost) > 0 && Number(candUse.setup_cost) >= Number(baseUse.setup_cost) * 1.2) {
    costNotes.push(`setup_cost rose from ${baseUse.setup_cost} to ${candUse.setup_cost}`);
  }
  if (costNotes.length) {
    changes.push({
      code: 'cost-increased',
      trigger: 'cost',
      title: 'Cost structure increased materially',
      detail: `${costNotes.join('; ')}.`,
      severity: 'medium',
      requires_fresh_evaluation: false
    });
  }

  const norm = value => String(value || '').trim().toLowerCase();
  if (norm(baseUse.department) !== norm(candUse.department) || norm(baseUse.business_outcome) !== norm(candUse.business_outcome)) {
    changes.push({
      code: 'workflow-changed',
      trigger: 'workflow',
      title: 'Workflow scope changed',
      detail: 'Department or declared business outcome changed relative to the baseline.',
      severity: 'medium',
      requires_fresh_evaluation: true
    });
  }

  const candControls = new Map((candidate.controls || []).map(item => [item.key, item]));
  const regressedControls = [];
  for (const item of baseline.controls || []) {
    if (!item.mandatory || item.status !== 'pass') continue;
    const next = candControls.get(item.key);
    if (!next || next.status !== 'pass') {
      regressedControls.push(`${item.key} (${next ? next.status : 'removed'})`);
    }
  }
  if (regressedControls.length) {
    changes.push({
      code: 'control-regression',
      trigger: 'risk',
      title: 'Mandatory control regressed',
      detail: `Previously passing mandatory controls are no longer passing: ${regressedControls.join(', ')}.`,
      severity: 'critical',
      requires_fresh_evaluation: false
    });
  }

  const safetyNotes = [];
  const basePii = Number(baseMetrics.pii_incidents?.value) || 0;
  const candPii = Number(candMetrics.pii_incidents?.value) || 0;
  if (candPii > basePii) safetyNotes.push(`pii_incidents increased from ${basePii} to ${candPii}`);
  const baseCrit = Number(baseMetrics.critical_error_rate?.value);
  const candCrit = Number(candMetrics.critical_error_rate?.value);
  if (Number.isFinite(baseCrit) && Number.isFinite(candCrit) && candCrit - baseCrit > 0.005) {
    safetyNotes.push(`critical_error_rate increased from ${baseCrit} to ${candCrit}`);
  }
  if (safetyNotes.length) {
    changes.push({
      code: 'safety-regression',
      trigger: 'risk',
      title: 'Safety or error rate regressed',
      detail: `${safetyNotes.join('; ')}.`,
      severity: 'critical',
      requires_fresh_evaluation: false
    });
  }

  const qualityNotes = [];
  const drops = [
    ['task_success', 0.02],
    ['groundedness', 0.02],
    ['reliability', 0.01]
  ];
  for (const [key, tolerance] of drops) {
    const baseVal = Number(baseMetrics[key]?.value);
    const candVal = Number(candMetrics[key]?.value);
    if (Number.isFinite(baseVal) && Number.isFinite(candVal) && baseVal - candVal > tolerance) {
      qualityNotes.push(`${key} dropped from ${baseVal} to ${candVal}`);
    }
  }
  if (qualityNotes.length) {
    changes.push({
      code: 'quality-regression',
      trigger: 'quality',
      title: 'Observed workflow quality regressed',
      detail: `${qualityNotes.join('; ')}.`,
      severity: 'medium',
      requires_fresh_evaluation: false
    });
  }

  return changes;
}

function evaluateRegate(baseline, options = {}) {
  const asOfInput = options.asOf;
  const asOf = asOfInput ? parseIsoDate(asOfInput) : new Date().toISOString().slice(0, 10);
  if (!asOf) {
    throw new Error(`Invalid as-of date: ${asOfInput}. Expected YYYY-MM-DD.`);
  }

  const rawTriggers = Array.isArray(options.triggers) ? options.triggers : [];
  const triggers = [...new Set(rawTriggers.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))];
  for (const trigger of triggers) {
    if (!REGATE_TRIGGERS.includes(trigger)) {
      throw new Error(`Unknown re-gate trigger: ${trigger}. Expected one of: ${REGATE_TRIGGERS.join(', ')}.`);
    }
  }

  const targetModel = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : null;
  const nowIso = `${asOf}T00:00:00.000Z`;
  const baselineEval = evaluateContract(baseline, { now: nowIso });
  const baselineModel = formatModelId(baseline);

  const regateBlockers = [];
  const regateWarnings = [];
  const requiredActions = [];
  const pushAction = text => {
    if (text && !requiredActions.includes(text)) requiredActions.push(text);
  };

  if (!options.candidate) {
    const changes = [];
    if (targetModel) {
      if (!baselineModel) {
        changes.push({
          code: 'model-unpinned',
          trigger: 'model',
          title: 'Approved contract does not pin a model',
          detail: `Target model ${targetModel} cannot be verified because use_case.model is not set on the contract.`,
          severity: 'high',
          requires_fresh_evaluation: true
        });
        addIssue(
          regateBlockers,
          'model-change-unrevalidated',
          'Model change requires re-gating',
          `Target model ${targetModel} requires re-gating because the contract does not pin an approved model.`,
          'model',
          'high'
        );
        pushAction(`Pin use_case.model to ${targetModel}, run the representative evaluation set, update evidence dates and re-gate.`);
      } else if (baselineModel !== targetModel) {
        changes.push({
          code: 'model-changed',
          trigger: 'model',
          title: 'Model changed',
          detail: `Model changed from ${baselineModel} to ${targetModel}.`,
          severity: 'high',
          requires_fresh_evaluation: true
        });
        addIssue(
          regateBlockers,
          'model-change-unrevalidated',
          'Model change requires re-gating',
          `Target model ${targetModel} differs from approved model ${baselineModel}.`,
          'model',
          'high'
        );
        pushAction(`Re-run the representative evaluation set on model ${targetModel}, update metrics and evidence dates, then validate with: scale-gate regate <baseline> <candidate>.`);
      }
    }

    for (const trigger of triggers) {
      if (trigger === 'model' && changes.some(item => item.trigger === 'model')) continue;
      changes.push({
        code: `trigger-${trigger}`,
        trigger,
        title: `Material ${trigger} change declared`,
        detail: `Declared ${trigger} change invalidates the prior gate until re-validated.`,
        severity: 'high',
        requires_fresh_evaluation: TRIGGER_EVAL_REQUIRED.has(trigger)
      });
      addIssue(
        regateBlockers,
        `trigger-unrevalidated-${trigger}`,
        `Material ${trigger} change requires re-gating`,
        `A declared ${trigger} change requires fresh evidence before promotion.`,
        trigger,
        'high'
      );
      pushAction(`Re-validate the contract after the ${trigger} change and compare against the approved baseline with: scale-gate regate <baseline> <candidate>.`);
    }

    const expiredEvidence = findExpiredEvidence(baseline, asOf);
    if (expiredEvidence.length) {
      const summary = expiredEvidence.map(item => `${item.title} (expired ${item.expires_at})`).join(', ');
      addIssue(regateBlockers, 'evidence-expired', 'Evidence has expired', `${summary}.`, 'evidence', 'high');
      expiredEvidence.forEach(item => pushAction(`Refresh expired evidence: ${item.title} (expired ${item.expires_at}).`));
    }

    if (!['SCALE', 'CONDITIONAL_SCALE'].includes(baselineEval.decision)) {
      pushAction(`Resolve the SCALE-1 blockers (${baselineEval.decision}): ${baselineEval.decision_copy}`);
    }

    const passed = ['SCALE', 'CONDITIONAL_SCALE'].includes(baselineEval.decision) && regateBlockers.length === 0;
    return {
      protocol: baseline.scale1_version || '1.0',
      mode: 'single',
      as_of: asOf,
      use_case: {
        slug: baseline.use_case.slug,
        name: baseline.use_case.name,
        baseline_model: baselineModel,
        candidate_model: targetModel || baselineModel
      },
      regate_status: passed ? 'PASS' : 'REGATE_REQUIRED',
      regate_copy: passed
        ? 'Re-gate passed. Evidence covers the current scope and supports promotion.'
        : 'Re-gate required before promotion. Resolve the open blockers and re-run the gate.',
      baseline_decision: baselineEval.decision,
      candidate_decision: baselineEval.decision,
      changes,
      expired_evidence: expiredEvidence,
      regate_blockers: regateBlockers,
      regate_warnings: regateWarnings,
      blockers: [...baselineEval.blockers, ...regateBlockers],
      warnings: [...baselineEval.warnings, ...regateWarnings],
      required_actions: requiredActions,
      delta: null,
      evaluation: baselineEval
    };
  }

  const candidate = options.candidate;
  const candidateEval = evaluateContract(candidate, { now: nowIso });
  const candidateModel = formatModelId(candidate);
  const changes = detectMaterialChanges(baseline, candidate);

  for (const trigger of triggers) {
    if (changes.some(item => item.trigger === trigger)) continue;
    changes.push({
      code: `trigger-${trigger}`,
      trigger,
      title: `Material ${trigger} change declared`,
      detail: `Declared ${trigger} change requires verification on the candidate contract.`,
      severity: 'high',
      requires_fresh_evaluation: TRIGGER_EVAL_REQUIRED.has(trigger)
    });
  }

  if (baseline.use_case.slug !== candidate.use_case.slug) {
    addIssue(
      regateBlockers,
      'slug-mismatch',
      'Baseline and candidate describe different use cases',
      `Baseline slug "${baseline.use_case.slug}" does not match candidate slug "${candidate.use_case.slug}".`,
      'governance',
      'critical'
    );
    pushAction('Compare contracts belonging to the same use_case.slug.');
  }

  if (targetModel && candidateModel !== targetModel) {
    addIssue(
      regateBlockers,
      'model-mismatch',
      'Candidate contract model does not match target model',
      `Candidate records ${candidateModel || 'unspecified'} instead of expected target model ${targetModel}.`,
      'model',
      'high'
    );
    pushAction(`Update candidate use_case.model to ${targetModel} and record verified evaluation evidence for that model.`);
  }

  const expiredEvidence = findExpiredEvidence(candidate, asOf);
  if (expiredEvidence.length) {
    const summary = expiredEvidence.map(item => `${item.title} (expired ${item.expires_at})`).join(', ');
    addIssue(regateBlockers, 'evidence-expired', 'Candidate evidence has expired', `${summary}.`, 'evidence', 'high');
    expiredEvidence.forEach(item => pushAction(`Refresh expired evidence: ${item.title} (expired ${item.expires_at}).`));
  }

  const evalTriggeringChanges = changes.filter(item => item.requires_fresh_evaluation);
  if (evalTriggeringChanges.length) {
    const baselineEvalDate = latestObservedAt(baseline.evidence, { types: ['evaluation'] })
      || latestObservedAt(baseline.evidence);
    const candidateEvalDate = latestObservedAt(candidate.evidence, { types: ['evaluation'], verifiedOnly: true });
    const refreshed = Boolean(candidateEvalDate && (!baselineEvalDate || candidateEvalDate > baselineEvalDate));
    if (!refreshed) {
      const triggerNames = [...new Set(evalTriggeringChanges.map(item => item.trigger))].join(', ');
      const afterCopy = baselineEvalDate ? `after ${baselineEvalDate}` : 'for the candidate release';
      addIssue(
        regateBlockers,
        'stale-evaluation-evidence',
        'Evaluation evidence was not refreshed after material change',
        `Material change (${triggerNames}) requires verified evaluation evidence observed ${afterCopy}.`,
        'evidence',
        'high'
      );
      const modelNote = candidateModel ? ` on model ${candidateModel}` : '';
      pushAction(`Re-run the representative evaluation set${modelNote} and record verified evaluation evidence observed ${afterCopy}.`);
    }
  }

  const controlReg = changes.find(item => item.code === 'control-regression');
  if (controlReg) {
    addIssue(regateBlockers, 'control-regression', controlReg.title, controlReg.detail, 'risk', 'critical');
    pushAction('Restore every regressed mandatory control to status "pass" with updated verification evidence.');
  }

  const safetyReg = changes.find(item => item.code === 'safety-regression');
  if (safetyReg) {
    addIssue(regateBlockers, 'safety-regression', safetyReg.title, safetyReg.detail, 'risk', 'critical');
    pushAction('Resolve safety or critical-error regressions before promoting the candidate.');
  }

  const qualityReg = changes.find(item => item.code === 'quality-regression');
  if (qualityReg) {
    addIssue(regateWarnings, 'quality-regression', qualityReg.title, qualityReg.detail, 'quality', 'medium');
  }

  if (baselineEval.decision === 'SCALE' && candidateEval.decision === 'CONDITIONAL_SCALE') {
    addIssue(
      regateWarnings,
      'decision-downgraded',
      'Scale decision downgraded from SCALE to CONDITIONAL_SCALE',
      'Review newly opened warnings and operating conditions before promotion.',
      'governance',
      'medium'
    );
  }

  if (!['SCALE', 'CONDITIONAL_SCALE'].includes(candidateEval.decision)) {
    pushAction(`Resolve the candidate SCALE-1 blockers (${candidateEval.decision}): ${candidateEval.decision_copy}`);
  }

  const baseCost = metricMap(baseline.metrics || []).cost_per_task?.value;
  const candCost = metricMap(candidate.metrics || []).cost_per_task?.value;
  const delta = {
    confidence: round(candidateEval.confidence - baselineEval.confidence, 1),
    first_year_roi: round(candidateEval.economics.first_year_roi - baselineEval.economics.first_year_roi, 1),
    quality: round(candidateEval.pillars.quality - baselineEval.pillars.quality, 1),
    cost_per_task: isNumber(baseCost) && isNumber(candCost) ? round(candCost - baseCost, 4) : null
  };

  const passed = ['SCALE', 'CONDITIONAL_SCALE'].includes(candidateEval.decision) && regateBlockers.length === 0;
  return {
    protocol: candidate.scale1_version || '1.0',
    mode: 'compare',
    as_of: asOf,
    use_case: {
      slug: candidate.use_case.slug,
      name: candidate.use_case.name,
      baseline_model: baselineModel,
      candidate_model: candidateModel
    },
    regate_status: passed ? 'PASS' : 'REGATE_REQUIRED',
    regate_copy: passed
      ? 'Re-gate passed. Evidence covers the current scope and supports promotion.'
      : 'Re-gate required before promotion. Resolve the open blockers and re-run the gate.',
    baseline_decision: baselineEval.decision,
    candidate_decision: candidateEval.decision,
    changes,
    expired_evidence: expiredEvidence,
    regate_blockers: regateBlockers,
    regate_warnings: regateWarnings,
    blockers: [...candidateEval.blockers, ...regateBlockers],
    warnings: [...candidateEval.warnings, ...regateWarnings],
    required_actions: requiredActions,
    delta,
    evaluation: candidateEval
  };
}

module.exports = {
  REQUIRED_METRICS,
  REGATE_TRIGGERS,
  calculateEconomics,
  evidenceConfidence,
  controlAssessment,
  evaluateContract,
  validateContract,
  parseIsoDate,
  formatModelId,
  findExpiredEvidence,
  detectMaterialChanges,
  evaluateRegate
};
