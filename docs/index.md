---
layout: home

hero:
  name: prisma-extension-redis
  text: Caching for Prisma, done right
  tagline: Auto-caching, write invalidation, and stale-while-revalidate on Redis, Dragonfly, or Upstash — with zero runtime dependencies and your own client.
  actions:
    - theme: brand
      text: Get Started
      link: /GETTING_STARTED
    - theme: alt
      text: Assurance Report
      link: /ASSURANCE
    - theme: alt
      text: GitHub
      link: https://github.com/yxx4c/prisma-extension-redis

features:
  - icon: 🪶
    title: Zero runtime dependencies
    details: You bring the Redis client (iovalkey, ioredis, @upstash/redis, or any RedisApi implementation) — the extension never opens connections on your behalf, and prisma.redis is typed as exactly the client you passed.
  - icon: ⚡
    title: Built for concurrency
    details: Request coalescing turns thundering herds into one database call per key; stale-while-revalidate serves instantly while refreshing in the background. Verified at 250k concurrent requests with 100:1 coalescing.
  - icon: 🧹
    title: Invalidation that keeps up
    details: auto.invalidateOnWrite purges a model's auto-cache after successful writes; direct prisma.cache/uncache and pattern invalidation handle everything else — 10k keys in 25ms.
  - icon: 🛡️
    title: Fails safe, loudly
    details: Redis down? Every query still resolves from the database. Misconfigured JSON type? A startup probe tells you exactly what to change. Chaos-, soak-, and eviction-tested with the numbers published.
  - icon: 🌍
    title: Edge-ready
    details: The published build imports nothing but the Prisma peer — pair it with @upstash/redis in Cloudflare Workers or Vercel Edge.
  - icon: 🔍
    title: Observable
    details: Opt-in per-query meta (cache source, timestamps, recache/uncache actions), health checks with RedisJSON detection, metrics collection, debug logging, and cache maintenance utilities.
---
