'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { evaluateContract } = require('./engine');

const projectRoot = path.resolve(__dirname, '..');
const dataDirectory = path.join(projectRoot, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });
const databasePath = process.env.SCALE_GATE_DB || path.join(dataDirectory, 'scale-gate.db');
const db = new DatabaseSync(databasePath);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const demoCases = [
  {
    useCase: {
      slug: 'support-copilot', name: 'Customer Support Copilot', owner: 'Nora Diallo', department: 'Customer Operations',
      description: 'Retrieves policy, drafts answers and summarizes cases before human approval.',
      business_outcome: 'Reduce handling time while maintaining resolution quality and protecting customer data.',
      stage: 'pilot', status: 'active', risk_tier: 'high', autonomy_level: 2, pilot_users: 48, target_users: 420,
      baseline_minutes: 12.4, treatment_minutes: 7.8, tasks_per_user_month: 145, labor_cost_hour: 31,
      setup_cost: 185000, annual_platform_cost: 132000, revenue_uplift: 0, risk_avoidance: 90000,
      adoption: 0.68, attribution: 0.72, human_review_rate: 0.18, review_minutes: 1.6
    },
    metrics: [
      ['task_success', 'End-to-end task success', 'quality', 0.89, 0.85, 'ratio', 'min', 240, 1, 'Golden workflow set'],
      ['groundedness', 'Grounded answer rate', 'quality', 0.93, 0.9, 'ratio', 'min', 240, 1, 'Citation audit'],
      ['critical_error_rate', 'Critical error rate', 'quality', 0.014, 0.02, 'ratio', 'max', 240, 1, 'Risk-labelled evaluation set'],
      ['reliability', 'Workflow reliability', 'reliability', 0.991, 0.98, 'ratio', 'min', 4800, 1, 'Pilot telemetry'],
      ['latency_seconds', 'P95 response latency', 'efficiency', 3.4, 5, 'seconds', 'max', 4800, 1, 'Pilot telemetry'],
      ['cost_per_task', 'Model cost per task', 'economics', 0.18, 0.35, 'EUR', 'max', 4800, 1, 'Usage ledger'],
      ['pii_incidents', 'Confirmed privacy incidents', 'risk', 1, 0, 'count', 'max', 240, 1, 'Red-team run']
    ],
    controls: [
      ['privacy-redaction', 'Privacy', 'PII redaction and output filtering', 'Personal data must be removed before model processing and blocked in generated content.', 'critical', 1, 'fail', 'Privacy Lead', 'One synthetic identifier was reproduced during adversarial testing.', 'NIST AI RMF · Manage'],
      ['human-escalation', 'Oversight', 'Human escalation path', 'Low-confidence and policy-sensitive cases are routed to an authorized reviewer.', 'critical', 1, 'pass', 'Operations Lead', 'Escalation queue tested across 86 edge cases.', 'ISO/IEC 42001 · Operation'],
      ['fallback', 'Reliability', 'Service fallback and rollback', 'The original workflow remains available during degradation or outage.', 'high', 1, 'pass', 'Platform Owner', 'Failover exercise completed in 74 seconds.', 'NIST AI RMF · Manage'],
      ['monitoring', 'Monitoring', 'Production quality monitoring', 'Quality, cost, drift and escalation are continuously observable.', 'high', 1, 'pass', 'ML Platform', 'Dashboard and alert thresholds reviewed weekly.', 'NIST AI RMF · Measure'],
      ['finance-validation', 'Value', 'Finance validates the baseline', 'Fully loaded costs and attribution assumptions are reviewed by Finance.', 'high', 1, 'pass', 'Finance Partner', 'Baseline and cost model signed off on 2026-09-12.', 'SCALE-1 · Value'],
      ['incident-playbook', 'Governance', 'AI incident playbook', 'Owners, severity levels and response times are explicit.', 'medium', 1, 'pass', 'Risk Office', 'Tabletop exercise completed.', 'ISO/IEC 42001 · Improvement']
    ],
    evidence: [
      ['240-task golden evaluation', 'evaluation', 'Quality', 'Controlled evaluation run', 0.94, 1, '2026-09-16', '2026-12-15', 'Representative intents, policy exceptions and adversarial prompts.'],
      ['Six-week pilot telemetry', 'telemetry', 'Reliability', 'Local observability export', 0.91, 1, '2026-09-18', '2026-12-17', '4,800 completed tasks across 48 pilot users.'],
      ['Time-and-motion baseline', 'baseline', 'Value', 'Operations measurement', 0.88, 1, '2026-08-28', '2027-02-28', 'Median handling time measured before pilot.'],
      ['Finance value review', 'finance', 'Value', 'Finance review note', 0.9, 1, '2026-09-12', '2027-03-12', 'Attribution and fully loaded cost assumptions verified.'],
      ['Privacy red-team report', 'risk', 'Privacy', 'Internal red-team', 0.97, 1, '2026-09-17', '2026-12-16', 'One unresolved PII reproduction finding.']
    ]
  },
  {
    useCase: {
      slug: 'contract-review-agent', name: 'Contract Review Agent', owner: 'Alice Cohen', department: 'Legal & Compliance',
      description: 'Pre-screens commercial agreements, maps clauses to policy and prepares a review brief.',
      business_outcome: 'Shorten first-pass review without delegating legal approval to the system.',
      stage: 'controlled-scale', status: 'active', risk_tier: 'high', autonomy_level: 1, pilot_users: 22, target_users: 75,
      baseline_minutes: 96, treatment_minutes: 54, tasks_per_user_month: 18, labor_cost_hour: 82,
      setup_cost: 142000, annual_platform_cost: 76000, revenue_uplift: 110000, risk_avoidance: 180000,
      adoption: 0.61, attribution: 0.66, human_review_rate: 1, review_minutes: 18
    },
    metrics: [
      ['task_success', 'End-to-end task success', 'quality', 0.84, 0.85, 'ratio', 'min', 78, 1, 'Clause benchmark'],
      ['groundedness', 'Grounded clause mapping', 'quality', 0.91, 0.9, 'ratio', 'min', 78, 1, 'Citation audit'],
      ['critical_error_rate', 'Critical miss rate', 'quality', 0.018, 0.02, 'ratio', 'max', 78, 1, 'Legal review'],
      ['reliability', 'Workflow reliability', 'reliability', 0.985, 0.98, 'ratio', 'min', 620, 1, 'Pilot telemetry'],
      ['latency_seconds', 'P95 analysis latency', 'efficiency', 18.2, 30, 'seconds', 'max', 620, 1, 'Pilot telemetry'],
      ['cost_per_task', 'Model cost per document', 'economics', 0.74, 1.2, 'EUR', 'max', 620, 1, 'Usage ledger'],
      ['pii_incidents', 'Confirmed privacy incidents', 'risk', 0, 0, 'count', 'max', 78, 1, 'Security test']
    ],
    controls: [
      ['privacy-redaction', 'Privacy', 'Document isolation and retention', 'Contracts are isolated and retained under the approved policy.', 'critical', 1, 'pass', 'Security Lead', 'Tenant isolation and deletion tested.', 'NIST AI RMF · Manage'],
      ['human-escalation', 'Oversight', 'Qualified legal approval', 'No legal decision is issued without an authorized reviewer.', 'critical', 1, 'pass', 'General Counsel', 'Approval is technically mandatory.', 'ISO/IEC 42001 · Operation'],
      ['fallback', 'Reliability', 'Manual review remains available', 'The standard review path remains the system of record.', 'high', 1, 'pass', 'Legal Operations', 'Fallback verified.', 'NIST AI RMF · Manage'],
      ['monitoring', 'Monitoring', 'Clause-level error monitoring', 'Misses and overrides are reviewed by clause family.', 'high', 1, 'pass', 'Legal Operations', 'Weekly review established.', 'NIST AI RMF · Measure'],
      ['finance-validation', 'Value', 'Finance validates the baseline', 'Cost and cycle assumptions are independently reviewed.', 'high', 1, 'pass', 'Finance Partner', 'Value model reviewed.', 'SCALE-1 · Value']
    ],
    evidence: [
      ['Clause benchmark v1', 'evaluation', 'Quality', 'Legal benchmark', 0.86, 1, '2026-09-10', '2026-12-09', '78 agreements across six clause families.'],
      ['Reviewer override log', 'telemetry', 'Oversight', 'Pilot audit trail', 0.82, 1, '2026-09-18', '2026-12-17', 'Reasons captured for every override.'],
      ['Cycle-time baseline', 'baseline', 'Value', 'Legal operations study', 0.89, 1, '2026-08-20', '2027-02-20', 'Pre-pilot review time sampled over four weeks.']
    ]
  },
  {
    useCase: {
      slug: 'demand-forecast', name: 'Demand Forecast Intelligence', owner: 'Julien Moreau', department: 'Operations',
      description: 'Combines demand signals and operational constraints to recommend weekly capacity plans.',
      business_outcome: 'Reduce avoidable capacity variance while keeping allocation decisions accountable.',
      stage: 'scale-ready', status: 'active', risk_tier: 'medium', autonomy_level: 2, pilot_users: 36, target_users: 180,
      baseline_minutes: 210, treatment_minutes: 78, tasks_per_user_month: 4, labor_cost_hour: 56,
      setup_cost: 224000, annual_platform_cost: 148000, revenue_uplift: 520000, risk_avoidance: 260000,
      adoption: 0.76, attribution: 0.73, human_review_rate: 0.22, review_minutes: 12
    },
    metrics: [
      ['task_success', 'Decision-ready forecast rate', 'quality', 0.92, 0.85, 'ratio', 'min', 410, 1, 'Backtest and live pilot'],
      ['groundedness', 'Traceable recommendation rate', 'quality', 0.96, 0.9, 'ratio', 'min', 410, 1, 'Evidence trace audit'],
      ['critical_error_rate', 'Material planning error rate', 'quality', 0.008, 0.02, 'ratio', 'max', 410, 1, 'Backtest review'],
      ['reliability', 'Workflow reliability', 'reliability', 0.996, 0.98, 'ratio', 'min', 2100, 1, 'Production shadow telemetry'],
      ['latency_seconds', 'P95 plan generation', 'efficiency', 11.4, 20, 'seconds', 'max', 2100, 1, 'Telemetry'],
      ['cost_per_task', 'Model cost per plan', 'economics', 1.82, 3.5, 'EUR', 'max', 2100, 1, 'Usage ledger'],
      ['pii_incidents', 'Confirmed privacy incidents', 'risk', 0, 0, 'count', 'max', 410, 1, 'Security test']
    ],
    controls: [
      ['privacy-redaction', 'Privacy', 'Approved operational data boundary', 'Only approved operational fields enter the workflow.', 'critical', 1, 'pass', 'Data Owner', 'Field-level allowlist enforced.', 'NIST AI RMF · Map'],
      ['human-escalation', 'Oversight', 'Planner approval and override', 'Planners approve every material allocation change.', 'critical', 1, 'pass', 'Operations Director', 'Override and reason are logged.', 'ISO/IEC 42001 · Operation'],
      ['fallback', 'Reliability', 'Forecast fallback', 'The validated statistical baseline remains available.', 'high', 1, 'pass', 'Platform Owner', 'Quarterly fallback drill passed.', 'NIST AI RMF · Manage'],
      ['monitoring', 'Monitoring', 'Drift and business-impact monitoring', 'Forecast drift and downstream variance are monitored.', 'high', 1, 'pass', 'Data Science Lead', 'Automated thresholds active.', 'NIST AI RMF · Measure'],
      ['finance-validation', 'Value', 'Finance validates scale economics', 'Savings and incremental value use approved attribution.', 'high', 1, 'pass', 'Finance Partner', 'Scenario model approved.', 'SCALE-1 · Value'],
      ['incident-playbook', 'Governance', 'Decision incident playbook', 'Material misallocation triggers escalation and rollback.', 'medium', 1, 'pass', 'Risk Office', 'Tabletop completed.', 'ISO/IEC 42001 · Improvement']
    ],
    evidence: [
      ['410-period backtest', 'evaluation', 'Quality', 'Validated backtest', 0.96, 1, '2026-09-15', '2026-12-14', 'Seasonality, anomalies and sparse regions represented.'],
      ['Shadow-mode telemetry', 'telemetry', 'Reliability', 'Production telemetry', 0.93, 1, '2026-09-18', '2026-12-17', 'No automatic allocations performed.'],
      ['Operations baseline', 'baseline', 'Value', 'Operations control study', 0.91, 1, '2026-08-25', '2027-02-25', 'Capacity variance and planning effort measured.'],
      ['Finance scale model', 'finance', 'Value', 'Finance approval', 0.92, 1, '2026-09-13', '2027-03-13', 'Attribution and sensitivity assumptions approved.']
    ]
  }
];

