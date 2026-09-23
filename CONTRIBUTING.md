# Contributing to SCALE GATE

Contributions are welcome when they improve the transparency, portability or defensibility of enterprise AI scale decisions.

## Good contribution areas

- new SCALE-1 policy profiles with documented rationale;
- evaluation adapters that preserve provenance;
- evidence-signing and verification;
- accessibility and internationalization;
- additional deterministic tests;
- privacy-preserving enterprise connectors;
- clearer documentation and examples.

## Before opening a pull request

1. Do not include real company, employee, customer or production data.
2. Keep decision rules deterministic and explainable.
3. Document every threshold or policy change.
4. Add or update tests for changed behavior.
5. Run:

```bash
npm run check
npm test
npm run validate:demo
```

## Decision-policy changes

A change to blockers, decision precedence, evidence confidence or economics is a material policy change. Pull requests must describe:

- the problem being corrected;
- the decision behavior before and after;
- affected risk tiers and use cases;
- evidence or rationale for the change;
- migration impact on existing SCALE-1 contracts.

## Product principle

Do not add an aggregate score that can override a failed critical control. That is a core invariant of SCALE GATE.
