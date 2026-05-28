# Changelog

All notable changes to detect-backend-threat are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Foundation governance files: GOVERNANCE.md, MAINTAINERS.md, CODE_OF_CONDUCT.md, SECURITY.md, SUPPORT.md, RELEASE.md, CODEOWNERS, NOTICE
- `.golangci.yml` with explicit linter configuration

### Fixed
- golangci-lint errors: unused context in clamav span, unchecked SetDeadline, unchecked json.Encode, unchecked otel shutdown

---

## [0.3.0] - 2026-05-20

### Added
- Next.js 14 SOC dashboard with Three.js WebGL globe and D3.js threat graph
- `useSyncExternalStore` WebSocket singleton pattern for event feed
- Virtualized event table (react-virtual) supporting 100k+ rows at 60fps
- Redis Streams consumer in WebSocket API route (`XREAD BLOCK 5000 COUNT 50`)
- MkDocs Material documentation site deployed to GitHub Pages
- Comprehensive docs: How It Works, API Reference, Configuration, Development, Deployment
- MITRE ATT&CK Navigator layer JSON for the 8 detected techniques
- Bench regression GitHub Actions workflow using `benchstat` (5% p99 threshold)

### Changed
- CI workflow split into lint, test, build, trivy, and owasp-zap jobs

---

## [0.2.0] - 2026-05-10

### Added
- Node.js ingest service with Express, WebSocket, Zod validation, and token-bucket rate limiter
- TimescaleDB hypertable with 7-day retention and 1-minute continuous aggregate
- Redis Streams as the message bus between ingest and detector
- Docker Compose with 6 services and healthchecks
- GitHub Actions CI: golangci-lint, go test -race, jest, docker buildx, Trivy, OWASP ZAP
- OpenTelemetry spans across all detection calls

---

## [0.1.0] - 2026-04-28

### Added
- Go 1.22 detection engine with ClamAV, VirusTotal v3, and AbuseIPDB v2 integrations
- Redis LRU cache for AbuseIPDB responses (50k entries, 1h TTL)
- ClamAV INSTREAM TCP protocol client with 4-byte big-endian chunk framing
- MITRE ATT&CK v14 tactic inference from detection signals
- Severity escalation engine: INFO → LOW → MEDIUM → HIGH → CRITICAL
- Benchmark: 221 ns/op, 304 B/op, 3 allocs/op (engine.Detect with mocked clients)
- 10 unit tests with race detector enabled
