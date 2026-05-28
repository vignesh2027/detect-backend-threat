// Package otel configures OpenTelemetry tracing for the detection engine.
package otel

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const TracerName = "detect-backend-threat/detector"

// InitTracer sets up a stdout OTLP exporter and returns a shutdown func.
func InitTracer(ctx context.Context) (trace.Tracer, func(context.Context) error, error) {
	exp, err := stdouttrace.New(stdouttrace.WithPrettyPrint())
	if err != nil {
		return nil, nil, err
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)
	otel.SetTracerProvider(tp)
	return tp.Tracer(TracerName), tp.Shutdown, nil
}
