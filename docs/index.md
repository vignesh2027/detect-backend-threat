# detect-backend-threat

**Production-grade cybersecurity threat detection platform** — real-time ingestion, multi-engine analysis, and SOC visualization.

## Overview

`detect-backend-threat` ingests security events at high throughput, runs them through ClamAV, VirusTotal, and AbuseIPDB in parallel, persists findings in TimescaleDB, and streams live threat intelligence to a Three.js WebGL SOC dashboard — all in under **221 ns/op** detection overhead.

## Quick Start

```bash
git clone https://github.com/vignesh2027/detect-backend-threat
cd detect-backend-threat
cp .env.example .env          # fill in POSTGRES_PASSWORD, API keys
make dev                      # docker compose up --build
```

Services start at:

| Service   | URL                         |
|-----------|-----------------------------|
| Dashboard | http://localhost:3000       |
| Ingest    | http://localhost:4000       |
| Postgres  | localhost:5432              |
| Redis     | localhost:6379              |

## Features

- **Go detection engine** — ClamAV INSTREAM, VirusTotal v3, AbuseIPDB v2 with Redis LRU cache (50k entries, 1h TTL)
- **Node.js ingest** — WebSocket + REST, Zod validation, Redis Streams publisher, token-bucket rate limiter
- **TimescaleDB** — hypertable partitioned events, 7-day retention, continuous aggregate per-minute summaries
- **SOC dashboard** — Three.js WebGL globe (500 arcs @ 60fps), D3 force-directed threat graph, react-virtual event feed (100k+ rows)
- **OpenTelemetry** — distributed tracing on every detection call
- **MITRE ATT&CK** — tactic tagging on every event, 8 techniques covered

See [Architecture](architecture.md) for the full system design.
