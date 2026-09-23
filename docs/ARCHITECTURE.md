# SCALE GATE Architecture

## Design objectives

SCALE GATE is intentionally small enough to audit and complete enough to demonstrate an end-to-end enterprise decision system.

The architecture optimizes for five properties:

1. **Local evidence custody** — no external database or service is required.
2. **Deterministic decisions** — the same evidence contract produces the same result.
3. **Portable records** — SCALE-1 JSON and Markdown decision packs remain usable without the UI.
4. **Visible policy** — thresholds and hard-blocker precedence are code, not hidden prompts.
5. **Low operational friction** — Node.js is the only prerequisite.

## Runtime topology

```text
┌──────────────────────────────────────────────────────────────┐
│ Browser / PWA                                                │
│ Decision · Evidence · Evaluation · Value · Controls · Pack   │
└──────────────────────────────┬───────────────────────────────┘
                               │ JSON over localhost
┌──────────────────────────────▼───────────────────────────────┐
│ Node.js HTTP API                                             │
│ input limits · API routing · static assets · exports         │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
┌───────────────▼──────────────┐  ┌────────────▼──────────────┐
│ Deterministic decision engine│  │ SQLite persistence        │
│ thresholds · economics       │  │ contracts · runs · audit  │
│ blockers · confidence        │  │ WAL · foreign keys        │
└──────────────────────────────┘  └───────────────────────────┘

Parallel portable path:
contract.scale.json ──► CLI / GitHub Action ──► decision + exit code
```

## Components

### `src/engine.js`

Pure business logic with no database or network dependency.

- validates the minimum SCALE-1 structure;
- calculates fully loaded economics;
- calculates evidence confidence;
- weights mandatory controls by severity;
- detects hard blockers and warnings;
- produces one of five decisions;
- assigns a validity window and explicit conditions.

Because the engine accepts a plain object, the same code is used by the web application, CLI, tests and GitHub Action.

### `src/database.js`

Owns SQLite persistence and demo initialization.

- creates the schema idempotently;
- seeds three fictional use cases only when the database is empty;
- reconstructs SCALE-1 contracts from relational records;
- stores evaluation snapshots and audit events;
- exposes controlled updates for use cases, metrics and controls.

### `server.js`

Dependency-free local HTTP layer.

- limits request payloads to 1.5 MB;
- parses JSON and returns explicit status codes;
- prevents static path traversal;
- sets content-type, cache and referrer headers;
- serves downloadable contracts and decision packs.

### `cli.js`

Portable policy gate.

- validates a JSON contract;
- evaluates it with the same engine as the UI;
- prints human-readable or JSON output;
- returns a non-zero code for invalid, rejected, repair or retired contracts.

### `public/`

Framework-free PWA shell. All visible data is escaped before insertion. The UI has no analytics, remote fonts or third-party script.

## Relational model

| Table | Responsibility |
|---|---|
| `organizations` | Decision context and currency. |
| `use_cases` | Workflow, owner, baseline, risk, autonomy and economic assumptions. |
| `metrics` | Observed values, thresholds, samples, verification and provenance. |
| `controls` | Mandatory safeguards, severity, status, owner and evidence. |
| `evidence` | Dated sources with confidence, verification and expiry. |
| `evaluations` | Immutable decision snapshots and calculated economics. |
| `audit_log` | Timestamped local mutation trail. |

Foreign keys are enabled. Metrics and controls are unique by `(use_case_id, key)`.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Runtime and protocol status. |
| `GET` | `/api/state` | Complete local decision workspace. |
| `POST` | `/api/use-cases` | Create a use case with default evidence obligations. |
| `PATCH` | `/api/use-cases/:id` | Update declared operating assumptions. |
| `GET` | `/api/use-cases/:id/contract` | Read the reconstructed SCALE-1 contract. |
| `POST` | `/api/use-cases/:id/metrics` | Insert or update a measured metric. |
| `PATCH` | `/api/controls/:id` | Update control status and evidence. |
| `POST` | `/api/use-cases/:id/evaluate` | Seal an evaluation snapshot. |
| `GET` | `/api/use-cases/:id/export` | Download a SCALE-1 JSON contract. |
| `GET` | `/api/use-cases/:id/decision-pack` | Download the Markdown decision record. |
| `POST` | `/api/validate` | Validate and evaluate a supplied contract. |

## Decision data flow

1. SQLite rows are reconstructed as one SCALE-1 contract.
2. The engine validates required accountability and baseline fields.
3. Metrics are compared with explicit directions and thresholds.
4. Critical control failures and high-impact technical failures become hard blockers.
5. Evidence confidence is calculated separately from performance.
6. Fully loaded benefit and cost are calculated.
7. Decision precedence is applied.
8. A gate run stores a full result snapshot, not only the final label.

## Security boundaries

This reference implementation is local-only and binds to `127.0.0.1` by default. It does not implement multi-user authentication, remote synchronization or encrypted storage.

Before using it as a shared enterprise service, add:

- identity and role-based authorization;
- encrypted database and backup handling;
- organization-level tenant isolation;
- signed contract and evaluation provenance;
- immutable remote audit storage;
- controlled connectors and secret management;
- data-retention and deletion policies;
- threat modelling and security testing.

## Extension points

The architecture can evolve without changing SCALE-1:

- import evaluation results from model or agent harnesses;
- sign contracts and decision packs;
- connect telemetry, finance or GRC systems;
- add policy profiles by industry or risk tier;
- compare candidate models under one workflow contract;
- trigger continuous re-gating on drift or material change.
