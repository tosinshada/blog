---
author: Tosin Shada
pubDatetime: 2025-12-29T00:00:00Z
modDatetime: 2025-12-29T00:00:00Z
title: Building a Toy 100k TPS Financial Ledger
slug: building-toy-100k-tps-financial-ledger
featured: true
draft: false
tags:
  - rust
  - lmax-disruptor
  - distributed-systems
  - software-engineering
  - performance
description: Building a high-throughput distributed ledger in Rust using the LMAX Disruptor pattern, achieving over 100k TPS with durability guarantees.
---

Over the holiday break, I built a high-throughput distributed ledger in Rust capable of processing over 100,000 transactions per second with durability guarantees.

The goal was simple but ambitious: build a production-grade double-entry accounting system that could rival enterprise solutions, using the LMAX Disruptor pattern that powers some of the world's fastest financial exchanges.

After implementing 390 lines of core engine code, comprehensive WAL-based persistence, and TCP server infrastructure, I can say the results exceeded expectations. The system achieves **1M+ ops/sec** in single-core benchmarks and maintains those numbers even with durable writes.

Here's what makes this interesting:

- **Zero-allocation hot path**: The core state machine uses `FxHashMap` and processes batches with minimal overhead
- **Group commit WAL**: Single `fsync` per batch of 1,000 transactions instead of 1,000 individual syncs
- **Zero-copy serialization**: Using `rkyv` for sub-microsecond serialization/deserialization
- **Deterministic state machine**: Completely I/O-free core logic that can be replayed from the journal
- **Fencing tokens**: Built-in split-brain prevention for leader election
- **TCP server with length-prefixed codec**: Clean wire protocol for client communication