function seedDatabase() {
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM organizations').get().count);
  if (count > 0) return;
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO organizations (id, name, sector, geography, risk_appetite, currency) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 'Northstar Group · Fictional demo', 'Digital services & operations', 'Europe', 'balanced', 'EUR');
    const insertCase = db.prepare(`INSERT INTO use_cases (
      organization_id, slug, name, owner, department, description, business_outcome, stage, status, risk_tier,
      autonomy_level, pilot_users, target_users, baseline_minutes, treatment_minutes, tasks_per_user_month,
      labor_cost_hour, setup_cost, annual_platform_cost, revenue_uplift, risk_avoidance, adoption, attribution,
      human_review_rate, review_minutes
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMetric = db.prepare(`INSERT INTO metrics (
      use_case_id, key, label, category, value, target, unit, direction, sample_size, verified, source, measured_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertControl = db.prepare(`INSERT INTO controls (
      use_case_id, key, domain, title, description, severity, mandatory, status, owner, evidence, framework_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertEvidence = db.prepare(`INSERT INTO evidence (
      use_case_id, title, evidence_type, domain, source, confidence, verified, observed_at, expires_at, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const item of demoCases) {
      const data = item.useCase;
      const result = insertCase.run(
        data.slug, data.name, data.owner, data.department, data.description, data.business_outcome, data.stage, data.status,
        data.risk_tier, data.autonomy_level, data.pilot_users, data.target_users, data.baseline_minutes, data.treatment_minutes,
        data.tasks_per_user_month, data.labor_cost_hour, data.setup_cost, data.annual_platform_cost, data.revenue_uplift,
        data.risk_avoidance, data.adoption, data.attribution, data.human_review_rate, data.review_minutes
      );
      const useCaseId = Number(result.lastInsertRowid);
      item.metrics.forEach(metric => insertMetric.run(useCaseId, ...metric, '2026-09-18'));
      item.controls.forEach(control => insertControl.run(useCaseId, ...control));
      item.evidence.forEach(evidence => insertEvidence.run(useCaseId, ...evidence));
    }
    db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?)')
      .run('system', 1, 'seed', 'Fictional SCALE GATE demonstration data initialized');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function normalize(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]));
}

