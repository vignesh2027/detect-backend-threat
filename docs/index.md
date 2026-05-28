# detect-backend-threat

<div class="grid cards" markdown>

-   :material-shield-check:{ .lg .middle } **Multi-Engine Detection**

    ---
    ClamAV + VirusTotal v3 + AbuseIPDB v2 running in parallel — every event scored against three independent engines

-   :material-lightning-bolt:{ .lg .middle } **221 ns/op Overhead**

    ---
    Detection engine orchestration measured at 221 nanoseconds — 50,000× faster than the 50ms p99 target

-   :material-globe-model:{ .lg .middle } **WebGL SOC Dashboard**

    ---
    Three.js globe with 500 animated attack arcs at 60fps, D3 force graph, and react-virtual event feed

-   :material-clock-fast:{ .lg .middle } **60-Second Deploy**

    ---
    `cp .env.example .env && make dev` — all six services healthy and connected

</div>

---

## What Is detect-backend-threat?

**detect-backend-threat** is a production-grade, open-source cybersecurity threat detection platform built as a reference architecture for Security Operations Centers (SOCs).

It solves the gap between "toy demo dashboards" and "enterprise tools that take weeks to deploy." Every component is real — real detection engines, real API integrations, real time-series database schema, real observability, real CI/CD — but the entire stack deploys in under 60 seconds.

### The Full Picture

```
Security Events (HTTP/WebSocket)
        ↓
Node.js Ingest Layer       ← Zod validation, rate limiting, Redis Streams
        ↓
Redis Streams Bus          ← Decoupled fan-out to detector + dashboard
        ↓
Go Detection Engine        ← ClamAV + VirusTotal + AbuseIPDB in parallel
        ↓
TimescaleDB                ← 7-day hypertable, continuous aggregates
        ↓
Next.js SOC Dashboard      ← Three.js globe, D3 graph, 100k-row feed
```

Everything is traced with OpenTelemetry — every detection call emits a span from ingest to verdict.

---

## Quick Start

!!! tip "You'll need"
    Docker Desktop (or Colima), 4 GB RAM, and API keys for [VirusTotal](https://virustotal.com) and [AbuseIPDB](https://abuseipdb.com) (both have free tiers).

```bash
# Clone
git clone https://github.com/vignesh2027/detect-backend-threat
cd detect-backend-threat

# Configure (3 required values)
cp .env.example .env
# edit .env: POSTGRES_PASSWORD, VIRUSTOTAL_API_KEY, ABUSEIPDB_API_KEY

# Launch all 6 services
make dev
```

| Service | URL |
|---------|-----|
| SOC Dashboard | [http://localhost:3000](http://localhost:3000) |
| Ingest REST API | [http://localhost:4000/events](http://localhost:4000/events) |
| Ingest WebSocket | `ws://localhost:4000/ws/events` |
| Health Check | [http://localhost:4000/health](http://localhost:4000/health) |

**Send your first event in 30 seconds:**

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"source_ip":"185.220.101.47","event_type":"http_request","severity":"high"}'
```

Watch the arc appear on the globe.

---

## What's in This Documentation

| Section | What you'll find |
|---------|-----------------|
| [Architecture](architecture.md) | Full system design, data flow, component responsibilities, design decisions |
| [API Reference](api/ingest.md) | REST and WebSocket API — every field, every response code, examples |
| [Configuration](reference/configuration.md) | Every environment variable, defaults, and production guidance |
| [Development Guide](guides/development.md) | Local setup, running tests, adding scanners, debugging |
| [Deployment](guides/deployment.md) | Docker Compose, production checklist, scaling notes |
| [Benchmarks](benchmarks.md) | Real numbers, methodology, how to reproduce |
| [Threat Intelligence](threat-intel.md) | MITRE ATT&CK coverage, IOC sources, detection logic |
| [ADR-001: Go Engine](adr/001-go-detection-engine.md) | Why Go for detection (vs Python, Rust, Node) |
| [ADR-002: Redis Streams](adr/002-redis-streams-over-kafka.md) | Why Redis Streams (vs Kafka, RabbitMQ, NATS) |
| [Runbook: High FP Rate](runbooks/high-false-positive-rate.md) | Operational playbook for false-positive incidents |
| [Contributing](contributing.md) | How to add detection rules, PR checklist |

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Detection Engine | Go 1.22 | 221 ns/op orchestration, goroutine concurrency, zero-dep binary |
| Ingest API | Node.js 20, Express, ws | WebSocket native support, Zod type-safe validation |
| SOC Dashboard | Next.js 14, Three.js, D3.js | App Router, WebGL globe, force graph, SSR-safe lazy loading |
| Message Bus | Redis Streams 7.2 | Already in-stack for cache, <1ms XADD, consumer groups |
| Time-Series DB | TimescaleDB (PostgreSQL 16) | Hypertables, automatic retention, continuous aggregates |
| Malware Scan | ClamAV (INSTREAM TCP) | Open-source, no rate limits, sub-15ms local scan |
| Hash Intel | VirusTotal v3 API | 70+ AV engines, multi-verdict aggregation |
| IP Reputation | AbuseIPDB v2 API | Confidence score 0–100, Redis-cached (50k entries, 1h TTL) |
| Tracing | OpenTelemetry | Vendor-neutral, spans on every detection call |
| CI/CD | GitHub Actions | lint → test → build → trivy → ZAP → docs deploy |
| Documentation | mkdocs-material | Dark theme, mermaid2, search, git-revision-date |
