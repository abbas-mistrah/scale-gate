#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateContract, evaluateContract, evaluateRegate, REGATE_TRIGGERS, parseIsoDate } = require('./src/engine');

function usage() {
  console.log(`SCALE GATE CLI

Usage:
  scale-gate check <contract.scale.json> [--json]
  scale-gate explain <contract.scale.json>
  scale-gate regate <contract.scale.json> [--model <id>] [--trigger <kind>] [--as-of <YYYY-MM-DD>] [--json]
  scale-gate regate <baseline.scale.json> <candidate.scale.json> [--model <id>] [--trigger <kind>] [--as-of <YYYY-MM-DD>] [--json]

Re-gate triggers:
  ${REGATE_TRIGGERS.join(', ')}

Exit codes:
  0  contract is valid and decision is SCALE or CONDITIONAL_SCALE (or re-gate status is PASS)
  1  contract is invalid, REJECT, REPAIR, RETIRE or REGATE_REQUIRED
`);
}

function readContract(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${absolute}`);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(`Not valid JSON: ${absolute} (${error.message})`);
  }
}

function concise(result) {
  const lines = [
    `Decision: ${result.decision}`,
    `Evidence confidence: ${result.confidence}%`,
    `First-year ROI: ${result.economics.first_year_roi}%`,
    `Hard blockers: ${result.blockers.length}`,
    `Warnings: ${result.warnings.length}`,
    `Valid until: ${result.valid_until}`
  ];
  if (result.blockers.length) {
    lines.push('', 'Blockers:');
    result.blockers.forEach(item => lines.push(`- ${item.title}: ${item.detail}`));
  }
  if (result.conditions.length) {
    lines.push('', 'Conditions:');
    result.conditions.forEach(item => lines.push(`- ${item}`));
  }
  return lines.join('\n');
}

function signedDelta(value, suffix = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const sign = value > 0 ? '+' : '';
  return ` (${sign}${value}${suffix})`;
}

function conciseRegate(result) {
  const decisionLine = result.mode === 'compare'
    ? `Decision: ${result.baseline_decision} -> ${result.candidate_decision}`
    : `Decision: ${result.candidate_decision}`;
  const lines = [
    `Re-gate status: ${result.regate_status}`,
    `Use case: ${result.use_case.name} (${result.use_case.slug})`
  ];
  if (result.use_case.baseline_model || result.use_case.candidate_model) {
    const base = result.use_case.baseline_model || 'unspecified';
    const cand = result.use_case.candidate_model || 'unspecified';
    lines.push(base === cand ? `Model: ${cand}` : `Model: ${base} -> ${cand}`);
  }
  lines.push(
    decisionLine,
    `As of: ${result.as_of}`,
    `Evidence confidence: ${result.evaluation.confidence}%${result.delta ? signedDelta(result.delta.confidence, 'pp') : ''}`,
    `First-year ROI: ${result.evaluation.economics.first_year_roi}%${result.delta ? signedDelta(result.delta.first_year_roi, 'pp') : ''}`,
    `Material changes: ${result.changes.length}`,
    `Re-gate blockers: ${result.regate_blockers.length}`
  );
  if (result.regate_status === 'PASS') {
    lines.push(`Valid until: ${result.evaluation.valid_until}`);
  }
  if (result.changes.length) {
    lines.push('', 'Changes:');
    result.changes.forEach(item => lines.push(`- [${item.trigger}] ${item.title}: ${item.detail}`));
  }
  if (result.blockers.length) {
    lines.push('', 'Blockers:');
    result.blockers.forEach(item => lines.push(`- ${item.title}: ${item.detail}`));
  }
  if (result.warnings.length) {
    lines.push('', 'Warnings:');
    result.warnings.forEach(item => lines.push(`- ${item.title}: ${item.detail}`));
  }
  if (result.required_actions.length) {
    lines.push('', 'Required actions:');
    result.required_actions.forEach(item => lines.push(`- ${item}`));
  }
  return lines.join('\n');
}

function parseRegateArgs(args) {
  const files = [];
  const triggers = [];
  let model = null;
  let asOf = null;
  let json = false;

  const takeValue = (flag, inline, nextIndex) => {
    const value = inline !== undefined ? inline : args[nextIndex];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) {
      throw new Error(`Missing value for ${flag}.`);
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--model' || token.startsWith('--model=')) {
      const inline = token.includes('=') ? token.slice(token.indexOf('=') + 1) : undefined;
      const value = takeValue('--model', inline, index + 1).trim();
      if (!value) throw new Error('Missing value for --model.');
      model = value;
      if (inline === undefined) index += 1;
      continue;
    }
    if (token === '--as-of' || token.startsWith('--as-of=')) {
      const inline = token.includes('=') ? token.slice(token.indexOf('=') + 1) : undefined;
      const value = takeValue('--as-of', inline, index + 1).trim();
      if (!parseIsoDate(value)) throw new Error(`Invalid --as-of date: ${value}. Expected YYYY-MM-DD.`);
      asOf = value;
      if (inline === undefined) index += 1;
      continue;
    }
    if (token === '--trigger' || token.startsWith('--trigger=')) {
      const inline = token.includes('=') ? token.slice(token.indexOf('=') + 1) : undefined;
      const value = takeValue('--trigger', inline, index + 1);
      const parts = value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
      if (!parts.length) throw new Error('Missing value for --trigger.');
      for (const part of parts) {
        if (!REGATE_TRIGGERS.includes(part)) {
          throw new Error(`Unknown re-gate trigger: ${part}. Expected one of: ${REGATE_TRIGGERS.join(', ')}.`);
        }
        triggers.push(part);
      }
      if (inline === undefined) index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }
    files.push(token);
  }

  if (files.length === 0 || files.length > 2) {
    throw new Error('regate expects one contract file or a baseline and candidate contract pair.');
  }

  return { files, model, triggers, asOf, json };
}

function validateOrFail(contract, label) {
  const validation = validateContract(contract);
  if (!validation.valid) {
    console.error(label ? `Invalid SCALE-1 ${label} contract:` : 'Invalid SCALE-1 contract:');
    validation.errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

function runRegate(args) {
  if (args.includes('-h') || args.includes('--help')) return usage();
  let parsed;
  try {
    parsed = parseRegateArgs(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  let baseline;
  let candidate = null;
  try {
    baseline = readContract(parsed.files[0]);
    if (parsed.files[1]) candidate = readContract(parsed.files[1]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (!validateOrFail(baseline, candidate ? 'baseline' : '')) return;
  if (candidate && !validateOrFail(candidate, 'candidate')) return;

  const result = evaluateRegate(baseline, {
    candidate,
    model: parsed.model,
    triggers: parsed.triggers,
    asOf: parsed.asOf
  });

  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else console.log(conciseRegate(result));
  if (result.regate_status !== 'PASS') process.exitCode = 1;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ['-h', '--help', 'help'].includes(command)) return usage();
  if (command === 'regate') return runRegate(rest);

  const [file, ...flags] = rest;
  if (!['check', 'explain'].includes(command) || !file) {
    usage();
    process.exitCode = 1;
    return;
  }
  let contract;
  try {
    contract = readContract(file);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  if (!validateOrFail(contract)) return;
  const result = evaluateContract(contract);
  if (flags.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(concise(result));
  if (!['SCALE', 'CONDITIONAL_SCALE'].includes(result.decision)) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, concise, conciseRegate, parseRegateArgs };