function normalizeRows(rows) {
  return rows.map(normalize);
}

function getOrganization() {
  return normalize(db.prepare('SELECT * FROM organizations ORDER BY id LIMIT 1').get());
}

function getUseCases() {
  return normalizeRows(db.prepare('SELECT * FROM use_cases ORDER BY id').all());
}

function getContract(id) {
  const useCase = normalize(db.prepare('SELECT * FROM use_cases WHERE id = ?').get(Number(id)));
  if (!useCase) return null;
  const controls = normalizeRows(db.prepare('SELECT * FROM controls WHERE use_case_id = ? ORDER BY id').all(Number(id)))
    .map(item => ({ ...item, mandatory: Boolean(item.mandatory) }));
  const metrics = normalizeRows(db.prepare('SELECT * FROM metrics WHERE use_case_id = ? ORDER BY id').all(Number(id)))
    .map(item => ({ ...item, verified: Boolean(item.verified) }));
  const evidence = normalizeRows(db.prepare('SELECT * FROM evidence WHERE use_case_id = ? ORDER BY id').all(Number(id)))
    .map(item => ({ ...item, verified: Boolean(item.verified) }));
  return {
    scale1_version: '1.0',
    organization: getOrganization(),
    use_case: useCase,
    metrics,
    controls,
    evidence
  };
}

