# Contributing to detect-backend-threat

Thank you for contributing. This document covers the three main contribution paths: detection rules, local development, and the PR checklist.

---

## Adding a Detection Rule

Detection logic lives in `internal/detector/engine.go`. Rules are expressed as Go code — no YAML DSL, no plugin system. This keeps them type-safe and benchmarkable.

### Rule Schema (mental model)

```
Signal source  →  threshold check  →  severity escalation  →  MITRE tactic tag
```

### Example: add a new IP range blocklist check

**1. Create the signal source** (e.g. `internal/blocklist/client.go`):

```go
package blocklist

// Client checks IPs against a local CIDR blocklist loaded from a file.
type Client struct { cidrs []*net.IPNet }

// NewClient loads CIDRs from a newline-separated file.
func NewClient(path string) (*Client, error) { ... }

// Contains returns true if ip matches any blocked CIDR.
func (c *Client) Contains(ip string) bool { ... }
```

**2. Wire it into the Engine** (`internal/detector/engine.go`):

```go
type Engine struct {
    clam      *clamav.Client
    vt        *virustotal.Client
    abuse     *abuseipdb.Client
    blocklist *blocklist.Client   // ← add field
    tracer    trace.Tracer
}
```

**3. Add detection logic in `Detect()`**:

```go
if event.SourceIP != "" && e.blocklist != nil {
    if e.blocklist.Contains(event.SourceIP) {
        result.Severity    = escalate(result.Severity, SeverityHigh)
        result.MitreTactic = "TA0001"
    }
}
```

**4. Write a test** (`internal/detector/engine_test.go`):

```go
func TestDetect_BlocklistedIP(t *testing.T) {
    bl, _ := blocklist.NewClient("testdata/blocklist.txt")
    e := NewEngine(nil, nil, nil, bl, noop.NewTracerProvider().Tracer("test"))
    result, err := e.Detect(ctx, Event{SourceIP: "10.66.0.1"})
    require.NoError(t, err)
    assert.Equal(t, SeverityHigh, result.Severity)
}
```

**5. Benchmark** — run `make bench` and confirm no regression.

---

## Running the Full Stack Locally

### Prerequisites

- Docker Desktop (or Colima) with Compose v2
- Go 1.22+ (for local Go development)
- Node.js 20+

### Steps

```bash
# 1. Clone
git clone https://github.com/vignesh2027/detect-backend-threat
cd detect-backend-threat

# 2. Configure
cp .env.example .env
# Fill in: POSTGRES_PASSWORD, VIRUSTOTAL_API_KEY, ABUSEIPDB_API_KEY

# 3. Start all services
make dev
# or: docker compose up --build

# 4. Verify
curl http://localhost:4000/health   # {"status":"ok"}
curl http://localhost:3000/api/health

# 5. Run tests
make test

# 6. Run benchmark
make bench
```

### Developing the detector locally (without Docker)

```bash
export REDIS_ADDR=localhost:6379
export CLAMAV_ADDR=localhost:3310
export VIRUSTOTAL_API_KEY=your_key
export ABUSEIPDB_API_KEY=your_key

# Start infrastructure only
docker compose up -d postgres redis clamav

# Run detector
go run ./cmd/detector
```

### Developing the dashboard locally

```bash
export REDIS_ADDR=localhost:6379
make dev-dashboard    # next dev -p 3000
```

---

## PR Checklist

Before submitting a pull request, verify every item:

- [ ] **Tests pass**: `make test` exits 0
- [ ] **Benchmark not regressed**: `make bench` — p99 must not degrade > 5% vs `main` (CI enforces this automatically)
- [ ] **`go vet` clean**: `make lint` exits 0
- [ ] **No `any` in TypeScript**: `tsconfig.json` has `"strict": true`
- [ ] **ADR added** if this is an architectural change (new dependency, new service, changed data model) — see `docs/adr/` for the format
- [ ] **Runbook updated** if this change affects operations (new error conditions, new config knobs)
- [ ] **`.env.example` updated** if new env vars are added
- [ ] **Doc comment on every exported Go symbol**
- [ ] **No secrets in code** — all API keys via environment variables

### Commit message format

```
<type>(<scope>): <short description>

<body — optional, explain WHY not WHAT>
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`  
Scopes: `detector`, `ingest`, `dashboard`, `db`, `ci`, `docs`

Example:
```
perf(detector): raise AbuseIPDB cache TTL to 2h

Reduces external API calls by ~40% for high-volume repeat IPs.
Checked against AbuseIPDB SLA — scores don't change faster than 1h in practice.
```
