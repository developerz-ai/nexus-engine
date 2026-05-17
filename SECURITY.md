<!-- SPDX-License-Identifier: MIT -->

# Security Policy

## Reporting a vulnerability

Email `security@developerz.ai` [TBD: ops to confirm]. Do not open public issues for security reports.

Include: affected version, reproduction steps, impact assessment, suggested fix (optional).

## Supported versions

Latest minor of each released major/minor line receives security fixes.

| Version | Supported |
|---|---|
| latest minor of each released line | yes |
| older patch releases | no |

## Coordinated disclosure

90-day window from acknowledgement to public disclosure. We will:

1. Acknowledge receipt within 72 hours.
2. Validate and assign severity (CVSS v3.1).
3. Develop fix, coordinate release.
4. Credit reporter in advisory (opt-out available).

## PGP key

TBD — fingerprint will be published here once ops provisions the key.

## Scope

In scope: engine crates, scripting sandbox, asset pipeline, networking transports, agent API, editor.

Out of scope: third-party plugins, user game code, deployment infrastructure not owned by Nexus.
