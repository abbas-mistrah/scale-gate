'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const viewLabels = {
  decision: 'Decision Room',
  evidence: 'Evidence Map',
  evaluation: 'Evaluation Lab',
  value: 'Value & Scale',
  controls: 'Controls & Autonomy',
  pack: 'Decision Pack',
  protocol: 'SCALE-1 Protocol'
};

const app = {
  state: null,
  view: 'decision',
  selectedId: null,
  scenario: null,
  installPrompt: null
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;'
  })[char]);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function currency(value, compact = false) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard'
  }).format(Number(value) || 0);
}

function number(value) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function percent(value, digits = 0) {
  return `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(Number(value) || 0)}%`;
}

function dateLabel(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body.error || body || `Request failed (${response.status})`);
  return body;
}

function currentCase() {
  return app.state.use_cases.find(item => Number(item.id) === Number(app.selectedId));
}

function contract() {
  return app.state.contracts[String(app.selectedId)] || app.state.contracts[app.selectedId];
}

function assessment() {
  return app.state.assessments[String(app.selectedId)] || app.state.assessments[app.selectedId];
}

function decisionMeta(decision) {
  const map = {
    SCALE: { label: 'SCALE', tone: 'green', color: '#198754', short: 'Scale approved' },
    CONDITIONAL_SCALE: { label: 'CONDITIONAL SCALE', tone: 'amber', color: '#c77a04', short: 'Scale with limits' },
    REPAIR: { label: 'REPAIR BEFORE SCALE', tone: 'red', color: '#c94035', short: 'Repair required' },
    REJECT: { label: 'REJECT', tone: 'red', color: '#c94035', short: 'Stop investment' },
    RETIRE: { label: 'RETIRE', tone: 'neutral', color: '#796f66', short: 'Withdraw system' }
  };
  return map[decision] || map.REPAIR;
}

function badge(text, tone = 'neutral') {
  return `<span class='badge ${tone}'>${escapeHtml(text)}</span>`;
}

function pageHero(kicker, title, subtitle, actions = '') {
  return `<header class='page-hero'>
    <div><div class='eyebrow'>${escapeHtml(kicker)}</div><h1>${title}</h1><p>${subtitle}</p></div>
    ${actions ? `<div class='hero-actions'>${actions}</div>` : ''}
  </header>`;
}

function issueList(items, empty = 'No critical issue detected.') {
  if (!items.length) return `<div class='blocker-box' style='border-color:#b9e3cb;background:var(--green-soft)'><i style='background:var(--green)'>✓</i><div><strong style='color:var(--green)'>CLEAR</strong><p>${escapeHtml(empty)}</p></div></div>`;
  return items.slice(0, 2).map(item => `<div class='blocker-box'><i>!</i><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div></div>`).join('');
}

function gateCell(label, score, color, note) {
  return `<div class='gate-cell' style='--accent:${color}'><header><span>${escapeHtml(label)}</span><i></i></header><strong>${percent(score, 0)}</strong><div class='bar'><i style='--score:${clamp(score / 100) * 100}%'></i></div><small>${escapeHtml(note)}</small></div>`;
}

function renderDecision() {
  const useCase = currentCase();
  const result = assessment();
  const meta = decisionMeta(result.decision);
  const economics = result.economics;
  const primaryIssue = result.blockers[0];
  const decisionRing = Math.max(8, result.confidence);
  const histories = app.state.evaluations.filter(item => Number(item.use_case_id) === Number(useCase.id)).slice(0, 4);

  return `<div class='page'>
    ${pageHero(
      'ENTERPRISE AI SCALE DECISION',
      'From pilot promise to <em style="color:var(--orange);font-style:normal">defensible scale.</em>',
      `One decision system connects technical performance, operating reality, human oversight, full economics and risk for <strong>${escapeHtml(useCase.name)}</strong>.`,
      `<button class='button ghost' data-action='new-use-case'>＋ New use case</button><button class='button primary' data-action='run-gate'>▶ Run scale gate</button>`
    )}

    <section class='decision-layout'>
      <article class='decision-card'>
        <div class='decision-top'><div><div class='mini-label'>CURRENT SCALE DECISION</div><h2>${escapeHtml(useCase.name)}</h2></div>${badge(meta.short, meta.tone)}</div>
        <div class='decision-body'>
          <div class='gate-ring' style='--score:${decisionRing};--ring:${meta.color}'>
            <div class='gate-core'><span>SCALE GATE VERDICT</span><strong style='color:${meta.color}'>${escapeHtml(meta.label)}</strong><small>${result.confidence}% evidence confidence · valid to ${dateLabel(result.valid_until)}</small></div>
          </div>
          <div class='decision-copy'>
            <h3>${escapeHtml(result.decision_copy)}</h3>
            <p>${escapeHtml(useCase.business_outcome)}</p>
            ${issueList(result.blockers, 'No hard blocker can override the decision.')}
            ${result.conditions.length ? `<div class='condition-list'>${result.conditions.slice(0, 3).map((item, index) => `<div class='condition-item'><i>${index + 1}</i><span>${escapeHtml(item)}</span></div>`).join('')}</div>` : ''}
            ${primaryIssue?.code === 'control-privacy-redaction' || primaryIssue?.code === 'pii-incidents' ? `<button class='button danger small mt-14' data-action='resolve-privacy'>Resolve privacy finding &amp; re-test</button>` : ''}
          </div>
        </div>
      </article>

      <div class='side-stack'>
        <article class='summary-card'><header><span>ANNUAL ATTRIBUTABLE BENEFIT</span><i></i></header><strong>${currency(economics.annual_benefit, true)}</strong><p>Capacity, revenue and risk avoidance after adoption and attribution.</p><div class='microbar'><i style='--value:${Math.min(100, Math.max(12, result.pillars.value))}%;--accent:var(--orange)'></i></div></article>
        <article class='summary-card'><header><span>FIRST-YEAR NET VALUE</span><i style='background:var(--green);box-shadow:0 0 0 4px var(--green-soft)'></i></header><strong>${currency(economics.first_year_net, true)}</strong><p>Includes setup, platform, model use and human review burden.</p><div class='microbar'><i style='--value:${Math.min(100, Math.max(8, (economics.first_year_roi + 20) / 2))}%;--accent:var(--green)'></i></div></article>
        <article class='summary-card'><header><span>DECISION INTEGRITY</span><i style='background:${meta.color}'></i></header><strong>${result.blockers.length} blocker${result.blockers.length === 1 ? '' : 's'}</strong><p>${result.policy}</p><div class='microbar'><i style='--value:${100 - Math.min(100, result.blockers.length * 35)}%;--accent:${meta.color}'></i></div></article>
      </div>
    </section>

    <section class='kpi-grid'>
      <article class='kpi-card'><span>EVIDENCE CONFIDENCE</span><strong>${percent(result.confidence)}</strong><small>${result.evidence_assessment.coverage}% metric coverage</small><em>Verified evidence only</em></article>
      <article class='kpi-card'><span>FIRST-YEAR ROI</span><strong>${percent(economics.first_year_roi, 1)}</strong><small>${currency(economics.first_year_cost, true)} fully loaded cost</small><em>${economics.payback_months ? `${economics.payback_months} month payback` : 'No payback yet'}</em></article>
      <article class='kpi-card'><span>TASK SUCCESS</span><strong>${percent((contract().metrics.find(item => item.key === 'task_success')?.value || 0) * 100)}</strong><small>End-to-end representative tasks</small><em>${contract().metrics.find(item => item.key === 'task_success')?.sample_size || 0} cases tested</em></article>
      <article class='kpi-card'><span>SUSTAINED ADOPTION</span><strong>${percent(useCase.adoption * 100)}</strong><small>${useCase.pilot_users} pilot users observed</small><em>Workflow use, not activation</em></article>
      <article class='kpi-card'><span>AUTONOMY CEILING</span><strong>L${useCase.autonomy_level}</strong><small>Human approval remains binding</small><em>${escapeHtml(useCase.risk_tier)} risk tier</em></article>
    </section>

    <section class='grid cols-2 mt-14'>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Evidence gate matrix</h3><p>Five independent pillars. Hard blockers sit outside the averages.</p></div>${badge('SCALE-1', 'purple')}</div>
        <div class='gate-matrix'>
          ${gateCell('Quality', result.pillars.quality, '#ff681e', 'Task fidelity and critical failures')}
          ${gateCell('Value', result.pillars.value, '#198754', 'Fully loaded first-year economics')}
          ${gateCell('Controls', result.pillars.controls, '#c94035', `${result.control_assessment.passed}/${result.control_assessment.total} mandatory controls`)}
          ${gateCell('Adoption', result.pillars.adoption, '#2d66d2', 'Sustained workflow behavior')}
          ${gateCell('Evidence', result.pillars.evidence, '#6650e5', 'Coverage, sample and verification')}
        </div>
      </article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Decision trail</h3><p>Every gate run is timestamped and preserved locally.</p></div><button class='button small' data-action='run-gate'>Run now</button></div>
        <div class='timeline'>
          ${histories.length ? histories.map(item => {
            const itemMeta = decisionMeta(item.decision);
            return `<div class='timeline-item'><i style='--accent:${itemMeta.color};--bg:${itemMeta.tone === 'green' ? 'var(--green-soft)' : itemMeta.tone === 'red' ? 'var(--red-soft)' : 'var(--amber-soft)'}'>${item.decision === 'SCALE' ? '✓' : '!'}</i><div><strong>${escapeHtml(itemMeta.label)}</strong><p>${item.confidence}% confidence · ${item.blockers.length} hard blockers · ${item.first_year_roi}% ROI</p></div><time>${dateLabel(item.created_at)}</time></div>`;
          }).join('') : `<div class='timeline-item'><i>1</i><div><strong>Live assessment ready</strong><p>Run the gate to seal the first decision record.</p></div><time>Now</time></div>`}
          <div class='timeline-item'><i style='--accent:var(--purple);--bg:var(--purple-soft)'>◇</i><div><strong>SCALE-1 contract loaded</strong><p>${contract().metrics.length} metrics, ${contract().controls.length} controls and ${contract().evidence.length} evidence items.</p></div><time>${dateLabel(useCase.updated_at)}</time></div>
        </div>
      </article>
    </section>
  </div>`;
}

