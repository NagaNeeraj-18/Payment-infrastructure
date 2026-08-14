package main

import (
	"database/sql"

	"github.com/redis/go-redis/v9"

	"nazar/internal/consortium"
	"nazar/internal/decide"
	"nazar/internal/fanout"
	"nazar/internal/graph"
	"nazar/internal/novelty"
	"nazar/internal/obs"
	"nazar/internal/persist"
	"nazar/internal/profile"
	"nazar/internal/wal"
)

// Server holds every dependency the HTTP handlers need. Nothing here is scoring-path state
// beyond what decide.Engine already owns — this struct exists to give handlers a receiver.
type Server struct {
	repoRoot     string
	rdb          *redis.Client
	db           *sql.DB
	profileStore *profile.RedisProfileStore
	engine       *decide.Engine
	wal          *wal.WAL
	shipper      *persist.Shipper
	hub          *fanout.Hub
	latency      *obs.LatencyTracker
	blocklist    *decide.Blocklist
	health       *obs.DependencyHealth
	graph        *graph.Engine
	novelty      *novelty.Engine
	consortium   *consortium.Registry
	policy       *decide.Policy

	redisContainer string
}
