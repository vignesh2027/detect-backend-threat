// Command detector runs the threat detection engine service.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/vignesh2027/detect-backend-threat/internal/abuseipdb"
	"github.com/vignesh2027/detect-backend-threat/internal/cache"
	"github.com/vignesh2027/detect-backend-threat/internal/clamav"
	"github.com/vignesh2027/detect-backend-threat/internal/detector"
	internalOtel "github.com/vignesh2027/detect-backend-threat/internal/otel"
	"github.com/vignesh2027/detect-backend-threat/internal/virustotal"
)

func main() {
	ctx := context.Background()

	tracer, shutdown, err := internalOtel.InitTracer(ctx)
	if err != nil {
		log.Fatalf("otel init: %v", err)
	}
	defer shutdown(ctx)

	redisAddr := getEnv("REDIS_ADDR", "redis:6379")
	redisCache := cache.NewClient(redisAddr, time.Hour)
	if err := redisCache.Ping(ctx); err != nil {
		log.Printf("warn: redis ping failed: %v — caching disabled", err)
	}

	clamAddr := getEnv("CLAMAV_ADDR", "clamav:3310")
	clamClient := clamav.NewClient(clamAddr, 10*time.Second, tracer)

	vtKey := mustEnv("VIRUSTOTAL_API_KEY")
	vtClient := virustotal.NewClient(vtKey, 15*time.Second, tracer)

	abuseKey := mustEnv("ABUSEIPDB_API_KEY")
	abuseClient := abuseipdb.NewClient(abuseKey, 10*time.Second, redisCache, tracer)

	engine := detector.NewEngine(clamClient, vtClient, abuseClient, tracer)

	// Scan a test event on startup to verify wiring if TEST_IP is set.
	testEvent := detector.Event{
		SourceIP:  os.Getenv("TEST_IP"),
		Timestamp: time.Now().UTC(),
	}
	if testEvent.SourceIP != "" {
		result, err := engine.Detect(ctx, testEvent)
		if err != nil {
			log.Printf("detect error: %v", err)
		} else {
			fmt.Printf("verdict=%s severity=%s tactic=%s\n",
				result.Verdict, result.Severity, result.MitreTactic)
		}
	}

	log.Println("detector: ready — consuming from threats:stream")
	select {} // block; Phase 2 will add Redis Streams consumer loop here
}

// getEnv returns the env var value or fallback if unset.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// mustEnv returns the env var value or fatals if unset.
func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required env var %s is not set", key)
	}
	return v
}