function renderEvidence() {
  const useCase = currentCase();
  const data = contract();
  const result = assessment();
  const domains = ['Quality', 'Value', 'Reliability', 'Privacy', 'Oversight', 'Monitoring'];
  const colors = ['#ff681e', '#198754', '#2d66d2', '#c94035', '#6650e5', '#c77a04'];
  const domainCards = domains.map((domain, index) => {
    const evidenceItems = data.evidence.filter(item => item.domain.toLowerCase() === domain.toLowerCase());
    const controls = data.controls.filter(item => item.domain.toLowerCase() === domain.toLowerCase());
    const items = [...evidenceItems, ...controls];
    const passed = evidenceItems.filter(item => item.verified).length + controls.filter(item => item.status === 'pass').length;
    const score = items.length ? Math.round(passed / items.length * 100) : 0;
    return `<article class='domain-card' style='--accent:${colors[index]}'><header><h3>${domain}</h3><strong>${score}%</strong></header><p>${items.length ? `${passed} of ${items.length} evidence obligations are verified or passed.` : 'No evidence mapped to this domain yet.'}</p><footer><span>${evidenceItems.length} sources</span><span>${controls.length} controls</span></footer></article>`;
  }).join('');

  return `<div class='page'>
    ${pageHero('EVIDENCE MAP', 'See exactly what the decision rests on.', `SCALE GATE separates verified observations, assumptions and missing proof for <strong>${escapeHtml(useCase.name)}</strong>.`, `<button class='button primary' data-action='run-gate'>Recalculate confidence</button>`)}
    <section class='evidence-hero'>
      <article class='panel confidence-card'>
        <div class='mini-label'>EVIDENCE CONFIDENCE</div>
        <div class='confidence-orbit' style='--score:${result.confidence}'><div><strong>${result.confidence}</strong><span>OUT OF 100</span></div></div>
        <div class='confidence-components'>
          <div><span>Coverage</span><strong>${result.evidence_assessment.coverage}%</strong></div>
          <div><span>Verification</span><strong>${result.evidence_assessment.verification}%</strong></div>
          <div><span>Sample strength</span><strong>${result.evidence_assessment.sample_strength}%</strong></div>
          <div><span>Source confidence</span><strong>${result.evidence_assessment.source_confidence}%</strong></div>
        </div>
      </article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h2>Evidence domains</h2><p>Decision coverage across business, technical and governance obligations.</p></div>${badge(result.confidence >= 80 ? 'Decision grade' : 'Proof gaps', result.confidence >= 80 ? 'green' : 'amber')}</div>
        <div class='domain-grid'>${domainCards}</div>
      </article>
    </section>

    <article class='panel panel-pad mt-14'>
      <div class='panel-head'><div><h2>Evidence register</h2><p>Traceable sources with confidence, verification and expiry.</p></div><span class='mini-label'>${data.evidence.length} SOURCES</span></div>
      <div class='table-wrap'><table><thead><tr><th>Evidence</th><th>Domain</th><th>Source</th><th>Confidence</th><th>Observed</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
        ${data.evidence.map(item => `<tr><td class='source-cell'><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.note)}</span></td><td>${escapeHtml(item.domain)}</td><td>${escapeHtml(item.source)}</td><td><strong>${percent(item.confidence * 100)}</strong></td><td>${dateLabel(item.observed_at)}</td><td>${dateLabel(item.expires_at)}</td><td><span class='status-dot ${item.verified ? 'pass' : 'missing'}'>${item.verified ? 'Verified' : 'Unverified'}</span></td></tr>`).join('')}
      </tbody></table></div>
    </article>
  </div>`;
}

