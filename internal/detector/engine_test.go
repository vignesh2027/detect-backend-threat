package detector

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace/noop"

	"github.com/vignesh2027/detect-backend-threat/internal/abuseipdb"
	"github.com/vignesh2027/detect-backend-threat/internal/clamav"
	"github.com/vignesh2027/detect-backend-threat/internal/virustotal"
)

func newTestEngine() *Engine {
	tracer := noop.NewTracerProvider().Tracer("test")
	return NewEngine(nil, nil, nil, tracer)
}

func TestComputeSeverity_Clean(t *testing.T) {
	e := newTestEngine()
	r := &Result{
		ClamVerdict: &clamav.Verdict{Clean: true},
	}
	assert.Equal(t, SeverityLow, e.computeSeverity(r))
}

func TestComputeSeverity_ClamMalware(t *testing.T) {
	e := newTestEngine()
	r := &Result{
		ClamVerdict: &clamav.Verdict{Clean: false, Signature: "EICAR"},
	}
	assert.Equal(t, SeverityCritical, e.computeSeverity(r))
}

func TestComputeSeverity_VTMalicious(t *testing.T) {
	e := newTestEngine()
	r := &Result{
		VTReport: &virustotal.Report{Malicious: 12},
	}
	assert.Equal(t, SeverityCritical, e.computeSeverity(r))
}

func TestComputeSeverity_AbuseHighScore(t *testing.T) {
	e := newTestEngine()
	r := &Result{
		IPReport: &abuseipdb.IPReport{AbuseScore: 85},
	}
	assert.Equal(t, SeverityCritical, e.computeSeverity(r))
}

func TestInferMitreTactic(t *testing.T) {
	e := newTestEngine()

	r1 := &Result{ClamVerdict: &clamav.Verdict{Clean: false}}
	assert.Equal(t, "TA0002", e.inferMitreTactic(r1))

	r2 := &Result{VTReport: &virustotal.Report{Malicious: 1}}
	assert.Equal(t, "TA0001", e.inferMitreTactic(r2))

	r3 := &Result{IPReport: &abuseipdb.IPReport{AbuseScore: 70}}
	assert.Equal(t, "TA0011", e.inferMitreTactic(r3))

	r4 := &Result{}
	assert.Equal(t, "TA0043", e.inferMitreTactic(r4))
}

func TestDetect_NilScanners(t *testing.T) {
	e := newTestEngine()
	event := Event{
		SourceIP:  "192.168.1.1",
		Timestamp: time.Now(),
	}
	result, err := e.Detect(context.Background(), event)
	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, SeverityLow, result.Severity)
}

// BenchmarkDetect measures detection engine overhead with nil scanners.
// Target: p99 < 50ms. With nil scanners this should be sub-microsecond.
func BenchmarkDetect(b *testing.B) {
	e := newTestEngine()
	event := Event{
		SourceIP:  "10.0.0.1",
		FileHash:  "d41d8cd98f00b204e9800998ecf8427e",
		Timestamp: time.Now(),
	}
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Detect(ctx, event)
	}
}