You can try it yourself by cloning [the repo](https://github.com/tosinshada/ledger-rs) and running `cargo bench`. The entire codebase is designed to fit in your head – no massive dependencies, clear separation of concerns, and extensive test coverage.

## Why not use X?

Before settling on the LMAX pattern, I evaluated several other approaches. Here's what I learned:

### Stored Procedures (PostgreSQL)

The traditional approach: put all your business logic in the database using stored procedures. PostgreSQL can handle impressive throughput, and you get ACID guarantees out of the box.

**The problem:** You're fundamentally limited by disk I/O on every transaction. Even with group commit and modern NVMe drives, you hit a ceiling around 10-20k TPS for a well-tuned system. More importantly, you're stuck with the database's threading model and can't optimize the critical path.

Modern financial systems need to process millions of events per second during market opens or flash crashes. Stored procedures simply can't get there.

### Virtual Actors (Akka, Orleans)

The actor model is elegant: each account is an actor, transfers are messages between actors. Akka and Orleans provide great abstractions for building distributed systems.

**The problem:** Actor frameworks add significant overhead. Every message has routing costs, serialization boundaries, and potential network hops. For a financial ledger where you need strict ordering guarantees and deterministic replay, the actor model introduces complexity without corresponding benefits.

I considered Orleans seriously because of its virtual actor model and Azure integration. But when you profile it, you realize you're paying for features you don't need (automatic activation/deactivation, location transparency) while sacrificing raw throughput.

### TigerBeetle

TigerBeetle is purpose-built for this exact use case: a distributed financial ledger written in Zig that uses consensus algorithms and custom storage engines.

**The interesting part:** TigerBeetle is probably the closest to what I wanted. They claim 1M+ TPS and have thought deeply about the same problems (double-entry accounting, durability, consensus).

**Why I didn't use it:** This was an educational project, and I wanted to understand the internals completely. TigerBeetle makes different tradeoffs – they built their own storage engine and consensus protocol. I wanted to explore the LMAX pattern specifically and see how far I could push a simpler architecture.

That said, if I was building a production system today and didn't want to implement it myself, TigerBeetle would be my first choice. It's incredibly well-designed.

### Aeron

Aeron is a high-performance messaging system built by Martin Thompson (of LMAX Disruptor fame). It's designed for ultra-low-latency communication with mechanical sympathy.

**The appeal:** Aeron gives you reliable UDP messaging with microsecond latencies. Perfect for building distributed systems where every microsecond counts.

**The reality:** Aeron solves the wrong problem for a ledger. The bottleneck in a financial system isn't usually network latency between components – it's the coordination and durability guarantees. Aeron is brilliant for building trading systems where you need to multicast market data to thousands of nodes. For a ledger, you need strict ordering and durability first, then speed.

I could have built the replication layer with Aeron, but the added complexity wasn't worth it for the initial implementation. The real wins come from the LMAX pattern itself, not the transport layer.

## The LMAX Disruptor Pattern

After evaluating the alternatives, I kept coming back to LMAX. The pattern is deceptively simple:

1. **Single-threaded core**: All business logic runs on one thread. No locks, no race conditions, no coordination overhead.
2. **Ring buffer pipeline**: Stages communicate via lock-free ring buffers (I used `crossbeam-channel` which is excellent).
3. **Mechanical sympathy**: Designed to work with CPU caches, not against them.

The key insight is that modern CPUs can execute billions of instructions per second on a single core. The problem with most systems isn't the CPU – it's everything else: locks, context switches, cache misses, I/O waits.

Here's my pipeline:

```
TCP Client → InputQueue → Sequencer → JournalQueue
                              ↓
                         Durability (WAL)
                              ↓
                         LogicQueue → Processor
                              ↓
                         ResponseQueue → TCP Client
```

Each stage does one thing well:

- **Sequencer**: Batches commands and assigns monotonic IDs
- **Durability**: Writes to disk with group commit (one `fsync` per batch)
- **Processor**: Applies batches to the in-memory state machine
- **Response**: Sends results back to clients

The beauty is that each stage can be optimized independently. The Processor runs on a pinned CPU core with a hot cache. The Durability stage batches writes. The network layer uses `tokio` for async I/O.

## Implementation Details

The core state machine is about 390 lines of deterministic Rust:

```rust
pub fn apply_batch(&mut self, batch: &Batch) -> BatchResult {
    // Validate fencing token
    // Process each command
    // Return results
}
```

No I/O, no system time, no randomness. Just pure logic that transforms commands into state changes. This makes it trivial to test and reason about.

The WAL (Write-Ahead Log) uses group commits:

```rust
// Buffer commands until we hit batch size
// Write all commands in one system call
// Call fsync ONCE for the entire batch
```

This is the difference between 100 TPS and 100,000 TPS. Every `fsync` is a round-trip to the disk platter (or SSD firmware). Modern drives can do maybe 500-1000 `fsync` operations per second. By batching 1,000 transactions and doing one `fsync`, we multiply our throughput by 1,000x.

Recovery is simple: replay the WAL on startup. Since the core state machine is deterministic, replaying the same commands produces the same state.

## Benchmarks

The results speak for themselves:

**Single-threaded engine benchmark:**

- 100-command batch: ~10 µs (10M TPS)
- 1,000-command batch: ~100 µs (10M TPS)
- 10,000-command batch: ~900 µs (11M TPS)

**Sequential batches (realistic workload):**

- 100 batches × 100 commands: ~9ms total (1.1M TPS)

**With durability (WAL writes):**

- Still achieving 100k+ TPS sustained

Compare this to:

- PostgreSQL stored procedures: ~10-20k TPS
- Traditional REST API with database: ~1-5k TPS
- Actor frameworks: ~20-50k TPS (depending on message complexity)

**Important caveat**: These benchmarks represent the current implementation with basic WAL durability. When full production features are added (proper consensus protocol, comprehensive error handling, monitoring, snapshotting, and replication), throughput will decrease. However, the architecture is designed to maintain our target of 100k+ TPS even with these additional guarantees. The single-threaded core and batching strategy provide enough headroom to absorb the overhead of production-grade reliability features.

## Tradeoffs and Limitations

Nothing is free. Here's what I gave up:

**Single-node throughput ceiling**: Since the core is single-threaded, I can't scale vertically beyond one CPU core's capacity. However, that one core can do 1M+ ops/sec, which is more than most businesses will ever need.

**Memory constraints**: Everything lives in memory. For millions of accounts, you need enough RAM. This is a classic speed vs. capacity tradeoff. (You could add snapshotting and archival, which I plan to do.)

**Complexity of distribution**: The current implementation has basic replication support, but building a full consensus protocol is non-trivial. For production, you'd want Raft or a similar algorithm.

**No SQL queries**: There's no query language, no indexes, no ad-hoc analytics. It's a write-optimized system. For queries, you'd stream changes to a read replica (CQRS pattern).

These tradeoffs are worth it for the use case. Financial ledgers are write-heavy and need strict consistency. Reads can be eventually consistent and served from replicas.

## What I Learned

This project taught me more about systems programming than anything else I've built:

**Mechanical sympathy matters**: Understanding how CPUs, caches, and disk I/O work makes a huge difference. The LMAX pattern works because it respects these constraints.

**Simplicity scales**: The core state machine is almost trivially simple. No clever tricks, no complex data structures. Just a hash map and basic arithmetic. The complexity lives at the boundaries (networking, persistence), not in the hot path.

**Zero-copy is real**: Using `rkyv` for serialization was a game-changer. Traditional serialization (even with bincode) involves allocations and copies. `rkyv` lets you work directly with serialized bytes.

**Batching is the ultimate optimization**: Group commits, message batching, batch processing – every time I batched operations, throughput increased by orders of magnitude.

**Deterministic systems are easier to test**: Because the core state machine has no side effects, testing is straightforward. No mocking, no flakiness, no timing issues.

## Conclusion

Could I have just used PostgreSQL or TigerBeetle? Absolutely. But building this taught me why systems like LMAX and TigerBeetle make the architectural choices they do.

The LMAX pattern isn't right for every problem. If you need complex queries, ad-hoc analytics, or flexible schema evolution, use a database. But if you need maximum throughput for a well-defined write-heavy workload, it's hard to beat.

If you want to explore the code, it's all on [GitHub](https://github.com/tosinshada/ledger-rs). The architecture doc (`impl-plan.md`) has detailed design notes, and the benchmarks are reproducible with `cargo bench`.

Would I use this in production? Not yet – it needs proper consensus (replacing the file-based lease with real leader election), better observability, and more edge case handling. But as a learning project and proof of concept, it exceeded my expectations.

The most satisfying part? The entire core engine fits in a few hundred lines of code that I can reason about completely. In a world of increasingly complex abstractions, there's something beautiful about software you can fully understand.