function metricScore(metric) {
  const value = Number(metric.value) || 0;
  const target = Number(metric.target) || 0;
  if (metric.direction === 'max') {
    if (target === 0) return value === 0 ? 1 : 0;
    return clamp(target / Math.max(value, 0.000001));
  }
  return target === 0 ? (value > 0 ? 1 : 0) : clamp(value / target);
}

function formatMetric(metric, target = false) {
  const value = Number(target ? metric.target : metric.value) || 0;
  if (metric.unit === 'ratio') return percent(value * 100, value * 100 < 10 ? 1 : 0);
  if (metric.unit === 'EUR') return currency(value);
  if (metric.unit === 'seconds') return `${number(value)}s`;
  return number(value);
}

function renderEvaluation() {
  const useCase = currentCase();
  const data = contract();
  const result = assessment();
  const history = app.state.evaluations.filter(item => Number(item.use_case_id) === Number(useCase.id)).slice(0, 8);
  const metricRows = data.metrics.map(metric => {
    const score = metricScore(metric);
    const tone = score >= 1 ? 'var(--green)' : score >= .75 ? 'var(--amber)' : 'var(--red)';
    return `<div class='metric-row' data-action='edit-metric' data-key='${escapeHtml(metric.key)}' role='button' tabindex='0' title='Update this metric'>
      <div class='metric-name'><strong>${escapeHtml(metric.label)}</strong><span>${escapeHtml(metric.source)} · ${metric.verified ? 'verified' : 'unverified'}</span></div>
      <div class='metric-bar'><i style='--value:${Math.max(3, score * 100)}%;--accent:${tone}'></i></div>
      <div class='metric-value' style='color:${tone}'>${formatMetric(metric)}</div>
      <div class='metric-target'>Target ${metric.direction === 'max' ? '≤' : '≥'} ${formatMetric(metric, true)}</div>
      <div class='metric-sample'>n=${number(metric.sample_size)}</div>
    </div>`;
  }).join('');
  const points = data.metrics.slice(0, 7).map((metric, index) => `${20 + index * 62},${95 - metricScore(metric) * 68}`).join(' ');

  return `<div class='page'>
    ${pageHero('EVALUATION LAB', 'Test the system, not the demo.', `Representative tasks, explicit thresholds and reproducible runs turn model performance into workflow evidence for <strong>${escapeHtml(useCase.name)}</strong>.`, `<button class='button ghost' data-action='open-metric'>＋ Record metric</button><button class='button primary' data-action='run-gate'>▶ Run evaluation</button>`)}
    <section class='grid cols-3'>
      <article class='lab-run' style='grid-column:span 2'>
        <header><div><div class='mini-label' style='color:#ff9c64'>LATEST LIVE ASSESSMENT</div><h3>${escapeHtml(useCase.name)} · representative workflow suite</h3><p>Quality, reliability, safety and operating-cost thresholds evaluated together.</p></div>${badge(result.blockers.length ? 'Blocked' : 'Complete', result.blockers.length ? 'red' : 'green')}</header>
        <div class='run-grid'><div><span>REPRESENTATIVE TASKS</span><strong>${number(Math.max(...data.metrics.map(item => item.sample_size)))}</strong></div><div><span>METRICS AT TARGET</span><strong>${data.metrics.filter(item => metricScore(item) >= 1).length}/${data.metrics.length}</strong></div><div><span>HARD BLOCKERS</span><strong>${result.blockers.length}</strong></div></div>
      </article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Evaluation profile</h3><p>Normalized threshold attainment.</p></div>${badge(`${result.pillars.quality}% quality`, result.pillars.quality >= 85 ? 'green' : 'amber')}</div>
        <svg class='sparkline' viewBox='0 0 410 110' preserveAspectRatio='none' aria-label='Metric threshold profile'>
          <defs><linearGradient id='sparkGradient' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ff681e' stop-opacity='.25'/><stop offset='1' stop-color='#ff681e' stop-opacity='0'/></linearGradient></defs>
          <line class='grid-line' x1='0' y1='25' x2='410' y2='25'/><line class='grid-line' x1='0' y1='60' x2='410' y2='60'/><line class='grid-line' x1='0' y1='95' x2='410' y2='95'/>
          <polygon class='area' points='${points} 392,105 20,105'/><polyline points='${points}'/>
        </svg>
      </article>
    </section>

    <article class='panel panel-pad mt-14'>
      <div class='panel-head'><div><h2>Metric contract</h2><p>Click any metric to update its measured value, sample, source and verification state.</p></div><span class='mini-label'>VALUE · TARGET · SAMPLE</span></div>
      <div class='metric-list'>${metricRows}</div>
    </article>

    <section class='grid cols-2 mt-14'>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Failure taxonomy</h3><p>Failures are classified by business consequence, not only model behavior.</p></div>${badge(`${result.blockers.length + result.warnings.length} open`, result.blockers.length ? 'red' : result.warnings.length ? 'amber' : 'green')}</div>
        <div class='timeline'>
          ${[...result.blockers, ...result.warnings].slice(0, 5).map((item, index) => `<div class='timeline-item'><i style='--accent:${item.severity === 'critical' ? 'var(--red)' : 'var(--amber)'};--bg:${item.severity === 'critical' ? 'var(--red-soft)' : 'var(--amber-soft)'}'>${item.severity === 'critical' ? '!' : index + 1}</i><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div><time>${escapeHtml(item.domain)}</time></div>`).join('') || `<div class='timeline-item'><i style='--accent:var(--green);--bg:var(--green-soft)'>✓</i><div><strong>No unresolved evaluation issue</strong><p>All declared thresholds are currently satisfied.</p></div><time>Clear</time></div>`}
        </div>
      </article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Sealed evaluation runs</h3><p>Historical decisions are append-only in the local audit trail.</p></div><button class='button small' data-action='run-gate'>Run now</button></div>
        <div class='table-wrap'><table><thead><tr><th>Run</th><th>Decision</th><th>Confidence</th><th>Quality</th><th>ROI</th><th>Date</th></tr></thead><tbody>
          ${history.length ? history.map(item => `<tr><td>#${item.id}</td><td>${badge(decisionMeta(item.decision).short, decisionMeta(item.decision).tone)}</td><td>${item.confidence}%</td><td>${item.quality_score}%</td><td>${item.first_year_roi}%</td><td>${dateLabel(item.created_at)}</td></tr>`).join('') : `<tr><td colspan='6' style='text-align:center;color:var(--muted);padding:25px'>No sealed run yet. The live assessment has not been written to history.</td></tr>`}
        </tbody></table></div>
      </article>
    </section>
  </div>`;
}

function scenarioEconomics(data, scenario) {
  const metrics = Object.fromEntries(data.metrics.map(item => [item.key, item]));
  const useCase = data.use_case;
  const targetUsers = Number(scenario.target_users);
  const adoption = Number(scenario.adoption);
  const reviewRate = Number(scenario.human_review_rate);
  const monthlyTasks = targetUsers * Number(useCase.tasks_per_user_month);
  const minutesSaved = Math.max(0, Number(useCase.baseline_minutes) - Number(useCase.treatment_minutes));
  const grossHours = monthlyTasks * minutesSaved / 60 * 12;
  const attributableHours = grossHours * adoption * Number(useCase.attribution);
  const capacityValue = attributableHours * Number(useCase.labor_cost_hour);
  const revenue = Number(useCase.revenue_uplift) * adoption * Number(useCase.attribution);
  const risk = Number(useCase.risk_avoidance) * Number(useCase.attribution);
  const benefit = capacityValue + revenue + risk;
  const inference = monthlyTasks * Number(metrics.cost_per_task?.value || 0) * 12;
  const review = monthlyTasks * reviewRate * Number(useCase.review_minutes) / 60 * Number(useCase.labor_cost_hour) * 12;
  const runCost = Number(useCase.annual_platform_cost) + inference + review;
  const firstYearCost = Number(useCase.setup_cost) + runCost;
  const net = benefit - firstYearCost;
  return {
    targetUsers, adoption, reviewRate, monthlyTasks, grossHours, attributableHours, capacityValue, revenue,
    risk, benefit, inference, review, runCost, firstYearCost, net,
    roi: firstYearCost > 0 ? net / firstYearCost * 100 : 0,
    costPerSuccessfulTask: monthlyTasks > 0 ? runCost / 12 / (monthlyTasks * Math.max(.01, Number(metrics.task_success?.value || .01))) : 0
  };
}

function renderValue() {
  const useCase = currentCase();
  const data = contract();
  if (!app.scenario) app.scenario = {
    target_users: useCase.target_users,
    adoption: useCase.adoption,
    human_review_rate: useCase.human_review_rate
  };
  const model = scenarioEconomics(data, app.scenario);
  const maxFlow = Math.max(model.benefit, model.firstYearCost, Math.abs(model.net), 1);
  const flows = [
    ['Capacity', model.capacityValue, '#ff681e'], ['Revenue', model.revenue, '#6650e5'], ['Risk avoided', model.risk, '#2d66d2'],
    ['Platform + AI', -(Number(useCase.annual_platform_cost) + model.inference), '#c94035'], ['Human review', -model.review, '#c77a04'], ['Net year 1', model.net, model.net >= 0 ? '#198754' : '#c94035']
  ];

  return `<div class='page'>
    ${pageHero('VALUE & SCALE', 'Model the operating system, not just the upside.', `Every scenario includes adoption, attribution, inference, platform cost and human-review burden. Assumptions remain visibly separate from observed evidence.`, `<button class='button ghost' data-action='reset-scenario'>Reset</button><button class='button primary' data-action='save-scenario'>Save scenario</button>`)}
    <section class='scenario-shell'>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h2>Scale scenario</h2><p>Test controlled expansion before changing the evidence contract.</p></div>${badge('Assumption layer', 'purple')}</div>
        <div class='slider-stack'>
          <div class='slider-field'><header><label for='usersSlider'>Target users</label><output>${number(model.targetUsers)}</output></header><input id='usersSlider' type='range' min='10' max='1000' step='10' value='${model.targetUsers}' data-scenario='target_users'></div>
          <div class='slider-field'><header><label for='adoptionSlider'>Sustained adoption</label><output>${percent(model.adoption * 100)}</output></header><input id='adoptionSlider' type='range' min='10' max='95' step='1' value='${model.adoption * 100}' data-scenario='adoption'></div>
          <div class='slider-field'><header><label for='reviewSlider'>Human review rate</label><output>${percent(model.reviewRate * 100)}</output></header><input id='reviewSlider' type='range' min='0' max='100' step='1' value='${model.reviewRate * 100}' data-scenario='human_review_rate'></div>
        </div>
        <div class='scenario-note'><strong>Scenario discipline.</strong> Moving a slider never changes published evidence. Save explicitly to update the use-case assumptions, then rerun the gate.</div>
      </article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h2>Fully loaded economics</h2><p>Attributable benefit after the real cost of operating at scale.</p></div>${badge(model.roi >= 25 ? 'Value gate met' : 'Below threshold', model.roi >= 25 ? 'green' : 'amber')}</div>
        <div class='economics-grid'>
          <div class='economic-card'><span>ANNUAL BENEFIT</span><strong>${currency(model.benefit, true)}</strong><small>${number(model.attributableHours)} attributable hours</small></div>
          <div class='economic-card'><span>FIRST-YEAR COST</span><strong>${currency(model.firstYearCost, true)}</strong><small>Setup + operation + review</small></div>
          <div class='economic-card'><span>FIRST-YEAR NET</span><strong class='${model.net >= 0 ? 'text-green' : 'text-red'}'>${currency(model.net, true)}</strong><small>${percent(model.roi, 1)} ROI</small></div>
          <div class='economic-card'><span>HUMAN REVIEW</span><strong>${currency(model.review, true)}</strong><small>${percent(model.reviewRate * 100)} of tasks</small></div>
          <div class='economic-card'><span>AI RUN COST</span><strong>${currency(model.inference, true)}</strong><small>${currency(model.costPerSuccessfulTask)} / successful task</small></div>
          <div class='economic-card'><span>MONTHLY VOLUME</span><strong>${number(model.monthlyTasks)}</strong><small>workflow tasks at target scale</small></div>
        </div>
      </article>
    </section>

    <section class='grid cols-2 mt-14'>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Value bridge · first year</h3><p>Benefits above zero, operating and launch costs below.</p></div><span class='mini-label'>FULLY LOADED</span></div>
        <div class='waterfall'>${flows.map(([label, value, color]) => `<div class='waterfall-item'><strong class='${value >= 0 ? '' : 'text-red'}'>${currency(value, true)}</strong><i style='--height:${Math.max(4, Math.abs(value) / maxFlow * 115)}px;--accent:${color}'></i><span>${label}</span></div>`).join('')}</div>
      </article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h3>Scale sensitivity</h3><p>Which assumptions matter most to the capital decision?</p></div>${badge(`${percent(model.roi, 1)} ROI`, model.roi >= 25 ? 'green' : 'amber')}</div>
        <div class='timeline'>
          <div class='timeline-item'><i style='--accent:var(--green);--bg:var(--green-soft)'>↗</i><div><strong>Adoption is the primary value multiplier</strong><p>Only sustained workflow usage converts available capacity into attributable benefit.</p></div><time>${percent(model.adoption * 100)}</time></div>
          <div class='timeline-item'><i style='--accent:var(--amber);--bg:var(--amber-soft)'>⌁</i><div><strong>Review burden remains visible</strong><p>Human assurance is an operating cost, not a hidden implementation detail.</p></div><time>${currency(model.review, true)}</time></div>
          <div class='timeline-item'><i style='--accent:var(--purple);--bg:var(--purple-soft)'>◇</i><div><strong>Attribution is deliberately conservative</strong><p>SCALE GATE credits only the share plausibly caused by the AI-enabled workflow.</p></div><time>${percent(useCase.attribution * 100)}</time></div>
          <div class='timeline-item'><i style='--accent:var(--blue);--bg:var(--blue-soft)'>◎</i><div><strong>Target authority stays bounded</strong><p>Financial upside cannot increase autonomy while a hard control remains unresolved.</p></div><time>L${useCase.autonomy_level}</time></div>
        </div>
      </article>
    </section>
  </div>`;
}

function renderControls() {
  const useCase = currentCase();
  const data = contract();
  const result = assessment();
  const levels = [
    ['L0', 'Observe', 'No generated output enters the workflow.'],
    ['L1', 'Advise', 'AI proposes; a human performs the action.'],
    ['L2', 'Assist', 'AI executes bounded steps with approval.'],
    ['L3', 'Act', 'AI acts within policy and sampled review.'],
    ['L4', 'Autonomous', 'AI operates end-to-end with exception oversight.']
  ];
  const symbols = { pass: '✓', fail: '!', missing: '?' };
  const colors = { pass: ['var(--green)', 'var(--green-soft)'], fail: ['var(--red)', 'var(--red-soft)'], missing: ['var(--amber)', 'var(--amber-soft)'] };

  return `<div class='page'>
    ${pageHero('CONTROLS & AUTONOMY', 'Authority must be earned by evidence.', `The autonomy ceiling for <strong>${escapeHtml(useCase.name)}</strong> is explicit, reversible and bounded by mandatory controls.`, `<button class='button primary' data-action='run-gate'>Re-test control gate</button>`)}
    <article class='panel panel-pad'>
      <div class='panel-head'><div><h2>Autonomy ladder</h2><p>Current permission is not a maturity badge. It is a revocable operating boundary.</p></div>${badge(`Current ceiling L${useCase.autonomy_level}`, 'purple')}</div>
      <div class='autonomy-scale'>${levels.map((level, index) => `<div class='autonomy-step ${index <= useCase.autonomy_level ? 'active' : ''} ${index === useCase.autonomy_level ? 'current' : ''}'><b>${level[0]}</b><strong>${level[1]}</strong><span>${level[2]}</span></div>`).join('')}</div>
    </article>

    <section class='grid cols-3 mt-14'>
      <article class='kpi-card'><span>MANDATORY CONTROLS</span><strong>${result.control_assessment.passed}/${result.control_assessment.total}</strong><small>Weighted by severity</small><em>${result.pillars.controls}% control score</em></article>
      <article class='kpi-card'><span>FAILED / MISSING</span><strong class='${result.control_assessment.failed + result.control_assessment.missing ? 'text-red' : 'text-green'}'>${result.control_assessment.failed + result.control_assessment.missing}</strong><small>${result.control_assessment.failed} failed · ${result.control_assessment.missing} missing</small><em>Critical items block scale</em></article>
      <article class='kpi-card'><span>RISK CLASS</span><strong>${escapeHtml(useCase.risk_tier).toUpperCase()}</strong><small>Declared by the use-case owner</small><em>Reassess after material change</em></article>
    </section>

    <article class='panel panel-pad mt-14'>
      <div class='panel-head'><div><h2>Control register</h2><p>Status, accountability, evidence and framework crosswalk in one place.</p></div><span class='mini-label'>HARD GATES OVERRIDE ROI</span></div>
      <div class='control-list'>
        ${data.controls.map(control => {
          const palette = colors[control.status] || colors.missing;
          const action = control.key === 'privacy-redaction' ? 'resolve-privacy' : 'set-control-pass';
          return `<article class='control-card'>
            <i style='--accent:${palette[0]};--bg:${palette[1]}'>${symbols[control.status] || '?'}</i>
            <div><h3>${escapeHtml(control.title)}</h3><p>${escapeHtml(control.description || control.evidence || 'Evidence is still required.')}</p></div>
            <div class='control-meta'><span>${escapeHtml(control.domain)} · ${escapeHtml(control.severity)}</span><strong>${escapeHtml(control.owner || 'Unassigned')}</strong><span>${escapeHtml(control.framework_ref)}</span></div>
            <div class='control-actions'>${control.status === 'pass' ? badge('Passed', 'green') : `<button class='button ${control.status === 'fail' ? 'danger' : ''} small' data-action='${action}' data-id='${control.id}'>Mark resolved</button>`}</div>
          </article>`;
        }).join('')}
      </div>
    </article>
  </div>`;
}

function renderPack() {
  const useCase = currentCase();
  const result = assessment();
  const meta = decisionMeta(result.decision);
  const e = result.economics;
  return `<div class='page'>
    ${pageHero('DECISION PACK', 'A decision that can survive scrutiny.', 'Export the rationale, thresholds, economics, blockers and validity window as a portable governance record.', `<button class='button ghost' data-action='download-contract'>Download SCALE-1</button><button class='button primary' data-action='print-pack'>Print decision pack</button>`)}
    <article class='document-shell'>
      <header class='document-cover'>
        <div class='doc-brand'>SCALE GATE · SCALE-1 EVIDENCE CONTRACT</div>
        <h2>${escapeHtml(useCase.name)}</h2>
        <p>${escapeHtml(useCase.business_outcome)}</p>
        <div class='document-decision'><strong style='color:${meta.color}'>${escapeHtml(meta.label)}</strong><span>Evidence confidence ${result.confidence}% · Valid until ${dateLabel(result.valid_until)}</span></div>
      </header>
      <div class='document-body'>
        <div class='doc-meta'>
          <div><span>OWNER</span><strong>${escapeHtml(useCase.owner)}</strong></div>
          <div><span>DEPARTMENT</span><strong>${escapeHtml(useCase.department)}</strong></div>
          <div><span>RISK / AUTONOMY</span><strong>${escapeHtml(useCase.risk_tier)} · L${useCase.autonomy_level}</strong></div>
          <div><span>EVALUATED</span><strong>${dateLabel(result.evaluated_at)}</strong></div>
        </div>
        <section class='doc-section'><h3>Executive decision</h3><p><strong>${escapeHtml(result.decision_copy)}</strong> ${escapeHtml(result.policy)}</p></section>
        <section class='doc-section'><h3>Decision pillars</h3><div class='gate-matrix'>
          ${gateCell('Quality', result.pillars.quality, '#ff681e', 'Workflow performance')}
          ${gateCell('Value', result.pillars.value, '#198754', 'Fully loaded economics')}
          ${gateCell('Controls', result.pillars.controls, '#c94035', 'Mandatory safeguards')}
          ${gateCell('Adoption', result.pillars.adoption, '#2d66d2', 'Sustained use')}
          ${gateCell('Evidence', result.pillars.evidence, '#6650e5', 'Decision confidence')}
        </div></section>
        <section class='doc-section'><h3>Scale economics</h3><div class='doc-meta'>
          <div><span>ANNUAL BENEFIT</span><strong>${currency(e.annual_benefit, true)}</strong></div>
          <div><span>FIRST-YEAR COST</span><strong>${currency(e.first_year_cost, true)}</strong></div>
          <div><span>FIRST-YEAR NET</span><strong>${currency(e.first_year_net, true)}</strong></div>
          <div><span>FIRST-YEAR ROI</span><strong>${percent(e.first_year_roi, 1)}</strong></div>
        </div></section>
        <section class='doc-section'><h3>Hard blockers</h3>${result.blockers.length ? `<ul>${result.blockers.map(item => `<li><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.detail)}</li>`).join('')}</ul>` : '<p>No hard blocker detected at the time of evaluation.</p>'}</section>
        <section class='doc-section'><h3>Scale conditions</h3>${result.conditions.length ? `<ul>${result.conditions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No additional scale condition. Continuous monitoring and re-gating still apply.</p>'}</section>
        <section class='doc-section'><h3>Approval boundary</h3><p>This pack supports an accountable scale decision. It is not a certification or legal opinion. A material change in model, data, workflow, population, cost or autonomy invalidates the decision and triggers a new gate.</p></section>
        <div class='doc-signoff'><div><span>BUSINESS OWNER</span><strong>${escapeHtml(useCase.owner)}</strong></div><div><span>RISK / GOVERNANCE</span><strong>Review required</strong></div><div><span>FINANCE</span><strong>Review required</strong></div></div>
      </div>
    </article>
  </div>`;
}

