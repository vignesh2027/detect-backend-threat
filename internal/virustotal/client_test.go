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

func TestReport_MaliciousRatio(t *testing.T) {
	cases := []struct {
		malicious  int
		total      int
		expectHigh bool
	}{
		{0, 70, false},
		{1, 70, true},
		{5, 70, true},
		{70, 70, true},
	}
	for _, tc := range cases {
		r := &Report{Malicious: tc.malicious, TotalEngines: tc.total}
		isHigh := r.Malicious > 0
		assert.Equal(t, tc.expectHigh, isHigh, "malicious=%d total=%d", tc.malicious, tc.total)
	}
}

func TestReport_Fields(t *testing.T) {
	r := &Report{
		Hash:         "d41d8cd98f00b204e9800998ecf8427e",
		Malicious:    3,
		Suspicious:   2,
		Undetected:   65,
		TotalEngines: 70,
		Permalink:    "https://www.virustotal.com/gui/file/d41d8cd98f00b204e9800998ecf8427e",
	}
	assert.Equal(t, "d41d8cd98f00b204e9800998ecf8427e", r.Hash)
	assert.Equal(t, 3, r.Malicious)
	assert.Equal(t, 70, r.TotalEngines)
	assert.Contains(t, r.Permalink, "virustotal.com")
}

func TestNewClient(t *testing.T) {
	tracer := noop.NewTracerProvider().Tracer("test")
	c := NewClient("mykey", 10*time.Second, tracer)
	require.NotNil(t, c)
	assert.Equal(t, "mykey", c.apiKey)
}
