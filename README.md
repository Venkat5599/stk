<p align="center">
  <img src="https://img.shields.io/badge/stk-the_Solana_deploy_record-ededed?style=for-the-badge&labelColor=0a0a0a" alt="stk" />
</p>

<h1 align="center">stk</h1>

<p align="center">
  <strong>Is this Solana program new code, or a copy of something already deployed?</strong>
</p>

<p align="center">
  <a href="https://stk-teal.vercel.app">
    <img src="https://img.shields.io/badge/LIVE-Solana_Mainnet-00d47e?style=for-the-badge&labelColor=0a0a0a" alt="Live on Solana mainnet" />
  </a>
  <a href="https://stk-api.187.127.137.136.sslip.io/health">
    <img src="https://img.shields.io/badge/API-public,_no_auth-ededed?style=for-the-badge&labelColor=0a0a0a" alt="Public API" />
  </a>
  <img src="https://img.shields.io/badge/aislop-100%2F100-00d47e?style=for-the-badge&labelColor=0a0a0a" alt="aislop 100 out of 100" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=0a0a0a" alt="TypeScript" />
</p>

---

## Overview

Hundreds of programs deploy to Solana mainnet every day, and a large share of
them are duplicates: the same bytecode redeployed under a fresh address. Block
explorers list all of them and distinguish none.

**stk hashes the deployed bytecode of every new program and tells you which is
which.** A hash the record has never seen is new code. A hash it already holds
is a copy, and stk names the program that carried those bytes first.

### Why it matters

The copy rate is worth watching on its own — it is a live measure of how much
real building is happening on Solana versus how much is redeployment. Right now
it sits around **16%**.

| Question | Before | With stk |
| --- | --- | --- |
| Is this program original? | Pull the bytecode and diff it by hand | One API call |
| What did it copy? | No way to know | The original program id |
| How much of Solana is copy-paste? | Unanswerable | A live number |

---

## Live

