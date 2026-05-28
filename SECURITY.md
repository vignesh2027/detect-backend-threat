# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | :white_check_mark: Active |
| Tagged releases | :white_check_mark: Latest only |
| Older releases | :x: No backports |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately by emailing **lkvarnesh@gmail.com** with the subject line:

```
[SECURITY] detect-backend-threat — <brief description>
```

Include:

1. A description of the vulnerability and its potential impact
2. Steps to reproduce or proof-of-concept code
3. Affected component(s) and version(s)
4. Any suggested mitigations (optional)

## Response Timeline

| Action | Target |
|---|---|
| Acknowledgement | Within 48 hours |
| Initial triage | Within 5 business days |
| Fix or mitigation | Within 30 days for critical, 90 days for others |
| Public disclosure | Coordinated with reporter after fix is available |

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). Reporters who follow this policy will not face legal action.

## Threat Model

detect-backend-threat processes untrusted network payloads and calls external threat-intel APIs. Key trust boundaries:

- **Ingest service** — validates all incoming JSON via Zod schemas; rate-limited at the token-bucket layer
- **Go detection engine** — no shell execution; ClamAV called via TCP with bounded timeouts
- **Dashboard** — read-only consumer of Redis Streams; no user-supplied SQL
- **API keys** — never logged, never stored in the repository; loaded from environment only

## Automated Security Checks

Every pull request runs:

- **Trivy** — container image vulnerability scan (CRITICAL threshold = fail)
- **OWASP ZAP** — DAST scan against the running ingest service
- **golangci-lint** — static analysis including `gosec` rules
- **npm audit** — dependency vulnerability check for Node.js apps

## Security Hall of Fame

Researchers who responsibly disclose valid vulnerabilities will be credited here (with permission).

*No reports yet.*
