# Development Guide

Complete guide for setting up a local development environment, running tests, adding new detection engines, and debugging the full stack.

---

## Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Docker Desktop | latest | [docker.com/get-started](https://docker.com/get-started) |
| Go | 1.22 | [go.dev/dl](https://go.dev/dl) |
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| golangci-lint | 1.58 | `brew install golangci-lint` |

---

## First-Time Setup

```bash
# 1. Clone the repo
git clone https://github.com/vignesh2027/detect-backend-threat
cd detect-backend-threat

# 2. Create your .env file
cp .env.example .env
# Open .env and fill in:
#   POSTGRES_PASSWORD  (any strong password)
#   VIRUSTOTAL_API_KEY (free at virustotal.com)
#   ABUSEIPDB_API_KEY  (free at abuseipdb.com)

# 3. Start all services
make dev
# Wait ~60 seconds for ClamAV to download signatures on first run

# 4. Verify everything is healthy
curl http://localhost:4000/health
# {"status":"ok","ts":"..."}

curl http://localhost:3000/api/health
# {"status":"ok","ts":"..."}
```

---

## Running Tests

### All Tests

```bash
make test
# Runs: go test ./... + jest (ingest) + jest (dashboard)
```

### Go Tests Only

```bash
# All packages, with race detector
go test -v -race -count=1 ./...

# Single package
go test -v ./internal/detector/...

# With coverage report (opens in browser)
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**Current test coverage:**

| Package | Tests | Coverage |
|---------|-------|----------|
| `internal/abuseipdb` | `TestScoreToSeverity` (8 cases) | 100% |
| `internal/clamav` | `TestParseResponse_*` (3 cases) | 100% |
| `internal/detector` | `TestComputeSeverity_*`, `TestInferMitreTactic`, `TestDetect_NilScanners` (6 cases) | ~90% |
| `internal/virustotal` | `TestLookupHash_*` (2 cases) | ~70% |

### Running the Benchmark

```bash
make bench

# Expected output:
# BenchmarkDetect-8   24887762   221.2 ns/op   304 B/op   3 allocs/op
```

The benchmark runs `BenchmarkDetect` for 5 seconds with `nil` scanners to isolate orchestration overhead. This is intentional — network latency is not interesting to benchmark in unit tests.

### Node.js Tests

```bash
# Ingest
cd apps/ingest && npm test

# Dashboard
cd apps/dashboard && npm test
```

---

## Developing Each Service Independently

### Go Detector (without Docker)

```bash
# Start only infrastructure
docker compose up -d postgres redis clamav

# Set env vars locally
export REDIS_ADDR=localhost:6379
export CLAMAV_ADDR=localhost:3310
export VIRUSTOTAL_API_KEY=your_key
export ABUSEIPDB_API_KEY=your_key

# Run detector
go run ./cmd/detector

# Or build first
go build -o bin/detector ./cmd/detector
./bin/detector
```

### Node.js Ingest (without Docker)

```bash
# Start only Redis
docker compose up -d redis

# Install and run
cd apps/ingest
npm install
export REDIS_ADDR=localhost:6379
npm run dev   # ts-node watch mode
```

### Next.js Dashboard (without Docker)

```bash
# Start only Redis
docker compose up -d redis

cd apps/dashboard
npm install
export REDIS_ADDR=localhost:6379
npm run dev   # next dev -p 3000 with HMR
```

---

## Adding a New Detection Scanner

Follow this pattern to add a new threat intelligence source (e.g. Shodan, GreyNoise, custom blocklist).

### Step 1 — Create the client package

```bash
mkdir internal/greynoise
touch internal/greynoise/client.go
touch internal/greynoise/client_test.go
```

**`internal/greynoise/client.go`:**

```go
// Package greynoise provides IP classification via the GreyNoise API.
package greynoise

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"

    "go.opentelemetry.io/otel/trace"
)

// Classification describes GreyNoise's verdict for an IP.
type Classification struct {
    IP             string
    Noise          bool   // true = internet background noise (scanners, etc.)
    Riot           bool   // true = known-benign (Cloudflare, Google, etc.)
    Classification string // "malicious" | "benign" | "unknown"
}

// Client calls the GreyNoise Community API.
type Client struct {
    apiKey string
    http   *http.Client
    tracer trace.Tracer
}

// NewClient creates a GreyNoise client.
func NewClient(apiKey string, timeout time.Duration, tracer trace.Tracer) *Client {
    return &Client{
        apiKey: apiKey,
        http:   &http.Client{Timeout: timeout},
        tracer: tracer,
    }
}

