package abuseipdb

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestScoreToSeverity(t *testing.T) {
	cases := []struct {
		score    int
		expected string
	}{
		{0, "low"},
		{19, "low"},
		{20, "medium"},
		{49, "medium"},
		{50, "high"},
		{79, "high"},
		{80, "critical"},
		{100, "critical"},
	}
	for _, tc := range cases {
		assert.Equal(t, tc.expected, ScoreToSeverity(tc.score), "score=%d", tc.score)
	}
}
