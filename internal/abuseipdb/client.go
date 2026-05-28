// Package abuseipdb provides IP reputation checks via the AbuseIPDB v2 API with Redis caching.
package abuseipdb

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"go.opentelemetry.io/otel/trace"

	"github.com/vignesh2027/detect-backend-threat/internal/cache"
)

const abuseIPDBURL = "https://api.abuseipdb.com/api/v2/check"

// IPReport summarises the reputation of an IP address.
type IPReport struct {
	IP           string
	AbuseScore   int
	TotalReports int
	IsPublic     bool
	CountryCode  string
}

// Client queries AbuseIPDB and caches results in Redis.
type Client struct {
	apiKey string
	http   *http.Client
	cache  *cache.Client
	tracer trace.Tracer
}

// NewClient creates an AbuseIPDB client. cache may be nil (disables caching).
func NewClient(apiKey string, timeout time.Duration, redisCache *cache.Client, tracer trace.Tracer) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: timeout},
		cache:  redisCache,
		tracer: tracer,
	}
}

type abuseResponse struct {
	Data struct {
		IPAddress            string `json:"ipAddress"`
		AbuseConfidenceScore int    `json:"abuseConfidenceScore"`
		TotalReports         int    `json:"totalReports"`
		IsPublic             bool   `json:"isPublic"`
		CountryCode          string `json:"countryCode"`
	} `json:"data"`
}

// CheckIP returns the reputation score for an IP, using Redis cache when available.
func (c *Client) CheckIP(ctx context.Context, ip string) (*IPReport, error) {
	ctx, span := c.tracer.Start(ctx, "abuseipdb.CheckIP")
	defer span.End()

	cacheKey := "abuseipdb:" + ip
	if c.cache != nil {
		if cached, ok := c.cache.Get(ctx, cacheKey); ok {
			var report IPReport
			if err := json.Unmarshal([]byte(cached), &report); err == nil {
				return &report, nil
			}
		}
	}

	params := url.Values{}
	params.Set("ipAddress", ip)
	params.Set("maxAgeInDays", "90")
	params.Set("verbose", "false")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, abuseIPDBURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("abuseipdb: build request: %w", err)
	}
	req.Header.Set("Key", c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("abuseipdb: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("abuseipdb: status %d for ip %s", resp.StatusCode, ip)
	}

	var ar abuseResponse
	if err := json.NewDecoder(resp.Body).Decode(&ar); err != nil {
		return nil, fmt.Errorf("abuseipdb: decode: %w", err)
	}

	report := &IPReport{
		IP:           ar.Data.IPAddress,
		AbuseScore:   ar.Data.AbuseConfidenceScore,
		TotalReports: ar.Data.TotalReports,
		IsPublic:     ar.Data.IsPublic,
		CountryCode:  ar.Data.CountryCode,
	}

	if c.cache != nil {
		if b, err := json.Marshal(report); err == nil {
			_ = c.cache.Set(ctx, cacheKey, string(b))
		}
	}

	return report, nil
}

// ScoreToSeverity maps an AbuseIPDB score to a human-readable severity label.
func ScoreToSeverity(score int) string {
	switch {
	case score >= 80:
		return "critical"
	case score >= 50:
		return "high"
	case score >= 20:
		return "medium"
	default:
		return "low"
	}
}
