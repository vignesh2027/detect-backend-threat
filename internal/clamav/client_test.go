package clamav

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseResponse_Clean(t *testing.T) {
	v := parseResponse("stream: OK")
	assert.True(t, v.Clean)
	assert.Empty(t, v.Signature)
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
