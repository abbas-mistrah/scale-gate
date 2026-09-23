# Security Policy

## Supported version

The latest version on the default branch receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository when available. Do not open a public issue containing exploit details, credentials, personal data or production evidence.

Include:

- affected component and version;
- reproduction steps using synthetic data;
- potential impact;
- suggested mitigation, if known.

## Reference implementation boundary

SCALE GATE binds to localhost and stores data in a local SQLite database. It is not hardened as a multi-tenant enterprise service.

Before remote or shared deployment, implement identity, authorization, encryption, tenant isolation, signed provenance, secret management, retention controls and an independent security review.
