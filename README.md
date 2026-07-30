# stk## Layout

| Path | What it is |
| --- | --- |
| `server/` | Fastify API, the poller, and Postgres. Runs as one process. |
| `frontend/` | Next.js App Router front end, deployed to Vercel. |
| `packages/sdk/` | `@stk/sdk` — typed client for the public API. |
| `docs/` | [API reference](docs/API.md) and [architecture notes](docs/ARCHITECTURE.md). |

## The interface

Strictly monochrome. There is no accent hue anywhere in it, so the only things
that carry weight are the numbers and the fingerprints.

That fingerprint is the point. Each program is drawn as 32 bars, one per byte of
its SHA-256, height and tone taken from the byte value. It is not ornament: two
programs carrying identical bytecode draw an identical mark, so a copy is
recognisable before you have read a character of its address.

**Is this Solana program new code, or a copy of something already deployed?**

Live: [stk-teal.vercel.app](https://stk-teal.vercel.app) · API: [stk-api.187.127.137.136.sslip.io](https://stk-api.187.127.137.136.sslip.io/health)

Hundreds of programs deploy to Solana mainnet every day, and a large share of
them are duplicates: the same bytecode redeployed under a fresh address. An
explorer shows you all of them and tells you nothing about which is which.

stk hashes the deployed bytecode of every program it sees. A hash it has never
seen is new code. A hash it already holds is a copy, and stk names the program
that carried those bytes first.

The copy rate is worth watching on its own. It is a live measure of how much
genuine building is happening versus how much is redeployment.

## How it works

Upgradeable programs keep their bytecode in a **ProgramData** account owned by
`BPFLoaderUpgradeab1e11111111111111111111111`. Every two minutes stk sweeps
those accounts, sliced down to the 8 bytes that hold the deploy slot, and takes
anything newer than its cursor. Without that slice the node would return the
full bytecode of every program on Solana on every tick.

A ProgramData address is derived from its program id, and that derivation only
runs one way. To recover the program id, stk asks the loader for the Program
account whose body points back at that address — one extra call per new
program, instead of holding a map of every program on the chain.

The bytecode is everything past byte 45, which is where the header ends. That
is what gets hashed with SHA-256, and that hash is the whole verdict.

The verdict is decided inside the insert transaction, so whoever carried the
bytes first keeps the claim and a later re-scan cannot reshuffle the original.
When a copy matches another copy, both point at the same ancestor rather than
forming a chain.

### What it does not claim

The record begins when the poller does. A program marked as new code has **no
earlier copy on record** — that is not the same as being unprecedented on
Solana, and the interface says so rather than overstating it.

A copy is an identity of bytes, never a similarity score. Near-duplicates, forks
with a constant changed, and programs built from the same source are not
detected. That is honest v2 work, not something to fudge with a threshold.

## Layout

| Path | What it is |
| --- | --- |
| `server/` | Fastify API, the poller, and Postgres. Runs as one process. |
| `frontend/` | Next.js App Router front end, deployed to Vercel. |
| `packages/sdk/` | `@stk/sdk` — typed client for the public API. |

## The SDK

No auth, no key: the record is public.

```ts
import { Stk } from "@stk/sdk";

const stk = new Stk();

const { deploys, copies, copyRate } = await stk.stats("today");
const { items } = await stk.programs({ window: "today", limit: 50 });

for (const p of items) {
  console.log(p.programId, p.verdict, p.copyOf ?? "");
}
```

| Method | Returns |
| --- | --- |
| `programs({ window, limit })` | page of `Program` |
| `stats(window)` | counts and copy rate for the window |
| `health()` | `boolean` |

An unreachable backend throws `StkUnavailableError`. Catching it and rendering
zero rows would tell your reader that nothing deployed, which is a different
claim from not being able to answer. Show an outage.

## Running it

```sh
pnpm install
cp .env.example .env      # HELIUS_API_KEY, POSTGRES_PASSWORD, DATABASE_URL
pnpm --filter @stk/server dev
API_URL=http://localhost:3021 pnpm --filter @stk/web dev
```

Postgres is expected on `DATABASE_URL`; the server creates its own schema on
boot. A Helius key on the free tier covers this comfortably — two
`getProgramAccounts` calls plus a `getSlot` every two minutes.

## Deploying

`docker compose up -d --build` brings up Postgres and the API together. Postgres
publishes no host port and the API binds `127.0.0.1:3021`, so a TLS terminator
in front is the only thing exposed. The web app goes to Vercel with `API_URL`
pointed at that hostname.

One warning worth keeping. Setting `API_URL` by piping a value from PowerShell
stores a UTF-8 BOM and a trailing CRLF *inside* the value; `fetch` then throws
on URL parse while `/health` looks perfectly healthy. Use
`printf 'https://host' | vercel env add API_URL production` and verify with
`vercel env pull` and `cat -A`.

## Status

v0.1. The poller, the verdict, the API, the SDK, and the front end are live.
Near-duplicate detection, per-program history, and search are not built yet.
