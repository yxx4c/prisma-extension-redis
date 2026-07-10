# Testing

## Unit and integration suite

```bash
docker run -d --name pxr-pg -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=testdb postgres:alpine
docker run -d --name pxr-redis -p 6379:6379 docker.dragonflydb.io/dragonflydb/dragonfly

bun install
bun run test   # pretest migrates/generates, posttest runs biome + tsc
```

`REDIS_SERVICE_URI` / `POSTGRES_SERVICE_URI` (see `.env`) point the suite at your services. Any Redis-compatible backend with JSON support works — CI runs the matrix against Dragonfly and Redis Stack, plus a leg pinned to the `@prisma/client` peer floor (7.2.0).

## Quality gates

```bash
bun run check         # biome lint + format
bun run check:types   # tsc --noEmit over src and tests (includes the type-level API tests in test/types/)
bun run build && bun run test:node   # node:test smoke against dist (CJS + ESM)
bunx publint && bunx --yes @arethetypeswrong/cli --pack .   # package/type resolution
bun audit
```

## Adapter conformance

`test/redisApiConformance.ts` exports `runRedisApiConformance(name, factory)` — the contract every `RedisApi` implementation must satisfy. The suite runs it against the in-memory fake always, and against a live client when `REDIS_SERVICE_URI` is set. Run it against your own adapter to validate custom implementations.

## Stress harnesses (on demand)

```bash
# Load: coalescing efficacy, throughput, p50/p95/p99 latency, bounded heap
REDIS_SERVICE_URI=redis://localhost:6379 bun test/stress/load.ts [bursts] [concurrency] [keys]

# Soak: long-window mixed traffic (readers + writers + pattern storms), heap sampled per minute
REDIS_SERVICE_URI=redis://localhost:6379 bun test/stress/soak.ts [minutes] [readers] [keys]

# Chaos: graceful degradation while Redis is down, recovery after restart
REDIS_SERVICE_URI=redis://localhost:6379 CHAOS_CONTAINER=pxr-redis bun test/stress/chaos.ts

# Eviction pressure: correctness while the server LRU-evicts entries underneath
# (server needs e.g. --maxmemory 64mb --maxmemory-policy allkeys-lru)
REDIS_SERVICE_URI=redis://localhost:6379 bun test/stress/eviction.ts

# JSON-less server contract (run against redis:7-alpine)
REDIS_SERVICE_URI=redis://localhost:6379 bun test/stress/plain-redis.ts

# Adversarial edges: 1MB payloads, 10k-key invalidation storm, clock skew, mixed concurrency
REDIS_SERVICE_URI=redis://localhost:6379 bun test/stress/adversarial.ts
```

The load harness also runs weekly in CI (`stress.yml`). Results from the full campaign are recorded in [ASSURANCE.md](ASSURANCE.md).