function highlightedContract(data) {
  const sample = {
    scale1_version: data.scale1_version,
    use_case: {
      slug: data.use_case.slug,
      owner: data.use_case.owner,
      business_outcome: data.use_case.business_outcome,
      risk_tier: data.use_case.risk_tier,
      autonomy_level: data.use_case.autonomy_level
    },
    decision_policy: {
      hard_blockers_override_score: true,
      required_decisions: ['REJECT', 'REPAIR', 'CONDITIONAL_SCALE', 'SCALE', 'RETIRE']
    }
  };
  return escapeHtml(JSON.stringify(sample, null, 2))
    .replace(/(&quot;[^&]+&quot;)(?=:)/g, '<span class="token-key">$1</span>')
    .replace(/: (&quot;.*?&quot;)/g, ': <span class="token-string">$1</span>')
    .replace(/: (\d+(?:\.\d+)?)/g, ': <span class="token-number">$1</span>');
}

function renderProtocol() {
  const data = contract();
  return `<div class='page'>
    ${pageHero('OPEN EVIDENCE STANDARD', 'SCALE-1 turns assurance into a portable contract.', 'A human-readable and machine-checkable format links workflow intent, evidence, controls, economics and the authority granted to an AI system.', `<button class='button ghost' data-action='copy-cli'>Copy CLI command</button><button class='button primary' data-action='download-contract'>Download contract</button>`)}
    <section class='protocol-hero'>
      <article class='code-panel'><header><strong>${escapeHtml(data.use_case.slug)}.scale.json</strong><span>SCALE-1 v${escapeHtml(data.scale1_version)}</span></header><pre><code>${highlightedContract(data)}</code></pre></article>
      <article class='panel panel-pad'>
        <div class='panel-head'><div><h2>Protocol principles</h2><p>The standard is designed to keep a decision reproducible as systems change.</p></div>${badge('Open format', 'purple')}</div>
        <div class='protocol-principles'>
          <div class='principle'><b>01</b><div><strong>Workflow before model</strong><p>Evaluate an end-to-end business task, not a benchmark detached from operations.</p></div></div>
          <div class='principle'><b>02</b><div><strong>Hard gates before averages</strong><p>Critical privacy, safety or accountability failures cannot be offset by ROI.</p></div></div>
          <div class='principle'><b>03</b><div><strong>Fully loaded economics</strong><p>Inference, platform, setup and human assurance all remain visible.</p></div></div>
          <div class='principle'><b>04</b><div><strong>Evidence expires</strong><p>Material changes and stale proof trigger re-evaluation instead of permanent approval.</p></div></div>
        </div>
      </article>
    </section>

    <section class='grid cols-3 mt-14'>
      <article class='panel panel-pad'><div class='mini-label'>01 · DECLARE</div><h3>Describe the decision boundary</h3><p style='color:var(--muted);font-size:9px;line-height:1.5'>Owner, outcome, workflow, risk tier, population, autonomy and explicit stop conditions.</p></article>
      <article class='panel panel-pad'><div class='mini-label'>02 · CHECK</div><h3>Run the local gate</h3><div class='code-panel' style='margin-top:10px;padding:10px;border-radius:10px'><code>node cli.js check contract.scale.json</code></div></article>
      <article class='panel panel-pad'><div class='mini-label'>03 · SEAL</div><h3>Export a decision pack</h3><p style='color:var(--muted);font-size:9px;line-height:1.5'>Preserve evidence, blockers, conditions, validity and audit provenance with the decision.</p></article>
    </section>

    <article class='panel panel-pad mt-14'>
      <div class='panel-head'><div><h2>Contract coverage</h2><p>The current use case is already expressed as a complete SCALE-1 evidence package.</p></div>${badge('Machine-checkable', 'green')}</div>
      <div class='kpi-grid' style='margin-top:0'>
        <div class='kpi-card'><span>METRICS</span><strong>${data.metrics.length}</strong><small>Quality, reliability, cost and risk</small></div>
        <div class='kpi-card'><span>CONTROLS</span><strong>${data.controls.length}</strong><small>Mandatory and accountable</small></div>
        <div class='kpi-card'><span>EVIDENCE ITEMS</span><strong>${data.evidence.length}</strong><small>Verified, dated and expiring</small></div>
        <div class='kpi-card'><span>PROTOCOL VERSION</span><strong>1.0</strong><small>JSON Schema included in repository</small></div>
        <div class='kpi-card'><span>EXECUTION MODE</span><strong>LOCAL</strong><small>No evidence leaves the machine</small></div>
      </div>
    </article>
  </div>`;
}

