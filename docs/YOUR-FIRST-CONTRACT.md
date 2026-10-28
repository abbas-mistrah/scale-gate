# Gate your own AI use case in 10 minutes

The three demo contracts show what SCALE GATE decides. This guide shows how to put **your** use case through the gate.

## 1. Copy the starter contract

```bash
cp contracts/templates/starter.scale.json contracts/my-use-case.scale.json
```

The starter is a valid SCALE-1 contract with placeholder values. It is built to fail on purpose.

## 2. Run it once before editing anything

```bash
node cli.js check contracts/my-use-case.scale.json
```

You should see:

```text
Decision: REJECT
Evidence confidence: 41%
First-year ROI: -20%
Hard blockers: 3
Warnings: 7
```

followed by the list of blockers and conditions. That list is your work plan: a new use case starts with no evidence, so the gate refuses it until the evidence exists.

## 3. Replace the placeholders, section by section

| Section | What to fill in | Tip |
|---|---|---|
| `use_case` | Owner, outcome, risk tier, autonomy level, volumes and costs | Use the measured baseline, not the vendor promise. |
| `metrics` | The six required metrics: `task_success`, `groundedness`, `critical_error_rate`, `reliability`, `latency_seconds`, `cost_per_task` | Set `sample_size` honestly; fewer than 100 representative tasks keeps the decision conditional. |
| `controls` | Status `pass`, `fail` or `missing`, plus a short evidence note | A critical control that is not `pass` blocks scale, whatever the ROI. |
| `evidence` | Every source behind the numbers, with confidence and an expiry date | Expired or unverified evidence lowers confidence. |

Field definitions are in [`SCALE-1.md`](SCALE-1.md) and the JSON Schema in [`../contracts/scale-1.schema.json`](../contracts/scale-1.schema.json).

## 4. Re-run until the verdict is defensible

```bash
node cli.js check contracts/my-use-case.scale.json
node cli.js check contracts/my-use-case.scale.json --json > decision.json
```

The exit code is `0` only for `SCALE` or `CONDITIONAL_SCALE`, so the same command can gate a CI pipeline (see the GitHub Action in the main README).

## 5. Keep it honest

- Do not edit thresholds to make a use case pass; change the evidence or the scope.
- Keep real contracts out of public repositories if they contain internal figures.
- A passed gate is time-bound. Re-run it when the model, data, workflow, population or autonomy changes.
