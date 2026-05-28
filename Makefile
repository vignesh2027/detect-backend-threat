.PHONY: dev docker-up docker-down build test bench lint clean check-env

GO_PACKAGES := ./...

# Start all services with live rebuild
dev:
	docker compose up --build

# Start all services detached
docker-up:
	docker compose up -d --build

# Tear down and remove volumes
docker-down:
	docker compose down -v

# Build Go binary + Node bundles
build:
	go build -o bin/detector ./cmd/detector
	cd apps/ingest     && npm run build
	cd apps/dashboard  && npm run build

# Run all tests (Go + Node)
test:
	go test -v -race -count=1 $(GO_PACKAGES)
	cd apps/ingest     && npm test
	cd apps/dashboard  && npm test

# Run detection engine benchmark — target p99 < 50ms
bench:
	go test -bench=BenchmarkDetect -benchmem -benchtime=5s ./internal/detector/...

# Lint Go and TypeScript
lint:
	go vet $(GO_PACKAGES)
	@which golangci-lint > /dev/null 2>&1 \
		&& golangci-lint run \
		|| echo "golangci-lint not installed — skipping extended linting"
	cd apps/ingest     && npm run lint 2>/dev/null || true
	cd apps/dashboard  && npm run lint 2>/dev/null || true

# Remove build artifacts
clean:
	rm -rf bin/ apps/ingest/dist/ apps/ingest/node_modules/ \
	       apps/dashboard/.next/ apps/dashboard/node_modules/
	docker compose down -v --remove-orphans

# Start dashboard only (dev mode, needs local Redis on :6379)
dev-dashboard:
	cd apps/dashboard && npm run dev

# Ensure .env exists before running docker compose
check-env:
	@test -f .env || (echo "ERROR: .env not found. Copy .env.example and fill in values." && exit 1)