function renderCurrentView() {
  const renderers = {
    decision: renderDecision,
    evidence: renderEvidence,
    evaluation: renderEvaluation,
    value: renderValue,
    controls: renderControls,
    pack: renderPack,
    protocol: renderProtocol
  };
  const renderer = renderers[app.view] || renderDecision;
  $('#view').innerHTML = renderer();
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === app.view));
  $('#currentLabel').textContent = viewLabels[app.view] || viewLabels.decision;
  updateHeader();
}

function updateHeader() {
  const picker = $('#casePicker');
  picker.innerHTML = app.state.use_cases.map(item => `<option value='${item.id}' ${Number(item.id) === Number(app.selectedId) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  const result = assessment();
  const meta = decisionMeta(result.decision);
  $('#liveDecision').textContent = meta.short;
  $('#liveDecision').style.color = meta.color;
  $('#liveEvidence').textContent = `${result.confidence}%`;
  $('#liveRoi').textContent = `${result.economics.first_year_roi}%`;
  $('#liveBlockers').textContent = String(result.blockers.length);
  $('#liveBlockers').style.color = result.blockers.length ? 'var(--red)' : 'var(--green)';
}

function navigate(view, push = true) {
  if (!viewLabels[view]) view = 'decision';
  app.view = view;
  if (push) history.pushState({}, '', `#${view}`);
  $('#sidebar').classList.remove('open');
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(title, subtitle, body, footer, eyebrow = 'SCALE GATE') {
  $('#modalEyebrow').textContent = eyebrow;
  $('#modalTitle').textContent = title;
  $('#modalSubtitle').textContent = subtitle || '';
  $('#modalBody').innerHTML = body;
  $('#modalFooter').innerHTML = footer || `<button class='button' data-action='close-modal'>Close</button>`;
  $('#modalBackdrop').hidden = false;
  setTimeout(() => $('#modalBackdrop input, #modalBackdrop select, #modalBackdrop button')?.focus(), 30);
}

function closeModal() {
  $('#modalBackdrop').hidden = true;
}

function formObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  $$('input[type="checkbox"]', form).forEach(input => { data[input.name] = input.checked; });
  return data;
}

function openMetricEditor(key) {
  const metrics = contract().metrics;
  const metric = metrics.find(item => item.key === key) || metrics[0];
  if (!metric) return;
  openModal(
    'Record evaluation evidence',
    'The decision will be recalculated from the saved observation.',
    `<form id='metricForm' class='form-grid'>
      <input type='hidden' name='key' value='${escapeHtml(metric.key)}'>
      <div class='field full'><label>Metric</label><input name='label' value='${escapeHtml(metric.label)}' required></div>
      <div class='field'><label>Observed value</label><input name='value' type='number' step='0.001' value='${metric.value}' required></div>
      <div class='field'><label>Decision threshold</label><input name='target' type='number' step='0.001' value='${metric.target}' required></div>
      <div class='field'><label>Direction</label><select name='direction'><option value='min' ${metric.direction === 'min' ? 'selected' : ''}>At least (≥)</option><option value='max' ${metric.direction === 'max' ? 'selected' : ''}>At most (≤)</option></select></div>
      <div class='field'><label>Unit</label><select name='unit'><option ${metric.unit === 'ratio' ? 'selected' : ''}>ratio</option><option ${metric.unit === 'EUR' ? 'selected' : ''}>EUR</option><option ${metric.unit === 'seconds' ? 'selected' : ''}>seconds</option><option ${metric.unit === 'count' ? 'selected' : ''}>count</option></select></div>
      <div class='field'><label>Representative sample</label><input name='sample_size' type='number' min='0' value='${metric.sample_size}'></div>
      <div class='field'><label>Category</label><input name='category' value='${escapeHtml(metric.category)}'></div>
      <div class='field full'><label>Source / method</label><input name='source' value='${escapeHtml(metric.source)}' required></div>
      <div class='field full'><label style='display:flex;align-items:center;gap:8px'><input name='verified' type='checkbox' ${metric.verified ? 'checked' : ''} style='width:auto;min-height:auto'> Source and method independently verified</label></div>
    </form>`,
    `<button class='button' data-action='close-modal'>Cancel</button><button class='button primary' data-action='submit-metric'>Save evidence</button>`,
    'EVALUATION LAB'
  );
}

function openNewUseCase() {
  openModal(
    'Create an AI use case',
    'Start with the decision boundary. SCALE GATE will create the default evidence and control obligations.',
    `<form id='useCaseForm' class='form-grid'>
      <div class='field full'><label>Use-case name</label><input name='name' placeholder='e.g. Claims Review Copilot' required></div>
      <div class='field'><label>Business owner</label><input name='owner' placeholder='Named accountable person' required></div>
      <div class='field'><label>Department</label><input name='department' placeholder='e.g. Operations' required></div>
      <div class='field full'><label>Measurable business outcome</label><textarea name='business_outcome' placeholder='What must measurably improve, without weakening quality or control?' required></textarea></div>
      <div class='field'><label>Risk tier</label><select name='risk_tier'><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select></div>
      <div class='field'><label>Pilot users</label><input name='pilot_users' type='number' min='1' value='20'></div>
      <div class='field'><label>Target users</label><input name='target_users' type='number' min='1' value='150'></div>
      <div class='field'><label>Sustained adoption estimate (%)</label><input name='adoption' type='number' min='0' max='100' value='35'></div>
      <div class='field'><label>Baseline minutes / task</label><input name='baseline_minutes' type='number' step='0.1' min='0' value='30'></div>
      <div class='field'><label>AI-enabled minutes / task</label><input name='treatment_minutes' type='number' step='0.1' min='0' value='20'></div>
    </form>`,
    `<button class='button' data-action='close-modal'>Cancel</button><button class='button primary' data-action='submit-use-case'>Create evidence contract</button>`,
    'NEW SCALE-1 CONTRACT'
  );
}

function toast(message, tone = 'success') {
  const element = document.createElement('div');
  element.className = 'toast';
  if (tone === 'error') {
    element.style.borderColor = '#efb4ad';
    element.style.background = 'var(--red-soft)';
  }
  element.innerHTML = `<i style='background:${tone === 'error' ? 'var(--red)' : 'var(--green)'}'>${tone === 'error' ? '!' : '✓'}</i><span>${escapeHtml(message)}</span><button aria-label='Dismiss'>×</button>`;
  element.querySelector('button').addEventListener('click', () => element.remove());
  $('#toastStack').append(element);
  setTimeout(() => element.remove(), 4800);
}

async function runGate() {
  const result = await api(`/api/use-cases/${app.selectedId}/evaluate`, { method: 'POST', body: '{}' });
  app.state = result.state;
  renderCurrentView();
  toast(`Decision sealed: ${decisionMeta(result.evaluation.decision).label}.`);
}

async function submitMetric() {
  const form = $('#metricForm');
  if (!form.reportValidity()) return;
  const body = formObject(form);
  ['value', 'target', 'sample_size'].forEach(key => { body[key] = Number(body[key]); });
  const result = await api(`/api/use-cases/${app.selectedId}/metrics`, { method: 'POST', body: JSON.stringify(body) });
  app.state = result.state;
  closeModal();
  renderCurrentView();
  toast('Metric evidence saved. The live gate has been recalculated.');
}

async function submitUseCase() {
  const form = $('#useCaseForm');
  if (!form.reportValidity()) return;
  const body = formObject(form);
  ['pilot_users', 'target_users', 'baseline_minutes', 'treatment_minutes'].forEach(key => { body[key] = Number(body[key]); });
  body.adoption = Number(body.adoption) / 100;
  const result = await api('/api/use-cases', { method: 'POST', body: JSON.stringify(body) });
  app.state = result.state;
  app.selectedId = result.use_case.id;
  app.scenario = null;
  closeModal();
  navigate('decision');
  toast('Use case created with a new SCALE-1 evidence contract.');
}

async function setControlPassed(id) {
  const result = await api(`/api/controls/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'pass', evidence: 'Control evidence reviewed and marked resolved by the demo operator.' })
  });
  app.state = result.state;
  renderCurrentView();
  toast('Control marked resolved. Run the scale gate to seal a new decision.');
}

async function resolvePrivacy() {
  const privacy = contract().controls.find(item => item.key === 'privacy-redaction');
  const incident = contract().metrics.find(item => item.key === 'pii_incidents');
  if (privacy) {
    await api(`/api/controls/${privacy.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pass', evidence: 'Redaction policy strengthened; adversarial regression suite passed with zero confirmed reproductions.' })
    });
  }
  if (incident) {
    const metricResult = await api(`/api/use-cases/${app.selectedId}/metrics`, {
      method: 'POST',
      body: JSON.stringify({
        ...incident,
        value: 0,
        sample_size: Math.max(300, Number(incident.sample_size) || 0),
        verified: true,
        source: 'Post-remediation privacy regression suite',
        measured_at: new Date().toISOString().slice(0, 10)
      })
    });
    app.state = metricResult.state;
  }
  const sealed = await api(`/api/use-cases/${app.selectedId}/evaluate`, { method: 'POST', body: '{}' });
  app.state = sealed.state;
  renderCurrentView();
  toast(`Privacy finding resolved. New decision: ${decisionMeta(sealed.evaluation.decision).label}.`);
}

