// Package detector orchestrates threat detection across ClamAV, VirusTotal, and AbuseIPDB.
package detector

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/trace"

	"github.com/vignesh2027/detect-backend-threat/internal/abuseipdb"
	"github.com/vignesh2027/detect-backend-threat/internal/clamav"
	"github.com/vignesh2027/detect-backend-threat/internal/virustotal"
)

// Severity levels for detection results.
const (
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

// Event represents an ingested security event to be scanned.
type Event struct {
	SourceIP  string
	FileHash  string
	Payload   []byte
	Timestamp time.Time
}

// Result aggregates findings from all detection subsystems.
type Result struct {
	Event       Event
	ClamVerdict *clamav.Verdict
	VTReport    *virustotal.Report
	IPReport    *abuseipdb.IPReport
	Severity    string
	MitreTactic string
	Verdict     string
	DetectedAt  time.Time
}

// Engine is the central threat detection engine.
// It wires together ClamAV, VirusTotal, and AbuseIPDB scanners.
type Engine struct {
	clam   *clamav.Client
	vt     *virustotal.Client
	abuse  *abuseipdb.Client
	tracer trace.Tracer
}

// NewEngine constructs a detection engine. All dependencies are required.
func NewEngine(
	clamClient *clamav.Client,
	vtClient *virustotal.Client,
	abuseClient *abuseipdb.Client,
	tracer trace.Tracer,
) *Engine {
	return &Engine{
		clam:   clamClient,
		vt:     vtClient,
		abuse:  abuseClient,
		tracer: tracer,
	}
}

// Detect runs all available detectors against the event and returns an aggregated result.
// Individual scanner failures are tolerated; the result will reflect partial data.
func (e *Engine) Detect(ctx context.Context, event Event) (*Result, error) {
	ctx, span := e.tracer.Start(ctx, "detector.Detect")
	defer span.End()

	result := &Result{
		Event:      event,
		DetectedAt: time.Now().UTC(),
	}

	// ClamAV scan — only if a payload buffer is provided
	if len(event.Payload) > 0 && e.clam != nil {
		verdict, err := e.clam.ScanBuffer(ctx, event.Payload)
		if err == nil {
			result.ClamVerdict = verdict
		}
	}

	// VirusTotal hash lookup — only if hash is provided
	if event.FileHash != "" && e.vt != nil {
		report, err := e.vt.LookupHash(ctx, event.FileHash)
		if err == nil {
			result.VTReport = report
		}
	}

	// AbuseIPDB IP check
	if event.SourceIP != "" && e.abuse != nil {
		ipReport, err := e.abuse.CheckIP(ctx, event.SourceIP)
		if err == nil {
			result.IPReport = ipReport
		}
	}

	result.Severity = e.computeSeverity(result)
	result.MitreTactic = e.inferMitreTactic(result)
	result.Verdict = e.computeVerdict(result)

	return result, nil
}

// computeSeverity derives the highest severity across all detector results.
func (e *Engine) computeSeverity(r *Result) string {
	severity := SeverityLow

	if r.ClamVerdict != nil && !r.ClamVerdict.Clean {
		severity = escalate(severity, SeverityCritical)
	}
	if r.VTReport != nil {
		switch {
		case r.VTReport.Malicious >= 10:
			severity = escalate(severity, SeverityCritical)
		case r.VTReport.Malicious >= 3:
			severity = escalate(severity, SeverityHigh)
		case r.VTReport.Malicious >= 1:
			severity = escalate(severity, SeverityMedium)
		}
	}
	if r.IPReport != nil {
		severity = escalate(severity, abuseipdb.ScoreToSeverity(r.IPReport.AbuseScore))
	}

	return severity
}

// inferMitreTactic maps detection signals to a MITRE ATT&CK tactic.
func (e *Engine) inferMitreTactic(r *Result) string {
	if r.ClamVerdict != nil && !r.ClamVerdict.Clean {
		return "TA0002" // Execution
	}
	if r.VTReport != nil && r.VTReport.Malicious > 0 {
		return "TA0001" // Initial Access
	}
	if r.IPReport != nil && r.IPReport.AbuseScore >= 50 {
		return "TA0011" // Command and Control
	}
	return "TA0043" // Reconnaissance (default)
}

// computeVerdict returns a human-readable verdict string.
func (e *Engine) computeVerdict(r *Result) string {
	if r.Severity == SeverityCritical || r.Severity == SeverityHigh {
		return "MALICIOUS"
	}
	if r.Severity == SeverityMedium {
		return "SUSPICIOUS"
	}
	return "CLEAN"
}

// escalate returns the higher of two severity levels.
func escalate(current, candidate string) string {
	rank := map[string]int{
		SeverityLow:      0,
		SeverityMedium:   1,
		SeverityHigh:     2,
		SeverityCritical: 3,
	}
	if rank[candidate] > rank[current] {
		return candidate
	}
	return current
}