// ClassifyIP returns GreyNoise's classification for the given IP.
func (c *Client) ClassifyIP(ctx context.Context, ip string) (*Classification, error) {
    ctx, span := c.tracer.Start(ctx, "greynoise.ClassifyIP")
    defer span.End()

    req, err := http.NewRequestWithContext(
        ctx, http.MethodGet,
        fmt.Sprintf("https://api.greynoise.io/v3/community/%s", ip),
        nil,
    )
    if err != nil {
        return nil, fmt.Errorf("greynoise: build request: %w", err)
    }
    req.Header.Set("key", c.apiKey)
    req.Header.Set("Accept", "application/json")

    resp, err := c.http.Do(req)
    if err != nil {
        return nil, fmt.Errorf("greynoise: request: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode == http.StatusNotFound {
        return &Classification{IP: ip, Classification: "unknown"}, nil
    }
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("greynoise: status %d for ip %s", resp.StatusCode, ip)
    }

    var result Classification
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, fmt.Errorf("greynoise: decode: %w", err)
    }
    return &result, nil
}
```

### Step 2 — Write tests

```go
// internal/greynoise/client_test.go
package greynoise

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestClassification_Benign(t *testing.T) {
    c := &Classification{IP: "8.8.8.8", Riot: true, Classification: "benign"}
    assert.True(t, c.Riot)
    assert.Equal(t, "benign", c.Classification)
}
```

### Step 3 — Wire into the Engine

**`internal/detector/engine.go`** — add the field:

```go
type Engine struct {
    clam       *clamav.Client
    vt         *virustotal.Client
    abuse      *abuseipdb.Client
    greynoise  *greynoise.Client   // ← add
    tracer     trace.Tracer
}

func NewEngine(
    clamClient  *clamav.Client,
    vtClient    *virustotal.Client,
    abuseClient *abuseipdb.Client,
    gnClient    *greynoise.Client,   // ← add
    tracer      trace.Tracer,
) *Engine {
    return &Engine{..., greynoise: gnClient}
}
```

Add detection logic in `Detect()`:

```go
// GreyNoise classification
if event.SourceIP != "" && e.greynoise != nil {
    cls, err := e.greynoise.ClassifyIP(ctx, event.SourceIP)
    if err == nil && cls.Classification == "malicious" {
        result.Severity = escalate(result.Severity, SeverityHigh)
    }
}
```

### Step 4 — Update `cmd/detector/main.go`

```go
gnKey := getEnv("GREYNOISE_API_KEY", "")
var gnClient *greynoise.Client
if gnKey != "" {
    gnClient = greynoise.NewClient(gnKey, 10*time.Second, tracer)
}

engine := detector.NewEngine(clamClient, vtClient, abuseClient, gnClient, tracer)
```

### Step 5 — Add to `.env.example`

```env
GREYNOISE_API_KEY=your_greynoise_api_key_here
```

### Step 6 — Verify

```bash
make test    # all tests must pass
make bench   # benchmark must not degrade > 5%
```

---

## Debugging

### Inspect Redis Streams

```bash
# How many events in the stream
redis-cli -h localhost XLEN threats:stream

# Read the last 10 entries
redis-cli -h localhost XREVRANGE threats:stream + - COUNT 10

# Watch new entries in real-time
redis-cli -h localhost XREAD BLOCK 0 COUNT 1 STREAMS threats:stream $
```

### Inspect TimescaleDB

```bash
docker exec -it threat_postgres psql -U threats -d threats

-- Recent events
SELECT timestamp, source_ip, severity, verdict FROM events
ORDER BY timestamp DESC LIMIT 10;

-- Check hypertable chunks
SELECT chunk_name, range_start, range_end
FROM timescaledb_information.chunks
WHERE hypertable_name = 'events'
ORDER BY range_start DESC;

-- Verify retention policy
SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';
```

### View OpenTelemetry Traces

By default, traces are printed to stdout (detector container logs):

```bash
docker logs threat_detector --follow
```

For a proper trace UI, add Jaeger to docker-compose.yml (see [Configuration](../reference/configuration.md#opentelemetry)).

### Common Issues

??? question "ClamAV healthcheck is failing for > 2 minutes"
    ClamAV downloads its signature database (~200MB) on first run. This is normal.
    Check progress: `docker logs threat_clamav --follow`
    Look for: `Loaded 8 million+ signatures.`

??? question "`VIRUSTOTAL_API_KEY is required` error on startup"
    The detector binary will `log.Fatalf` if either API key is missing.
    Make sure your `.env` file has both keys and that `docker compose` is reading it:
    `docker compose config | grep VIRUSTOTAL`

??? question "Dashboard shows no events"
    1. Check Redis stream has data: `redis-cli XLEN threats:stream`
    2. If 0 — send a test event: `curl -X POST http://localhost:4000/events -H 'Content-Type: application/json' -d '{"source_ip":"1.2.3.4","event_type":"http_request"}'`
    3. Check WebSocket connection in browser DevTools → Network → WS

??? question "`npm ci` fails in CI"
    Make sure `package-lock.json` is committed. Run `npm install` locally and commit the lock file.