async function saveScenario() {
  const body = {
    target_users: Number(app.scenario.target_users),
    adoption: Number(app.scenario.adoption),
    human_review_rate: Number(app.scenario.human_review_rate)
  };
  const result = await api(`/api/use-cases/${app.selectedId}`, { method: 'PATCH', body: JSON.stringify(body) });
  app.state = result.state;
  app.scenario = null;
  renderCurrentView();
  toast('Scale assumptions saved. Run the gate to seal a new decision.');
}

function download(path) {
  const anchor = document.createElement('a');
  anchor.href = path;
  anchor.download = '';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Command copied to the clipboard.');
  } catch {
    openModal('Copy command', 'Clipboard access is unavailable in this context.', `<div class='code-panel'><code>${escapeHtml(text)}</code></div>`);
  }
}

async function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === 'navigate') navigate(target.dataset.view);
    else if (action === 'run-gate') await runGate();
    else if (action === 'new-use-case') openNewUseCase();
    else if (action === 'open-metric') openMetricEditor(contract().metrics[0]?.key);
    else if (action === 'edit-metric') openMetricEditor(target.dataset.key);
    else if (action === 'submit-metric') await submitMetric();
    else if (action === 'submit-use-case') await submitUseCase();
    else if (action === 'close-modal') closeModal();
    else if (action === 'resolve-privacy') await resolvePrivacy();
    else if (action === 'set-control-pass') await setControlPassed(target.dataset.id);
    else if (action === 'reset-scenario') { app.scenario = null; renderCurrentView(); }
    else if (action === 'save-scenario') await saveScenario();
    else if (action === 'export-pack') download(`/api/use-cases/${app.selectedId}/decision-pack`);
    else if (action === 'download-contract') download(`/api/use-cases/${app.selectedId}/export`);
    else if (action === 'print-pack') { if (app.view !== 'pack') navigate('pack'); setTimeout(() => window.print(), 180); }
    else if (action === 'copy-cli') await copyText(`node cli.js check contracts/examples/${currentCase().slug}.scale.json`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'The requested action failed.', 'error');
  }
}