function getState() {
  const useCases = getUseCases();
  const contracts = {};
  const assessments = {};
  for (const item of useCases) {
    contracts[item.id] = getContract(item.id);
    assessments[item.id] = evaluateContract(contracts[item.id]);
  }
  const evaluations = normalizeRows(db.prepare('SELECT * FROM evaluations ORDER BY id DESC LIMIT 50').all())
    .map(row => ({
      ...row,
      blockers: JSON.parse(row.blockers_json),
      warnings: JSON.parse(row.warnings_json),
      conditions: JSON.parse(row.conditions_json),
      summary: JSON.parse(row.summary_json)
    }));
  const audit = normalizeRows(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all());
  return {
    organization: getOrganization(),
    use_cases: useCases,
    contracts,
    assessments,
    evaluations,
    audit,
    database: { engine: 'SQLite', mode: 'local-first', file: path.basename(databasePath) }
  };
}

function logAudit(entityType, entityId, action, detail = '') {
  db.prepare('INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?)')
    .run(entityType, entityId, action, detail);
}

function runEvaluation(id) {
  const contract = getContract(id);
  if (!contract) return null;
  const result = evaluateContract(contract);
  const inserted = db.prepare(`INSERT INTO evaluations (
    use_case_id, decision, confidence, quality_score, value_score, control_score, adoption_score,
    annual_benefit, annual_cost, first_year_roi, blockers_json, warnings_json, conditions_json, summary_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      Number(id), result.decision, result.confidence, result.pillars.quality, result.pillars.value,
      result.pillars.controls, result.pillars.adoption, result.economics.annual_benefit,
      result.economics.first_year_cost, result.economics.first_year_roi, JSON.stringify(result.blockers),
      JSON.stringify(result.warnings), JSON.stringify(result.conditions), JSON.stringify(result)
    );
  logAudit('evaluation', Number(inserted.lastInsertRowid), 'run', `${contract.use_case.name}: ${result.decision}`);
  return { id: Number(inserted.lastInsertRowid), ...result };
}

function updateControl(id, input) {
  const control = normalize(db.prepare('SELECT * FROM controls WHERE id = ?').get(Number(id)));
  if (!control) return null;
  const status = ['pass', 'fail', 'missing'].includes(input.status) ? input.status : control.status;
  const evidence = input.evidence === undefined ? control.evidence : String(input.evidence);
  db.prepare('UPDATE controls SET status = ?, evidence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, evidence, Number(id));
  logAudit('control', Number(id), 'update', `${control.key}: ${status}`);
  return normalize(db.prepare('SELECT * FROM controls WHERE id = ?').get(Number(id)));
}

const editableUseCaseFields = [
  'name', 'owner', 'department', 'description', 'business_outcome', 'stage', 'status', 'risk_tier',
  'autonomy_level', 'pilot_users', 'target_users', 'baseline_minutes', 'treatment_minutes',
  'tasks_per_user_month', 'labor_cost_hour', 'setup_cost', 'annual_platform_cost', 'revenue_uplift',
  'risk_avoidance', 'adoption', 'attribution', 'human_review_rate', 'review_minutes'
];

function updateUseCase(id, input) {
  const payload = Object.fromEntries(editableUseCaseFields
    .filter(field => input[field] !== undefined)
    .map(field => [field, input[field]]));
  const fields = Object.keys(payload);
  if (!fields.length) return normalize(db.prepare('SELECT * FROM use_cases WHERE id = ?').get(Number(id)));
  const result = db.prepare(`UPDATE use_cases SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...fields.map(field => payload[field]), Number(id));
  if (!Number(result.changes)) return null;
  logAudit('use_case', Number(id), 'update', fields.join(', '));
  return normalize(db.prepare('SELECT * FROM use_cases WHERE id = ?').get(Number(id)));
}

