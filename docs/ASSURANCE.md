# Assurance Report

How this extension is verified, with the actual numbers from the v5.0.0 validation campaign (2026-07-10, local x86-64 Linux, Bun 1.3, containers on bridge network). Every leg below is reproducible from this repository — commands in [TESTING.md](TESTING.md).

## Correctness matrix

The full test suite (**303 tests, 100% line coverage of `src/`**) runs against real servers, not mocks:

| Backend | Result |
|---|---|
| Dragonfly (latest) | 303 / 303 |
| Redis Stack 7.4 | 303 / 303 |
| Redis 8.8 (native JSON) | 303 / 303 |
| `@prisma/client` peer floor (7.2.0, CI leg) | 303 / 303 |

Plus, on every CI run: a `node:test` smoke suite against the **built dist** (CJS + ESM), compile-time type tests (`tsc` over the public surface, including the `$transaction` inference guard and rejected-input negatives), biome lint, `publint`, `arethetypeswrong` (node10 / node16-CJS / node16-ESM / bundler all green), and `bun audit` (zero findings). Releases are built on CI with npm provenance attestations.

## Load

`test/stress/load.ts` — 50 bursts × 5,000 concurrent requests over 500 keys with 2s TTL / 1s stale windows:

| Metric | Result |
|---|---|
| Requests | 250,000 — zero failures |
| Database executions | **2,500** (100:1 coalescing; ceiling was 25,500) |
| Throughput | ~30,900 req/s sustained |
| Latency | p50 **2.8ms** · p95 **6.7ms** · p99 101ms (burst-start fills) |
| Heap | 2MB → 5MB across the run |

## Soak (1 hour)

`test/stress/soak.ts` — 200 concurrent readers on 2s/1s TTL windows (constant fresh → stale → refresh churn), a writer overwriting hot keys, and a pattern-invalidation storm every 15s, sustained for 60 minutes:

| Metric | Result |
|---|---|
| Requests | ~56 million — zero failures |
| Heap | bounded, oscillating 9–18MB with GC; no growth trend |
| Database executions | ~1 per key per TTL window throughout |

## Chaos (dependency failure)

`test/stress/chaos.ts` — Redis is killed mid-traffic, then restarted:

- **Outage**: 100/100 requests still resolved (served from the database); `healthCheck()` reported `unhealthy`; every cache error surfaced through `onError` (201 counted), none thrown at callers.
- **Recovery**: after restart, 100/100 resolved, caching resumed, health returned to `healthy`. No process restart, no manual intervention.

## Eviction pressure

`test/stress/eviction.ts` — 2,400 × 64KB entries written into a 64MB `allkeys-lru` cap (Redis Stack): the server evicted **1,603 entries underneath the extension**; all 2,400 subsequent reads returned correct values (121 from cache, 2,279 as clean database misses that re-cached) — **zero failures**.

## JSON-less server (Redis ≤ 7)

`test/stress/plain-redis.ts` against Redis 7.4 (no RedisJSON module):

- The startup probe detects the missing module and announces the remedy (console + `onError`).
- With `type: 'JSON'` misconfigured anyway: 50/50 queries still served correctly from the database; the actionable hint is attached to the first error exactly once.
- With `type: 'STRING'` on the same server: full caching (1 database call for 50 reads) and pattern invalidation work.

## Adversarial edges

`test/stress/adversarial.ts`:

| Scenario | Result |
|---|---|
| 1MB payload round-trip (JSON and STRING types) | intact, served from cache |
| 10,000-key pattern-invalidation storm | exactly 10,000 deleted in **25ms** |
| Server clock skewed +1 hour | timestamps follow the server clock (0s drift); reads stay consistent |
| 500 readers + 5 writers + invalidation storms, same keyspace | 10,000/10,000 resolved, zero corruption, no deadlock |

## Client compatibility (live)

- **iovalkey** and **ioredis**: full `RedisApi` conformance suite against live servers.
- **@upstash/redis**: 10/10 live tests against a real Upstash REST endpoint (detection, JSON and STRING round-trips, pattern invalidation, conformance).
- **Custom adapters**: the same conformance kit ships in `test/redisApiConformance.ts` for your own implementation.

## The published artifact

Installed `prisma-extension-redis@5.0.0-next.1` from the npm registry into a fresh consumer: **no `dependencies` field, no nested `node_modules`** — zero runtime dependencies confirmed on the wire. ESM import and CJS require both verified, the full cache/read/invalidate cycle ran against a live server from the published build, and the v5 remedial error (`bring your own client`) reaches consumers. The dist imports nothing except `@prisma/client/extension`.

## Findings and known limitations

- **RedisJSON memory is invisible to `maxmemory` accounting** (measured on both Redis Stack 7.4 and Redis 8.8: ~13MB of JSON documents registered as ~1.7MB of `used_memory`). Consequence: `maxmemory` + LRU **cannot bound a JSON-typed cache**. Every entry this extension writes carries a TTL (`ttl + stale`), so the keyspace is always time-bounded — but if you rely on byte-based eviction as your safety net, use `type: 'STRING'`, where accounting is exact (see the eviction leg above).
- **Redis 8 includes JSON natively** — `type: 'JSON'` works on plain `redis:8` images with no Stack/module install. The JSON-less scenario applies to Redis ≤ 7 without the module.
- **Redis Cluster is not supported** for SCAN-based utilities (pattern invalidation, maintenance) or multi-key `UNLINK` — see [ADAPTERS.md](ADAPTERS.md).
- **Write invalidation is same-model**: cached results of model A that `include` model B rows are not purged by writes to B ([details](CONFIGURATION.md#write-invalidation-invalidateonwrite)).
- On the ioredis-family `MULTI` write path, a JSON-less server surfaces `EXECABORT` rather than `unknown command`; the startup probe and read-path hints carry the remedy in both cases.
