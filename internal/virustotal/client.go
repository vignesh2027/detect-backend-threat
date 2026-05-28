// Package virustotal provides hash lookup via the VirusTotal v3 API.
package virustotal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.opentelemetry.io/otel/trace"
)

const baseURL = "https://www.virustotal.com/api/v3"

// Report contains aggregated scan results from VirusTotal.
type Report struct {
	Hash         string
	Malicious    int
	Suspicious   int
	Undetected   int
	TotalEngines int
	Permalink    string
}

// Client calls the VirusTotal v3 API.
type Client struct {
	apiKey string
	http   *http.Client
	tracer trace.Tracer
}

// NewClient creates a VirusTotal client. apiKey must not be empty.
func NewClient(apiKey string, timeout time.Duration, tracer trace.Tracer) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: timeout},
		tracer: tracer,
	}
}

type vtResponse struct {
	Data struct {
		Attributes struct {
			LastAnalysisStats struct {
				Malicious  int `json:"malicious"`
				Suspicious int `json:"suspicious"`
				Undetected int `json:"undetected"`
				Harmless   int `json:"harmless"`
			} `json:"last_analysis_stats"`
			Links struct {
				Self string `json:"self"`
			} `json:"links"`
		} `json:"attributes"`
	} `json:"data"`
}

// LookupHash queries VirusTotal for a file hash (MD5 or SHA256).
func (c *Client) LookupHash(ctx context.Context, hash string) (*Report, error) {
	ctx, span := c.tracer.Start(ctx, "virustotal.LookupHash")
	defer span.End()

	url := fmt.Sprintf("%s/files/%s", baseURL, hash)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("virustotal: build request: %w", err)
	}
	req.Header.Set("x-apikey", c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("virustotal: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("virustotal: hash %s not found", hash)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("virustotal: unexpected status %d", resp.StatusCode)
	}

	var vtr vtResponse
	if err := json.NewDecoder(resp.Body).Decode(&vtr); err != nil {
		return nil, fmt.Errorf("virustotal: decode response: %w", err)
	}

	stats := vtr.Data.Attributes.LastAnalysisStats
	total := stats.Malicious + stats.Suspicious + stats.Undetected + stats.Harmless
	return &Report{
		Hash:         hash,
		Malicious:    stats.Malicious,
		Suspicious:   stats.Suspicious,
		Undetected:   stats.Undetected,
		TotalEngines: total,
		Permalink:    vtr.Data.Attributes.Links.Self,
	}, nil
}