function upsertMetric(useCaseId, input) {
  const useCase = db.prepare('SELECT id FROM use_cases WHERE id = ?').get(Number(useCaseId));
  if (!useCase) return null;
  const key = String(input.key || '').trim();
  if (!key) throw new Error('Metric key is required.');
  db.prepare(`INSERT INTO metrics (
    use_case_id, key, label, category, value, target, unit, direction, sample_size, verified, source, measured_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(use_case_id, key) DO UPDATE SET
    label = excluded.label, category = excluded.category, value = excluded.value, target = excluded.target,
    unit = excluded.unit, direction = excluded.direction, sample_size = excluded.sample_size,
    verified = excluded.verified, source = excluded.source, measured_at = excluded.measured_at`)
    .run(
      Number(useCaseId), key, input.label || key, input.category || 'quality', Number(input.value) || 0,
      Number(input.target) || 0, input.unit || 'ratio', input.direction === 'max' ? 'max' : 'min',
      Number(input.sample_size) || 0, input.verified ? 1 : 0, input.source || 'Manual evidence',
      input.measured_at || new Date().toISOString().slice(0, 10)
    );
  logAudit('metric', Number(useCaseId), 'upsert', key);
  return normalize(db.prepare('SELECT * FROM metrics WHERE use_case_id = ? AND key = ?').get(Number(useCaseId), key));
}

