# Architecture

```
  Solana mainnet (RPC)
        |
        v
  server/    Fastify API + poller, one process
        |    Postgres alongside, no host port
        |    127.0.0.1:3021, Caddy terminates TLS
        v
  frontend/  Next.js App Router, ISR 30s
```

## Why the API sits next to the database

Postgres lives on a private port on the VPS. Vercel cannot reach it, so the API
is deployed beside the database and the front end talks to the API over HTTPS.
The alternative — exposing Postgres publicly — trades a real security boundary
for one fewer moving part.

## Why the poller is in the API process

One sweep every two minutes is not work worth a queue. Redis, a worker, and the
serialisation between them would be three more things to run and monitor for a
job that finishes in seconds. Ticks are guarded against overlap, so a slow sweep
delays the next one rather than racing it.

## Reading the chain

Upgradeable programs keep their bytecode in a ProgramData account owned by the
loader. The sweep asks for every one of those accounts, sliced to the eight
bytes holding the deploy slot; without that slice the node would return the
bytecode of every program on Solana, every tick.

A ProgramData address is derived from its program id and that derivation runs
one way only. The program id is recovered by asking the loader for the Program
account whose body points back at the address — one call per new program,
instead of holding a map of the whole chain.

## Deciding a verdict

The verdict is written inside the insert transaction rather than computed at
read time. That fixes it at the moment of discovery: whoever carried the bytes
first keeps the claim, and a later re-scan cannot reshuffle who counts as the
original. When a copy matches another copy, both name the same ancestor instead
of forming a chain.

## What the record does not know

It begins when the poller does. A program marked new code has no earlier copy
*on record*, which is a narrower claim than being unprecedented on Solana, and
the interface says so.

Only exact bytes are compared. A fork with one constant changed is not a copy
here. Near-duplicate detection is real work for a later version, not something
to approximate with a threshold and present as certainty.
