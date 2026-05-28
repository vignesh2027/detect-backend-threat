// Package cache provides a Redis-backed LRU cache with TTL support.
package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps a Redis client with helper methods for the threat cache.
type Client struct {
	rdb *redis.Client
	ttl time.Duration
}

// NewClient creates a Redis cache client. maxEntries is advisory (Redis LRU handles eviction).
// ttl is the expiry for each cached key.
func NewClient(addr string, ttl time.Duration) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:       addr,
		DB:         0,
		MaxRetries: 3,
	})
	return &Client{rdb: rdb, ttl: ttl}
}

// Get retrieves a cached value by key. Returns ("", false) on miss.
func (c *Client) Get(ctx context.Context, key string) (string, bool) {
	val, err := c.rdb.Get(ctx, key).Result()
	if err != nil {
		return "", false
	}
	return val, true
}

// Set stores a value with the configured TTL.
func (c *Client) Set(ctx context.Context, key, value string) error {
	return c.rdb.Set(ctx, key, value, c.ttl).Err()
}

// Ping checks Redis connectivity.
func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

// Close shuts down the Redis connection.
func (c *Client) Close() error {
	return c.rdb.Close()
}
