# SCALE GATE Methodology

## Purpose

SCALE GATE answers one bounded question:

> Has this AI-enabled workflow earned the right to receive more users, data, budget, integration or autonomy?

The method does not attempt to prove that AI is beneficial in general. It evaluates a defined workflow, population, operating model and decision boundary.

## Decision precedence

The engine applies rules in this order:

1. `RETIRE` when the use case is explicitly withdrawn.
2. `REJECT` when the first-year case is negative and end-to-end task performance is below the viable floor.
3. `REPAIR` when one or more hard blockers remain.
4. `CONDITIONAL_SCALE` when no hard blocker remains but at least one scale warning or evidence condition is open.
5. `SCALE` when the declared thresholds, controls and evidence requirements are satisfied.

This ordering is intentional. Aggregate scores never override a hard blocker.

## Reference thresholds

The included policy profile uses transparent defaults:

| Measure | Reference threshold | Hard floor |
|---|---:|---:|
| End-to-end task success | ≥ 85% | < 65% blocks scale |
| Grounded output rate | ≥ 90% | Context-dependent |
| Critical error rate | ≤ 2% | > 5% blocks scale |
| Workflow reliability | ≥ 98% | Context-dependent |
| Representative sample | ≥ 100 tasks | Missing evidence lowers confidence |
| Evidence confidence | ≥ 80% | Missing critical evidence can block |
| Sustained adoption | ≥ 55% | Context-dependent |
| Human review rate | ≤ 30% | High burden triggers a condition |
| First-year ROI | ≥ 25% | Negative value plus weak quality rejects |

These values are a reference profile for demonstration. A real organization must calibrate thresholds to risk, regulation, reversibility and business context.

## Hard blockers

The reference engine blocks expansion when it detects any of the following:

- a mandatory critical control is failed or missing;
- confirmed personal-data exposure remains unresolved;
- the critical error rate exceeds 5%;
- end-to-end task success is below 65%;
- no usable workflow baseline or volume exists;
- no accountable owner or measurable business outcome exists.

This prevents a mathematically attractive ROI projection from masking an unacceptable operating condition.

## Evidence confidence

Evidence confidence is not model accuracy. It represents how defensible the decision package is.

```text
confidence =
  32% required metric coverage
  28% verification of metrics and evidence
  22% representative sample strength
  18% declared source confidence
```

Sample strength reaches its reference maximum at 250 representative tasks for the four principal quality and reliability metrics.

Confidence is displayed independently from the decision pillars. A technically strong pilot may still have weak evidence if its sources are unverified or its sample is too small.

## Quality pillar

Quality is the mean threshold-attainment score across:

- task success;
- groundedness;
- critical error rate;
- reliability.

For minimum targets, attainment is `observed / target`, capped at 100%. For maximum targets, attainment is `target / observed`, capped at 100%. A zero-tolerance metric receives zero attainment when any incident exists.

The quality score is descriptive. Hard technical failures are still evaluated independently.

## Control pillar

Mandatory controls are weighted by severity:

| Severity | Weight |
|---|---:|
| Low | 1 |
| Medium | 2 |
| High | 3 |
| Critical | 5 |

Only passed controls contribute to the control score. A failed critical control creates a hard blocker regardless of the resulting percentage.

## Fully loaded economics

### Capacity

```text
gross hours released
  = users × tasks per user per month × minutes saved × 12 / 60

attributable hours
  = gross hours × sustained adoption × attribution

capacity value
  = attributable hours × labor cost per hour
```

Released time is not automatically cash. The method applies sustained adoption and causal attribution before valuing capacity.

### Benefits

```text
annual benefit
  = capacity value
  + revenue uplift × adoption × attribution
  + risk avoidance × attribution
```

### Costs

```text
inference cost
  = monthly tasks × model cost per task × 12

human review cost
  = monthly tasks × review rate × review minutes / 60
  × labor cost per hour × 12

first-year cost
  = setup cost + platform cost + inference cost + review cost
```

### Decision economics

```text
first-year net value = annual benefit − first-year cost
first-year ROI = first-year net value / first-year cost
```

The UI keeps scenario changes separate from observed evidence until they are explicitly saved.

## Validity and re-gating

Reference validity windows are:

- `SCALE`: 180 days;
- `CONDITIONAL_SCALE`: 90 days;
- `REPAIR`, `REJECT` or `RETIRE`: 30 days.

A date does not replace event-driven review. A new model, data source, workflow, population, integration, cost structure, risk classification or autonomy level should trigger a new gate immediately.

## Interpretation limits

- A deterministic engine cannot judge whether evidence is truthful.
- Causal attribution requires a valid measurement design outside the software.
- Financial value depends on whether released capacity is actually redeployed.
- Default thresholds are not legal requirements.
- A passed gate is not certification, regulatory approval or a guarantee of safety.
- Human decision-makers remain accountable for accepting residual risk.