function tickClock() {
  $('#liveClock').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
}

function registerPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    app.installPrompt = event;
  });
}

async function init() {
  $('#view').innerHTML = `<div class='loading-screen'><div><div class='loader'></div><strong>Reconstructing the evidence chain…</strong><p style='color:var(--muted);font-size:10px'>Quality · Value · Controls · Adoption · Evidence</p></div></div>`;
  tickClock();
  setInterval(tickClock, 1000);
  document.addEventListener('click', handleAction);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Enter' && event.target.matches('[data-action="edit-metric"]')) handleAction(event);
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      const index = Number(event.key) - 1;
      const keys = Object.keys(viewLabels);
      if (index >= 0 && index < keys.length) navigate(keys[index]);
    }
  });
  document.addEventListener('input', event => {
    const field = event.target.closest('[data-scenario]');
    if (!field) return;
    const key = field.dataset.scenario;
    const raw = Number(field.value);
    app.scenario[key] = ['adoption', 'human_review_rate'].includes(key) ? raw / 100 : raw;
    renderCurrentView();
  });
  $('#casePicker').addEventListener('change', event => {
    app.selectedId = Number(event.target.value);
    app.scenario = null;
    renderCurrentView();
  });
  $('#modalBackdrop').addEventListener('click', event => { if (event.target === $('#modalBackdrop')) closeModal(); });
  $('#openSidebar').addEventListener('click', () => $('#sidebar').classList.add('open'));
  $('#closeSidebar').addEventListener('click', () => $('#sidebar').classList.remove('open'));
  $$('.nav-item').forEach(item => item.addEventListener('click', () => navigate(item.dataset.view)));
  window.addEventListener('popstate', () => navigate(location.hash.slice(1) || 'decision', false));
  registerPwa();
  try {
    app.state = await api('/api/state');
    app.selectedId = app.state.use_cases[0]?.id;
    if (!app.selectedId) throw new Error('No use case is available.');
    app.view = viewLabels[location.hash.slice(1)] ? location.hash.slice(1) : 'decision';
    renderCurrentView();
  } catch (error) {
    $('#view').innerHTML = `<div class='empty-state'><div><i>!</i><h2>SCALE GATE could not start</h2><p>${escapeHtml(error.message)}</p><button class='button primary' onclick='location.reload()'>Retry</button></div></div>`;
  }
}

init();
