# CNCF Sandbox Proposal — detect-backend-threat

> **Status:** Draft — ready to submit when adoption milestones are met.
> **Target:** CNCF Sandbox (primary) · LF AI & Data Incubation (secondary)

---

## Project Name

**detect-backend-threat**

## Project Description

detect-backend-threat is a production-grade, open-source cybersecurity threat detection platform that provides real-time analysis of backend traffic events against multiple threat intelligence sources, maps findings to MITRE ATT&CK v14 techniques, and visualises results on a WebGL-accelerated SOC dashboard.

The platform integrates three independent detection engines — ClamAV (file scanning via INSTREAM TCP protocol), VirusTotal v3 (hash reputation across 70+ AV engines), and AbuseIPDB v2 (IP reputation with Redis LRU caching) — into a single orchestrated pipeline with sub-millisecond decision latency (221 ns/op benchmark).

## Alignment with CNCF Mission

detect-backend-threat aligns with CNCF's mission to make cloud-native security ubiquitous by:

- Providing **vendor-neutral threat detection** — no proprietary lock-in; any scanner can be swapped via interface injection
- Using **CNCF-ecosystem components** — OpenTelemetry for distributed tracing, Redis for event streaming, Docker/Kubernetes for deployment
- Targeting **cloud-native workloads** — designed for containerised microservice environments, not legacy monoliths
- Operating under **Apache 2.0** — the same license as the majority of CNCF projects

## Architecture

```
Internet Traffic
      │
      ▼
┌─────────────┐    Redis Streams    ┌──────────────────┐
│ Ingest API  │ ──────────────────► │  Detection Engine │
│ (Node.js)   │                     │  (Go 1.22)        │
│ Zod + rate  │                     │  ClamAV TCP       │
│ limiter     │                     │  VirusTotal v3    │
└─────────────┘                     │  AbuseIPDB v2     │
                                    │  MITRE mapping    │
                                    └────────┬─────────┘
                                             │
                              ┌──────────────▼──────────┐
                              │      TimescaleDB         │
                              │   (hypertable, 7-day     │
                              │    retention, aggregates)│
                              └──────────────┬───────────┘
                                             │
                              ┌──────────────▼──────────┐
                              │    SOC Dashboard          │
                              │    (Next.js 14)           │
                              │    Three.js WebGL globe   │
                              │    D3 force graph         │
                              │    react-virtual feed     │
                              └─────────────────────────┘
```

## Features

- **Real-time detection pipeline** — Redis Streams XREAD BLOCK with < 100ms end-to-end latency
- **Multi-engine orchestration** — ClamAV + VirusTotal + AbuseIPDB running in parallel, results merged with escalation-only severity model
- **MITRE ATT&CK v14 mapping** — 8 techniques (TA0001–TA0043) automatically inferred from detection signals
- **WebGL SOC dashboard** — 500 concurrent threat arcs at 60fps using InstancedMesh (1 GPU draw call)
- **OpenTelemetry instrumentation** — distributed traces across all detection calls
- **Production CI/CD** — golangci-lint, go test -race, Jest, Docker build, Trivy CVE scan, OWASP ZAP baseline
- **Benchmark** — 221 ns/op, 304 B/op, 3 allocs/op (detection engine with realistic event load)

## Technical Details

| Component | Technology | Why |
|---|---|---|
| Detection engine | Go 1.22 | Goroutine-per-scanner concurrency, zero-allocation hot path |
| Message bus | Redis Streams | Persistent ordered log, consumer groups, no Kafka overhead |
| Storage | TimescaleDB | Native time-series compression, continuous aggregates, 7-day retention |
| Dashboard | Next.js 14 + Three.js | Server components, WebGL instancing for large-scale visualisation |
| Tracing | OpenTelemetry | Vendor-neutral, CNCF standard |
| Validation | Zod (Node) | Runtime schema enforcement at ingestion boundary |

## Project Governance

The project follows documented governance with clear roles, contribution processes, and a code of conduct:

- [GOVERNANCE.md](GOVERNANCE.md) — decision-making process and maintainer lifecycle
- [MAINTAINERS.md](MAINTAINERS.md) — current maintainer list
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Contributor Covenant v2.1
- [SECURITY.md](SECURITY.md) — vulnerability reporting with 48-hour acknowledgement SLA
- [DCO](DCO) — Developer Certificate of Origin v1.1

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Source Control

**GitHub:** https://github.com/vignesh2027/detect-backend-threat

## Project Maintainers

| Name | GitHub | Affiliation |
|---|---|---|
| Vigneshwar | [@vignesh2027](https://github.com/vignesh2027) | Takshashila University |

## Infrastructure Requirements from CNCF

- GitHub repository hosting (already on GitHub)
- CI/CD (GitHub Actions — already configured)
- Security scanning (Trivy + OWASP ZAP — already in CI)
- No additional infrastructure required at Sandbox stage

## Documentation

Full documentation: https://vignesh2027.github.io/detect-backend-threat

Includes: architecture deep-dives, API reference, configuration guide, development guide, deployment guide, ADRs, MITRE ATT&CK Navigator layer, and operational runbooks.

## Roadmap

**Phase 4 (next 6 months):**
- ML-based anomaly scoring (isolation forest on event feature vectors)
- YARA rule engine for custom signature matching
- Kubernetes Helm chart for production deployment
- Alert correlation — link related events into incident timelines
- Webhook/PagerDuty integration for SOC alerting

**Phase 5 (12 months):**
- Multi-tenant support
- gRPC streaming API for scanner plugins
- eBPF-based network capture for zero-instrumentation ingestion

## Adopters

*Seeking early adopters. If your team is using or evaluating detect-backend-threat, please open an issue to be listed here.*

## Statement on Overlap with Existing CNCF Projects

- **Falco** — kernel-level syscall monitoring; detect-backend-threat operates at the application/API layer, complementary not competing
- **OPA/Gatekeeper** — policy enforcement; detect-backend-threat does threat intelligence enrichment, not policy decisions
- **Grafana** — visualisation platform; detect-backend-threat's dashboard is domain-specific to SOC workflows

---

*This proposal follows the CNCF Sandbox proposal template: https://github.com/cncf/sandbox*
