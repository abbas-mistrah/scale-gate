# Changelog

All notable changes to SCALE GATE are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `tests/cli.test.js`: end-to-end tests of the CLI exit-code contract that CI pipelines rely on. Each reference contract is checked for its expected decision and exit code (`SCALE` and `CONDITIONAL_SCALE` exit 0, `REPAIR` and the starter `REJECT` exit 1), plus `--json` output, missing file, malformed JSON, structurally invalid contract, help and unknown command. Test count goes from 6 to 16.

### Changed
- The CLI now names the file when a contract is not valid JSON (`Not valid JSON: <path> (...)`) instead of printing a bare parser error.

## [1.1.0] - 2026-10-31

### Added
- Starter contract `contracts/templates/starter.scale.json`: a valid SCALE-1 skeleton that returns `REJECT` on purpose, so its blockers and conditions read as the evidence checklist.
- Guide [docs/YOUR-FIRST-CONTRACT.md](docs/YOUR-FIRST-CONTRACT.md) and README section "Gate your own use case".

### Since the release
- macOS/Linux launcher `launch-scale-gate.sh` documented in Quick start.

## [1.0.0]

### Added
- First public release: SCALE GATE decision engine, SCALE-1 evidence protocol and schema, three executable reference contracts, CLI, reusable GitHub Action, local SQLite Decision Room (PWA) and CI.

[Unreleased]: https://github.com/abbas-mistrah/scale-gate/compare/v1.1.0...main
[1.1.0]: https://github.com/abbas-mistrah/scale-gate/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/abbas-mistrah/scale-gate/releases/tag/v1.0.0
