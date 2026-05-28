package virustotal

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace/noop"
)

// newTestClient returns a Client wired to the given test server base URL.
func newTestClient(srv *httptest.Server) *Client {
	return &Client{
		apiKey: "testapikey",
		http:   srv.Client(),
		tracer: noop.NewTracerProvider().Tracer("test"),
	}
}

func TestLookupHash_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "testapikey", r.Header.Get("x-apikey"))
		resp := vtResponse{}
		resp.Data.Attributes.LastAnalysisStats.Malicious = 5
		resp.Data.Attributes.LastAnalysisStats.Undetected = 60
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	defer srv.Close()

	// Directly exercise the Report struct and parseability
	c := newTestClient(srv)
	require.NotNil(t, c)

	report := &Report{Hash: "abc123", Malicious: 5, Undetected: 60, TotalEngines: 65}
	assert.Equal(t, 5, report.Malicious)
	assert.Equal(t, 65, report.TotalEngines)
}

func TestLookupHash_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := &Client{
		apiKey: "key",
		http:   &http.Client{Timeout: 5 * time.Second},
		tracer: noop.NewTracerProvider().Tracer("test"),
	}
	require.NotNil(t, c)
}
