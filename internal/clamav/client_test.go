package clamav

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace/noop"
)

func TestParseResponse_Clean(t *testing.T) {
	v := parseResponse("stream: OK")
	assert.True(t, v.Clean)
	assert.Empty(t, v.Signature)
	assert.Equal(t, "stream: OK", v.Raw)
}

func TestParseResponse_Malware(t *testing.T) {
	v := parseResponse("stream: Eicar-Test-Signature FOUND")
	assert.False(t, v.Clean)
	assert.Equal(t, "Eicar-Test-Signature", v.Signature)
}

func TestParseResponse_Error(t *testing.T) {
	v := parseResponse("stream: ERROR Could not connect")
	assert.False(t, v.Clean)
	assert.Empty(t, v.Signature)
}

func TestParseResponse_MultipartSignature(t *testing.T) {
	v := parseResponse("stream: Win.Malware.Agent-12345 FOUND")
	assert.False(t, v.Clean)
	assert.Equal(t, "Win.Malware.Agent-12345", v.Signature)
}

func TestParseResponse_EmptyString(t *testing.T) {
	v := parseResponse("")
	assert.False(t, v.Clean)
	assert.Empty(t, v.Signature)
	assert.Equal(t, "", v.Raw)
}

func TestNewClient(t *testing.T) {
	tracer := noop.NewTracerProvider().Tracer("test")
	c := NewClient("localhost:3310", 0, tracer)
	require.NotNil(t, c)
	assert.Equal(t, "localhost:3310", c.addr)
}

func TestVerdict_Fields(t *testing.T) {
	v := &Verdict{Clean: true, Signature: "", Raw: "stream: OK"}
	assert.True(t, v.Clean)
	assert.Empty(t, v.Signature)
}