| Resource | URL |
| --- | --- |
| **Product** | [stk-teal.vercel.app](https://stk-teal.vercel.app) |
| **API** | [stk-api.187.127.137.136.sslip.io](https://stk-api.187.127.137.136.sslip.io/health) |
| **Live stats** | [`/api/stats?window=today`](https://stk-api.187.127.137.136.sslip.io/api/stats?window=today) |
| **The record** | [`/api/programs?window=today`](https://stk-api.187.127.137.136.sslip.io/api/programs?window=today) |

---

## How it works

Upgradeable programs keep their bytecode in a **ProgramData** account owned by
`BPFLoaderUpgradeab1e11111111111111111111111`.

### 1. Sweep the loader

Every two minutes stk asks for every ProgramData account, sliced down to the
eight bytes holding the deploy slot:

```ts
getProgramAccounts(LOADER, {
  dataSlice: { offset: 4, length: 8 },
  filters: [{ memcmp: { offset: 0, bytes: DISCRIMINATOR_PROGRAM_DATA } }],
})
```

Without that `dataSlice` the node returns the full bytecode of every program on
Solana on every tick — the difference between a viable RPC budget and an
unusable one.

### 2. Recover the program id

A ProgramData address is derived from its program id, and that derivation runs
**one way only**. So stk asks the loader for the Program account whose body
points back at the address:

```
Program account (36 bytes)
  0..4    u32   discriminator = 2
  4..36   [u8]  its ProgramData address   <- match on this
```

One extra call per new program, instead of holding a map of the entire chain.

### 3. Hash what the program actually contains

```
ProgramData account
  0..4    u32   discriminator = 3
  4..12   u64   slot last deployed at
  12      u8    Option tag, upgrade authority
  13..45  [u8]  authority pubkey
  45..    [u8]  the ELF          <- SHA-256 this
```

### 4. Decide the verdict, once

```sql
-- null = no earlier program shares this bytecode
-- set  = the program_id that had these bytes first
copy_of  text references programs(program_id)
```

Written inside the insert transaction, so whoever carried the bytes first keeps
the claim and a later rescan cannot reshuffle the original. When a copy matches
another copy, both name the same ancestor rather than forming a chain.

---

## Architecture

```
                        Solana mainnet
                              |
                         Helius RPC
                              |
                              v
    +---------------------------------------------------+
    |  server/            VPS, Docker Compose            |
    |                                                    |
    |  +-------------+   +-------------+   +----------+  |
    |  |   poller    |   |  verdict    |   | Fastify  |  |
    |  |  every 2m   |-->|  at insert  |-->|   API    |  |
    |  +-------------+   +-------------+   +----------+  |
    |         |                 |                |       |
    |         +--------> Postgres <--------------+       |
    |                 (no host port)                     |
    +---------------------------------------------------+
                              |
                       Caddy, TLS auto
                              |
                    127.0.0.1:3021 exposed
                              |
                              v
    +---------------------------------------------------+
    |  frontend/          Vercel, ISR 30s                |
    |  packages/sdk/      @stk/sdk, zero runtime deps    |
    +---------------------------------------------------+
```

Postgres publishes no host port and the API binds `127.0.0.1`, so the TLS
terminator is the only thing exposed.

---

## The SDK

```ts
import { Stk } from "@stk/sdk";

const stk = new Stk();

// how much of today was copy-paste?
const { deploys, copies, copyRate } = await stk.stats("today");

// what shipped this week, and what did it copy?
const { items } = await stk.programs({ window: "week", limit: 50 });

for (const p of items) {
  if (p.verdict === "copy") console.log(p.programId, "copies", p.copyOf);
}
```

| Method | Returns |
| --- | --- |
| `programs({ window, limit })` | page of `Program` |
| `stats(window)` | counts and copy rate |
| `health()` | `boolean` |

No auth, no key — the record is public.

### The error contract

This is the part worth reading.

| Situation | Result |
| --- | --- |
| Program not on record | `null` |
| No programs in window | empty page |
| Backend unreachable | **throws** `StkUnavailableError` |

An outage is never disguised as "nothing deployed". For a product whose entire
claim is *this is what the chain did*, silently reporting zero would be a lie.

```ts
try {
  const { items } = await stk.programs();
} catch (err) {
  if (err instanceof StkUnavailableError) {
    // show an outage state, not an empty one
  }
}
```

---

## API

Read-only, public, `access-control-allow-origin: *`.

### `GET /api/programs`

| Query | Values | Default |
| --- | --- | --- |
| `window` | `today`, `week`, `month` | `today` |
| `limit` | 1 to 200 | 50 |

```json
{
  "items": [
    {
      "programId": "Bnfx8N77QEVo9RhJpropL1rLMy6suPXEKMjTBNCnc6Hf",
      "firstSeenAt": "2026-07-30T16:41:19.441Z",
      "deploySlot": 436187460,
      "sizeBytes": 351080,
      "sha256": "f50837e3fab61628b8a90a45f4e0f774eec8a57c6a047d5773de2b732840e3cb",
      "verdict": "new",
      "copyOf": null
    }
  ],
  "total": 86,
  "window": "today"
}
```

### `GET /api/stats`

```json
{
  "window": "today",
  "deploys": 86,
  "copies": 14,
  "fresh": 72,
  "copyRate": 0.1628,
  "recordBeganAt": "2026-07-30T16:39:20.411Z"
}
```

`copyRate` is `null` when nothing has been seen — a rate over zero deploys is
undefined, not zero. `recordBeganAt` is the oldest row held; anything before it
is outside the record.

Full reference in [`docs/API.md`](docs/API.md).

---

## Project structure

```
stk/
├── server/          Fastify API + poller + Postgres, one process
├── frontend/        Next.js App Router, deployed to Vercel
├── packages/sdk/    @stk/sdk — typed client, zero runtime deps
├── docs/            API reference and architecture notes
└── SPEC.md          the scope this was built to
```

---

## Running it

```bash
pnpm install
cp .env.example .env     # SOLANA_RPC_URL, POSTGRES_PASSWORD, DATABASE_URL

pnpm --filter @stk/server dev
API_URL=http://localhost:3021 pnpm --filter @stk/frontend dev
```

Postgres is expected on `DATABASE_URL`; the server creates its own schema on
boot. Any RPC provider works — a free Helius tier covers this comfortably at two
`getProgramAccounts` calls plus a `getSlot` every two minutes.

### Deploying

```bash
docker compose up -d --build
```

Brings up Postgres and the API together. Point a TLS terminator at
`127.0.0.1:3021`, then deploy the frontend with `API_URL` set to that hostname.

> **Setting `API_URL` on Vercel:** never pipe the value in from PowerShell. It
> stores a UTF-8 BOM *and* a trailing CRLF inside the value, and `fetch` then
> throws on URL parse while `/health` looks perfectly healthy. Use
> `printf 'https://host' | vercel env add API_URL production` and verify with
> `vercel env pull` and `cat -A`.

---

## What it deliberately does not claim

**The record begins when the poller does.** A program marked new code has no
earlier copy *on record* — narrower than unprecedented, and the interface says
so rather than overstating it.

**Only exact bytes are compared.** A fork with one constant changed is not a
copy here. Near-duplicate detection is honest v2 work, not something to
approximate with a threshold and present as certainty.

**Nothing is deployed on-chain.** stk is an off-chain indexer. Its Solana
integration is in what it reads and decodes, not in anything it writes.

---

## Roadmap

- [x] Poller — loader sweep, ProgramData decode, program id resolution
- [x] Verdict engine — transactional, original-preserving
- [x] Public API — programs, stats, CORS open
- [x] SDK — typed, zero runtime dependencies
- [x] Frontend — live record, tabs, window filters
- [x] Deploy — VPS + Caddy + TLS, Vercel frontend
- [ ] ELF parsing — framework detection, deploy cost
- [ ] Near-duplicate detection — fuzzy bytecode matching
- [ ] npm publish `@stk/sdk`

---

## Tech

| Layer | Stack |
| --- | --- |
| Ingest + API | TypeScript, Fastify, `postgres` |
| Database | PostgreSQL 16 |
| Host | Docker Compose, Caddy, VPS |
| Frontend | Next.js 15 App Router, React 19, CSS Modules |
| Chain | Solana mainnet via Helius RPC |

---

<div align="center">

**[Live](https://stk-teal.vercel.app)** · **[API](https://stk-api.187.127.137.136.sslip.io/health)** · **[Architecture](docs/ARCHITECTURE.md)** · **[API reference](docs/API.md)**

Reading Solana mainnet, live.

</div>
