# Configuration Reference

All configuration is managed through environment variables. No config files, no YAML — 12-factor app compliant.

Copy `.env.example` to `.env` to get started:

```bash
cp .env.example .env
```

---

## Required Variables

These must be set before `make dev` will work. The Docker Compose file will fail with a clear error message if any are missing.

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `POSTGRES_PASSWORD` | PostgreSQL password | Generate with `openssl rand -base64 32` |
| `VIRUSTOTAL_API_KEY` | VirusTotal v3 API key | Free tier at [virustotal.com/gui/join-us](https://www.virustotal.com/gui/join-us) — 4 req/min |
| `ABUSEIPDB_API_KEY` | AbuseIPDB v2 API key | Free tier at [abuseipdb.com/register](https://www.abuseipdb.com/register) — 1000 req/day |

!!! danger "Never commit `.env`"
    `.env` is in `.gitignore`. Real API keys must never appear in git history.
    If you accidentally commit a key, rotate it immediately at the provider.

---

## PostgreSQL

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | `threats` | Database name created on first start |
| `POSTGRES_USER` | `threats` | Database user |
| `POSTGRES_PASSWORD` | *(required)* | Database password |
| `POSTGRES_PORT` | `5432` | Host port to expose PostgreSQL on |

**Connect manually:**

```bash
psql -h localhost -U threats -d threats
# or via Docker:
docker exec -it threat_postgres psql -U threats -d threats
```

**Useful queries:**

```sql
-- Recent events by severity
SELECT timestamp, source_ip, severity, verdict, mitre_tactic
FROM events
WHERE timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 50;

-- Per-minute threat summary (continuous aggregate)
SELECT bucket, severity, event_count, unique_ips
FROM threat_summary_1m
WHERE bucket > NOW() - INTERVAL '1 hour'
ORDER BY bucket DESC;

-- Top attacking IPs (last 24h)
SELECT source_ip, COUNT(*) as hits, MAX(severity) as max_severity
FROM events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY source_ip
ORDER BY hits DESC
LIMIT 20;
```

---

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ADDR` | `redis:6379` | Redis address used by ingest + detector + dashboard (host:port) |
| `REDIS_PORT` | `6379` | Host port to expose Redis on |

**Redis is used for two separate purposes:**

1. **AbuseIPDB cache** — LRU, 50,000 entries max, 1-hour TTL per key  
   Key format: `abuseipdb:<ip_address>`

2. **Threats stream** — Redis Streams key `threats:stream`  
   Written by: ingest service (`XADD`)  
   Read by: detector service + dashboard WebSocket route (`XREAD BLOCK`)

**Inspect the stream:**

```bash
redis-cli XLEN threats:stream         # how many entries
redis-cli XREVRANGE threats:stream + - COUNT 5  # last 5 entries
redis-cli XINFO STREAM threats:stream  # stream metadata
```

**Memory configuration** (set in docker-compose.yml):

```
maxmemory 256mb
maxmemory-policy allkeys-lru
```

---

## ClamAV

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAMAV_ADDR` | `clamav:3310` | ClamAV daemon TCP address (host:port) |
| `CLAMAV_PORT` | `3310` | Host port to expose clamd on |

!!! warning "First-start delay"
    ClamAV downloads its signature database on first start (~200MB). The healthcheck has a 120-second `start_period` to accommodate this. Subsequent starts use the cached `clamav_db` volume.

**Test ClamAV manually:**

```bash
# Check daemon status
docker exec threat_clamav clamdcheck.sh

# Scan the EICAR test string (safe, industry-standard malware test)
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' \
  | docker exec -i threat_clamav clamscan -

# Expected: Eicar-Test-Signature FOUND
```

---

## Ingest Service

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Port the ingest HTTP server listens on |
| `INGEST_PORT` | `4000` | Host port to expose ingest on |
| `NODE_ENV` | `production` | Node.js environment |

---

## Detector Service

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ADDR` | `redis:6379` | Redis connection for AbuseIPDB cache |
| `CLAMAV_ADDR` | `clamav:3310` | ClamAV daemon TCP connection |
| `VIRUSTOTAL_API_KEY` | *(required)* | VirusTotal v3 API key |
| `ABUSEIPDB_API_KEY` | *(required)* | AbuseIPDB v2 API key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(stdout)* | OTLP endpoint for traces |
| `TEST_IP` | *(empty)* | If set, runs a detection against this IP on startup to verify wiring |

---

## Dashboard

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ADDR` | `redis:6379` | Redis connection for Streams fan-out |
| `DASHBOARD_PORT` | `3000` | Host port to expose dashboard on |
| `NODE_ENV` | `production` | Next.js environment |

---

## OpenTelemetry

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(empty = stdout)* | OTLP gRPC endpoint, e.g. `http://jaeger:4317` |

**Export to Jaeger:**

```yaml
# Add to docker-compose.yml services:
jaeger:
  image: jaegertracing/all-in-one:1.56
  ports:
    - "16686:16686"   # UI
    - "4317:4317"     # OTLP gRPC
```

```env
OTEL_ENDPOINT=http://jaeger:4317
```

**Export to Grafana Tempo:**

```env
OTEL_ENDPOINT=http://tempo:4317
```

---

## Full `.env.example`

```env
# ── PostgreSQL ──────────────────────────────────────────────────────────────
POSTGRES_DB=threats
POSTGRES_USER=threats
POSTGRES_PASSWORD=changeme_in_production
POSTGRES_PORT=5432

# ── Redis ───────────────────────────────────────────────────────────────────
REDIS_ADDR=redis:6379
REDIS_PORT=6379

# ── ClamAV ──────────────────────────────────────────────────────────────────
CLAMAV_ADDR=clamav:3310
CLAMAV_PORT=3310

# ── Ingest Service ──────────────────────────────────────────────────────────
INGEST_PORT=4000
PORT=4000

# ── Dashboard ───────────────────────────────────────────────────────────────
DASHBOARD_PORT=3000

# ── API Keys (NEVER commit real values) ─────────────────────────────────────
VIRUSTOTAL_API_KEY=your_virustotal_v3_api_key_here
ABUSEIPDB_API_KEY=your_abuseipdb_v2_api_key_here

# ── OpenTelemetry (leave empty for stdout exporter) ─────────────────────────
OTEL_ENDPOINT=

# ── Dev Helpers ─────────────────────────────────────────────────────────────
TEST_IP=   # set to an IP to run detection test on startup
```
