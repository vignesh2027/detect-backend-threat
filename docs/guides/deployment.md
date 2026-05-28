# Deployment Guide

---

## Docker Compose (Development & Staging)

The fastest path — all 6 services in one command.

```bash
cp .env.example .env   # fill in POSTGRES_PASSWORD + API keys
make dev               # docker compose up --build
```

**Service startup order** (enforced by `depends_on` + healthchecks):

```
redis ──────────────────────────────────┐
                                        ├── ingest (ready ~5s)
postgres + redis + clamav (ready ~90s) ─┼── detector (ready ~95s)
redis ──────────────────────────────────┘── dashboard (ready ~30s)
```

ClamAV is the slowest to start (signature download on first run — ~2 minutes). All other services wait for their dependencies to be healthy before starting.

---

## Production Checklist

Before exposing to real traffic, work through this checklist:

### Security

- [ ] **Rotate `POSTGRES_PASSWORD`** — use `openssl rand -base64 32`
- [ ] **Add a reverse proxy** (Nginx / Caddy) in front of ingest (:4000) and dashboard (:3000) — they have no TLS or auth built in
- [ ] **Add API key auth to ingest** — the current implementation trusts all clients. For public exposure, add a middleware that checks `Authorization: Bearer <token>`
- [ ] **Separate Redis instances** — use one Redis for the LRU cache (can lose data) and a separate one for Streams (enable AOF persistence)
- [ ] **Pin image versions** — change `clamav/clamav:stable` to a specific version like `clamav/clamav:1.3.1`
- [ ] **Review Trivy scan** — run `make trivy` and address any CRITICAL CVEs before deploying

### Reliability

- [ ] **Enable Redis AOF** for the Streams instance (`appendonly yes` in redis.conf)
- [ ] **Set up TimescaleDB backups** — `pg_dump` cron or use TimescaleDB cloud
- [ ] **Configure alerting** on detector container restarts
- [ ] **Test the retention policy** — verify chunks older than 7 days are being dropped

### Observability

- [ ] **Point OTEL_ENDPOINT** to a real collector (Jaeger, Grafana Tempo, Honeycomb)
- [ ] **Set up Grafana** dashboards for `threat_summary_1m` continuous aggregate
- [ ] **Configure log aggregation** (Loki, Datadog) for all container logs

### Rate Limits

- [ ] **VirusTotal free tier**: 4 requests/minute — add a queue or upgrade to premium
- [ ] **AbuseIPDB free tier**: 1000 requests/day — the Redis cache reduces this significantly

---

## Nginx Reverse Proxy Example

```nginx
# /etc/nginx/conf.d/detect-backend-threat.conf

server {
    listen 443 ssl;
    server_name soc.yourdomain.com;

    ssl_certificate     /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    # Dashboard
    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }

    # Ingest WebSocket
    location /ws/ {
        proxy_pass         http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }

    # Ingest REST
    location /api/events {
        proxy_pass http://localhost:4000/events;

        # Basic API key auth (replace with proper auth)
        if ($http_authorization != "Bearer your-secret-key") {
            return 401;
        }
    }
}
```

---

## Environment-Specific Configuration

### Development

```env
POSTGRES_PASSWORD=dev_password_ok_here
VIRUSTOTAL_API_KEY=your_key
ABUSEIPDB_API_KEY=your_key
```

### Staging

```env
POSTGRES_PASSWORD=<strong random>
VIRUSTOTAL_API_KEY=<staging key>
ABUSEIPDB_API_KEY=<staging key>
OTEL_ENDPOINT=http://jaeger-staging:4317
```

### Production

```env
POSTGRES_PASSWORD=<32+ char random>
VIRUSTOTAL_API_KEY=<production key — premium recommended>
ABUSEIPDB_API_KEY=<production key>
OTEL_ENDPOINT=http://otel-collector:4317
```

---

## Scaling Notes

### Ingest (Horizontal)

The ingest service is stateless — multiple replicas can publish to the same Redis Stream. Add a load balancer:

```yaml
# In docker-compose.yml or Kubernetes:
deploy:
  replicas: 3
```

### Detector (Horizontal via Consumer Groups)

Phase 1 uses a simple `XREAD BLOCK` loop. To scale horizontally, upgrade to Redis consumer groups (`XREADGROUP`):

```go
// Phase 4 target — multiple detector instances, each processing different messages
redis.XReadGroup(ctx, &redis.XReadGroupArgs{
    Group:    "detectors",
    Consumer: instanceID,
    Streams:  []string{"threats:stream", ">"},
    Count:    50,
    Block:    5 * time.Second,
})
```

### TimescaleDB (Read Replicas)

Dashboard queries can hit a read replica to offload the primary:

```yaml
postgres-replica:
  image: timescale/timescaledb:latest-pg16
  environment:
    POSTGRES_REPLICA: "true"
    PRIMARY_HOST: postgres
```

---

## Kubernetes (Planned — Phase 6)

Helm chart and manifests are planned. The services are ready:

- All config via environment variables ✅
- Health endpoints on all services ✅
- Graceful shutdown on SIGTERM ✅
- No local filesystem state (except ClamAV signatures — use a PVC) ✅

Track progress: [github.com/vignesh2027/detect-backend-threat/issues](https://github.com/vignesh2027/detect-backend-threat/issues)
