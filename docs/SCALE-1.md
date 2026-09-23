# SCALE-1 Evidence Contract

**SCALE-1** is an open JSON contract for a time-bound enterprise AI scale decision.

It exists so that business intent, technical evaluation, operating controls, value assumptions and granted authority can travel together instead of being scattered across slides, dashboards, tickets and audit folders.

## Contract structure

```json
{
  "scale1_version": "1.0",
  "organization": {},
  "use_case": {},
  "metrics": [],
  "controls": [],
  "evidence": []
}
```

The normative machine-readable structure is [`contracts/scale-1.schema.json`](../contracts/scale-1.schema.json).

## `use_case`

The use-case object defines the boundary of the decision.

Required accountability fields:

- `slug` — stable machine identifier;
- `name` — human-readable workflow name;
- `owner` — named accountable business owner;
- `department` — operating domain;
- `business_outcome` — measurable outcome that justifies the system.

Decision context includes:

- `risk_tier` — `low`, `medium`, `high` or `critical`;
- `autonomy_level` — integer from 0 to 4;
- pilot and target populations;
- baseline and treatment task time;
- task volume;
- setup, platform and labor cost;
- adoption and attribution;
- human-review rate and effort.

## `metrics`

Each metric carries its own decision semantics:

```json
{
  "key": "task_success",
  "label": "End-to-end task success",
  "category": "quality",
  "value": 0.89,
  "target": 0.85,
  "unit": "ratio",
  "direction": "min",
  "sample_size": 240,
  "verified": true,
  "source": "Golden workflow set"
}
```

The reference engine expects these portable keys:

| Key | Meaning |
|---|---|
| `task_success` | Representative workflow completed correctly end to end. |
| `groundedness` | Output traceable to authorized evidence. |
| `critical_error_rate` | High-impact failures per evaluated task. |
| `reliability` | Workflow availability and successful execution. |
| `latency_seconds` | P95 end-to-end response time. |
| `cost_per_task` | Variable model or agent cost per attempted task. |
| `pii_incidents` | Confirmed personal-data exposure findings. |

Profiles can add domain-specific metrics without breaking the base contract.

## `controls`

Controls define the authority boundary, not just documentation completeness.

```json
{
  "key": "human-escalation",
  "domain": "Oversight",
  "title": "Human escalation path",
  "severity": "critical",
  "mandatory": true,
  "status": "pass",
  "owner": "Operations Lead",
  "evidence": "Escalation tested across edge cases",
  "framework_ref": "ISO/IEC 42001 · Operation"
}
```

Allowed statuses are `pass`, `fail` and `missing`. Mandatory critical controls that are not `pass` create a hard blocker.

## `evidence`

Evidence preserves provenance and validity:

- title and evidence type;
- decision domain;
- source or method;
- declared confidence;
- verification status;
- observation date;
- expiry date;
- interpretation note.

Evidence expiry forces the decision to remain temporal. It prevents a successful pilot from becoming permanent authorization without re-examination.

## Decision vocabulary

| Decision | Meaning |
|---|---|
| `REJECT` | The use case does not currently justify further investment. |
| `REPAIR` | Expansion is prohibited until one or more hard blockers are resolved. |
| `CONDITIONAL_SCALE` | Expansion is justified only within explicit scope, controls and evidence conditions. |
| `SCALE` | Evidence supports controlled expansion within the declared authority boundary. |
| `RETIRE` | Withdraw the system and retain the decision record. |

## Versioning

SCALE-1 follows semantic intent:

- patch releases may clarify descriptions without changing meaning;
- minor releases may add optional fields or compatible profiles;
- major releases may change required fields or decision semantics.

Consumers should reject an unsupported major version instead of silently interpreting it.

## Framework crosswalks

`framework_ref` is intentionally non-normative. It can help reviewers navigate practices in NIST AI RMF, ISO/IEC 42001, internal policies or sector frameworks.

A crosswalk is not evidence of conformity. Formal compliance requires qualified interpretation, implementation and assurance beyond this contract.

## Design principles

1. Workflow before model.
2. Named accountability before scale.
3. Hard blockers before aggregate scores.
4. Fully loaded cost before ROI.
5. Evidence expires.
6. Autonomy is explicit and reversible.
7. Material change triggers re-gating.
