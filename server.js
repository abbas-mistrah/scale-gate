'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  databasePath,
  getState,
  getContract,
  runEvaluation,
  updateControl,
  updateUseCase,
  upsertMetric,
  createUseCase
} = require('./src/database');
const { evaluateContract, validateContract } = require('./src/engine');

const port = Number(process.env.PORT) || 4325;
const host = process.env.HOST || '127.0.0.1';
const publicDirectory = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function send(response, status, body, type = 'text/plain; charset=utf-8', extraHeaders = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': payload.length,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(payload);
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload, (_, value) => typeof value === 'bigint' ? Number(value) : value), 'application/json; charset=utf-8');
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_500_000) {
        reject(new HttpError(413, 'Payload too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

// Mutation routes read named fields from the body, so null, arrays and
// primitives are client errors (400), not server crashes (500).
async function parseObjectBody(request) {
  const body = await parseBody(request);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return body;
}

// Required-field checks in the data layer are input errors, not server faults.
function asClientError(operation) {
  try {
    return operation();
  } catch (error) {
    if (/ is required\.$/.test(error.message)) throw new HttpError(400, error.message);
    throw error;
  }
}

function decisionPack(contract, assessment) {
  const blockers = assessment.blockers.length
    ? assessment.blockers.map(item => `- **${item.title}** — ${item.detail}`).join('\n')
    : '- None.';
  const conditions = assessment.conditions.length
    ? assessment.conditions.map(item => `- ${item}`).join('\n')
    : '- No additional conditions.';
  return `# SCALE GATE — Scale Decision Pack

**Use case:** ${contract.use_case.name}  
**Owner:** ${contract.use_case.owner}  
**Department:** ${contract.use_case.department}  
**Decision:** ${assessment.decision}  
**Evidence confidence:** ${assessment.confidence}%  
**Valid until:** ${assessment.valid_until}

> ${assessment.decision_copy}

## Business outcome

${contract.use_case.business_outcome}

## Decision pillars

| Pillar | Score |
|---|---:|
| Quality | ${assessment.pillars.quality}% |
| Value | ${assessment.pillars.value}% |
| Controls | ${assessment.pillars.controls}% |
| Adoption | ${assessment.pillars.adoption}% |
| Evidence | ${assessment.pillars.evidence}% |

## Scale economics

| Measure | Value |
|---|---:|
| Annual attributable benefit | €${assessment.economics.annual_benefit.toLocaleString('en-US')} |
| First-year fully loaded cost | €${assessment.economics.first_year_cost.toLocaleString('en-US')} |
| First-year net value | €${assessment.economics.first_year_net.toLocaleString('en-US')} |
| First-year ROI | ${assessment.economics.first_year_roi}% |
| Cost per successful task | €${assessment.economics.cost_per_successful_task} |

## Hard blockers

${blockers}

## Scale conditions

${conditions}

## Decision policy

${assessment.policy}

## Provenance

- Protocol: SCALE-1 v${assessment.protocol}
- Generated: ${assessment.evaluated_at}
- Evidence items: ${contract.evidence.length}
- Controls: ${contract.controls.length}
- Metrics: ${contract.metrics.length}
- Dataset: fictional demonstration data unless replaced by the operator.

---

Generated locally by SCALE GATE. This report supports governance; it is not a certification or legal opinion.
`;
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  if (request.method === 'GET' && pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, service: 'SCALE GATE', protocol: 'SCALE-1', database: path.basename(databasePath), time: new Date().toISOString() });
  }
  if (request.method === 'GET' && pathname === '/api/state') return sendJson(response, 200, getState());

  if (request.method === 'POST' && pathname === '/api/use-cases') {
    const input = await parseObjectBody(request);
    const useCase = asClientError(() => createUseCase(input));
    return sendJson(response, 201, { use_case: useCase, state: getState() });
  }

  const caseMatch = pathname.match(/^\/api\/use-cases\/(\d+)$/);
  if (caseMatch && request.method === 'PATCH') {
    const item = updateUseCase(Number(caseMatch[1]), await parseObjectBody(request));
    return item ? sendJson(response, 200, { use_case: item, state: getState() }) : sendJson(response, 404, { error: 'Use case not found.' });
  }

  const contractMatch = pathname.match(/^\/api\/use-cases\/(\d+)\/contract$/);
  if (contractMatch && request.method === 'GET') {
    const contract = getContract(Number(contractMatch[1]));
    return contract ? sendJson(response, 200, contract) : sendJson(response, 404, { error: 'Use case not found.' });
  }

  const evaluationMatch = pathname.match(/^\/api\/use-cases\/(\d+)\/evaluate$/);
  if (evaluationMatch && request.method === 'POST') {
    const evaluation = runEvaluation(Number(evaluationMatch[1]));
    return evaluation ? sendJson(response, 201, { evaluation, state: getState() }) : sendJson(response, 404, { error: 'Use case not found.' });
  }

  const metricMatch = pathname.match(/^\/api\/use-cases\/(\d+)\/metrics$/);
  if (metricMatch && request.method === 'POST') {
    const input = await parseObjectBody(request);
    const metric = asClientError(() => upsertMetric(Number(metricMatch[1]), input));
    return metric ? sendJson(response, 200, { metric, state: getState() }) : sendJson(response, 404, { error: 'Use case not found.' });
  }

  const controlMatch = pathname.match(/^\/api\/controls\/(\d+)$/);
  if (controlMatch && request.method === 'PATCH') {
    const control = updateControl(Number(controlMatch[1]), await parseObjectBody(request));
    return control ? sendJson(response, 200, { control, state: getState() }) : sendJson(response, 404, { error: 'Control not found.' });
  }

  const exportMatch = pathname.match(/^\/api\/use-cases\/(\d+)\/(export|decision-pack)$/);
  if (exportMatch && request.method === 'GET') {
    const contract = getContract(Number(exportMatch[1]));
    if (!contract) return sendJson(response, 404, { error: 'Use case not found.' });
    const assessment = evaluateContract(contract);
    if (exportMatch[2] === 'decision-pack') {
      const markdown = decisionPack(contract, assessment);
      return send(response, 200, markdown, 'text/markdown; charset=utf-8', {
        'Content-Disposition': `attachment; filename="${contract.use_case.slug}-decision-pack.md"`
      });
    }
    return send(response, 200, JSON.stringify(contract, null, 2), 'application/json; charset=utf-8', {
      'Content-Disposition': `attachment; filename="${contract.use_case.slug}.scale.json"`
    });
  }

  if (request.method === 'POST' && pathname === '/api/validate') {
    const contract = await parseBody(request);
    const validation = validateContract(contract);
    return sendJson(response, validation.valid ? 200 : 422, {
      ...validation,
      assessment: validation.valid ? evaluateContract(contract) : null
    });
  }

  return sendJson(response, 404, { error: 'API route not found.' });
}

function serveStatic(response, url, method) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return sendJson(response, 400, { error: 'Malformed URL.' });
  }
  decoded = decoded.replace(/^[/\\]+/, '');
  const filePath = path.resolve(publicDirectory, decoded);
  if (!filePath.startsWith(publicDirectory + path.sep) && filePath !== path.join(publicDirectory, 'index.html')) {
    return sendJson(response, 403, { error: 'Access denied.' });
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (path.extname(requested)) return sendJson(response, 404, { error: 'File not found.' });
      return fs.readFile(path.join(publicDirectory, 'index.html'), (fallbackError, fallback) => {
        if (fallbackError) return sendJson(response, 404, { error: 'Page not found.' });
        if (method === 'HEAD') return send(response, 200, '', 'text/html; charset=utf-8');
        send(response, 200, fallback, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
      });
    }
    const extension = path.extname(filePath).toLowerCase();
    const cache = ['.html', '.js', '.css', '.webmanifest'].includes(extension) ? 'no-cache' : 'public, max-age=86400';
    if (method === 'HEAD') return send(response, 200, '', mimeTypes[extension] || 'application/octet-stream', { 'Cache-Control': cache });
    return send(response, 200, data, mimeTypes[extension] || 'application/octet-stream', { 'Cache-Control': cache });
  });
}

const server = http.createServer(async (request, response) => {
  try {
    // Routing only needs the path, so the Host header is never parsed: a
    // malformed Host used to throw here, outside any handler, and stop the server.
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (!['GET', 'HEAD'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed.' });
    return serveStatic(response, url, request.method);
  } catch (error) {
    if (error instanceof HttpError) {
      if (!response.headersSent && !response.destroyed) sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error(error);
    if (!response.headersSent && !response.destroyed) sendJson(response, 500, { error: 'Internal error.' });
  }
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log('SCALE GATE · Enterprise AI Evidence & Scale Decision Engine');
    console.log(`http://${host}:${port}`);
    console.log(`SQLite: ${databasePath}`);
  });
}

module.exports = server;
