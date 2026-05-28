// Package clamav provides a TCP socket client for ClamAV virus scanning.
package clamav

import (
	"bufio"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"go.opentelemetry.io/otel/trace"
)

// Verdict represents the outcome of a ClamAV scan.
type Verdict struct {
	Clean     bool
	Signature string // populated when not clean
	Raw       string
}

// Client holds a TCP connection configuration for ClamAV.
type Client struct {
	addr    string
	timeout time.Duration
	tracer  trace.Tracer
}

// NewClient creates a ClamAV client targeting addr (host:port).
func NewClient(addr string, timeout time.Duration, tracer trace.Tracer) *Client {
	return &Client{addr: addr, timeout: timeout, tracer: tracer}
}

// ScanBuffer scans buf using ClamAV's INSTREAM protocol.
// Returns a Verdict with Clean=false and Signature set if malware is found.
func (c *Client) ScanBuffer(ctx context.Context, buf []byte) (*Verdict, error) {
	ctx, span := c.tracer.Start(ctx, "clamav.ScanBuffer")
	defer span.End()

	conn, err := net.DialTimeout("tcp", c.addr, c.timeout)
	if err != nil {
		return nil, fmt.Errorf("clamav: dial %s: %w", c.addr, err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(c.timeout))

	// Send INSTREAM command
	if _, err := fmt.Fprint(conn, "nINSTREAM\n"); err != nil {
		return nil, fmt.Errorf("clamav: write INSTREAM: %w", err)
	}

	// Write chunk: 4-byte big-endian length + data
	length := make([]byte, 4)
	binary.BigEndian.PutUint32(length, uint32(len(buf)))
	if _, err := conn.Write(length); err != nil {
		return nil, fmt.Errorf("clamav: write chunk length: %w", err)
	}
	if _, err := conn.Write(buf); err != nil {
		return nil, fmt.Errorf("clamav: write chunk data: %w", err)
	}

	// Zero-length chunk signals end of stream
	binary.BigEndian.PutUint32(length, 0)
	if _, err := conn.Write(length); err != nil {
		return nil, fmt.Errorf("clamav: write terminator: %w", err)
	}

	// Read response
	reader := bufio.NewReader(conn)
	resp, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("clamav: read response: %w", err)
	}
	return parseResponse(strings.TrimSpace(resp)), nil
}

// parseResponse converts a raw ClamAV response line into a Verdict.
// Format: "stream: OK" or "stream: <SIGNATURE> FOUND" or "stream: ERROR ..."
func parseResponse(resp string) *Verdict {
	v := &Verdict{Raw: resp}
	switch {
	case strings.HasSuffix(resp, "OK"):
		v.Clean = true
	case strings.HasSuffix(resp, "FOUND"):
		parts := strings.Split(resp, ": ")
		if len(parts) >= 2 {
			v.Signature = strings.TrimSuffix(parts[1], " FOUND")
		}
	}
	return v
}
