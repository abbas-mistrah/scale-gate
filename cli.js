#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateContract, evaluateContract } = require('./src/engine');

function usage() {
  console.log(`SCALE GATE CLI

Usage:
  scale-gate check <contract.scale.json> [--json]
  scale-gate explain <contract.scale.json>

Exit codes:
  0  contract is valid and decision is SCALE or CONDITIONAL_SCALE
  1  contract is invalid, REJECT, REPAIR or RETIRE
`);
}

function readContract(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
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

function main(argv) {
  const [command, file, ...flags] = argv;
  if (!command || ['-h', '--help', 'help'].includes(command)) return usage();
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
  const validation = validateContract(contract);
  if (!validation.valid) {
    console.error('Invalid SCALE-1 contract:');
    validation.errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  const result = evaluateContract(contract);
  if (flags.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(concise(result));
  if (!['SCALE', 'CONDITIONAL_SCALE'].includes(result.decision)) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main, concise };