function slugify(text) {
  return String(text || 'new-use-case').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `use-case-${Date.now()}`;
}

function createUseCase(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Use-case name is required.');
  let slug = slugify(input.slug || name);
  if (db.prepare('SELECT id FROM use_cases WHERE slug = ?').get(slug)) slug = `${slug}-${Date.now().toString().slice(-5)}`;
  const result = db.prepare(`INSERT INTO use_cases (
    organization_id, slug, name, owner, department, description, business_outcome, stage, status, risk_tier,
    autonomy_level, pilot_users, target_users, baseline_minutes, treatment_minutes, tasks_per_user_month,
    labor_cost_hour, setup_cost, annual_platform_cost, revenue_uplift, risk_avoidance, adoption, attribution,
    human_review_rate, review_minutes
  ) VALUES (1, ?, ?, ?, ?, ?, ?, 'pilot', 'active', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      slug, name, input.owner || 'Unassigned', input.department || 'Cross-functional', input.description || '',
      input.business_outcome || '', input.risk_tier || 'medium', Number(input.pilot_users) || 10,
      Number(input.target_users) || 100, Number(input.baseline_minutes) || 30, Number(input.treatment_minutes) || 20,
      Number(input.tasks_per_user_month) || 20, Number(input.labor_cost_hour) || 50, Number(input.setup_cost) || 50000,
      Number(input.annual_platform_cost) || 25000, Number(input.revenue_uplift) || 0, Number(input.risk_avoidance) || 0,
      Number(input.adoption) || 0.35, Number(input.attribution) || 0.7, Number(input.human_review_rate) || 0.5,
      Number(input.review_minutes) || 3
    );
  const id = Number(result.lastInsertRowid);
  const defaults = [
    ['task_success', 'End-to-end task success', 'quality', 0.7, 0.85, 'ratio', 'min'],
    ['groundedness', 'Grounded output rate', 'quality', 0.75, 0.9, 'ratio', 'min'],
    ['critical_error_rate', 'Critical error rate', 'quality', 0.04, 0.02, 'ratio', 'max'],
    ['reliability', 'Workflow reliability', 'reliability', 0.95, 0.98, 'ratio', 'min'],
    ['latency_seconds', 'P95 response latency', 'efficiency', 8, 5, 'seconds', 'max'],
    ['cost_per_task', 'Model cost per task', 'economics', 0.5, 0.35, 'EUR', 'max'],
    ['pii_incidents', 'Confirmed privacy incidents', 'risk', 0, 0, 'count', 'max']
  ];
  defaults.forEach(item => db.prepare(`INSERT INTO metrics (
    use_case_id, key, label, category, value, target, unit, direction, sample_size, verified, source, measured_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 25, 0, 'Initial estimate', ?)`)
    .run(id, ...item, new Date().toISOString().slice(0, 10)));
  const controls = [
    ['privacy-redaction', 'Privacy', 'Data boundary and privacy controls', 'critical'],
    ['human-escalation', 'Oversight', 'Human escalation path', 'critical'],
    ['fallback', 'Reliability', 'Fallback and rollback', 'high'],
    ['monitoring', 'Monitoring', 'Quality and drift monitoring', 'high'],
    ['finance-validation', 'Value', 'Finance validates the baseline', 'high']
  ];
  controls.forEach(item => db.prepare(`INSERT INTO controls (
    use_case_id, key, domain, title, description, severity, mandatory, status, owner, evidence, framework_ref
  ) VALUES (?, ?, ?, ?, '', ?, 1, 'missing', 'Unassigned', '', 'SCALE-1')`).run(id, ...item));
  logAudit('use_case', id, 'create', name);
  return normalize(db.prepare('SELECT * FROM use_cases WHERE id = ?').get(id));
}

seedDatabase();

module.exports = {
  db,
  databasePath,
  getState,
  getContract,
  getUseCases,
  runEvaluation,
  updateControl,
  updateUseCase,
  upsertMetric,
  createUseCase
};
