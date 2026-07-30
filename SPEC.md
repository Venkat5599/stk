# stk — build spec

> **Run the build in a FRESH Claude Code session** started in this directory.
> Paste the kickoff prompt below. Everything needed is in this file.

## Kickoff prompt

```
Read SPEC.md and build v0.1 end to end. Write every line from scratch — this is
an independent implementation, do not copy code from any other project. Commit
in logical units as you go. When the API is running, deploy it to the VPS and
the web app to Vercel, then verify both live.
```

---

## What this is

A radar for **new Solana programs that aren't copies of something already
deployed**.

Hundreds of programs deploy to Solana mainnet every day. Most are duplicates —
the same bytecode redeployed under a new address. A block explorer will happily
show you all of them and tell you nothing about which is which.

**stk answers one question: is this new code, or a copy?**

That single distinction is the whole product. Everything else is v2.

### Why it's worth building

The answer is genuinely non-obvious and nobody sees it. Watching the duplicate
rate is interesting on its own — it's a live measure of how much real building
is happening on Solana versus how much is copy-paste.

---

## Scope — v0.1 only

Ship this and nothing else. The temptation is to build fuzzy similarity,
categories, dossiers, and analytics; that is how you end up with nothing live.

**In scope**

- Poll Solana mainnet for newly deployed programs
- SHA-256 the program bytecode
- Mark each as `NEW` (hash never seen) or `COPY` (hash seen before → link to the
  first program that had it)
- One page: today's deploys, newest first, each labelled
- A stat line: how many deployed today, how many were copies

**Explicitly out of scope for v0.1** — fuzzy/near-duplicate matching, program
categories, per-program detail pages, search, IDL decoding, devnet, auth,
accounts, watchlists.

---

## Architecture

Two deployables in one repo. This split is chosen because Vercel cannot reach a
Postgres that lives on a private VPS port, so the API sits next to the database.

```
  Solana (Helius RPC)
        │
        ▼
  server/   Fastify API + poller + Postgres      → VPS, Docker Compose
        │   http://127.0.0.1:PORT, Caddy on TLS
        │
        ▼  fetch(API_URL)
  web/      Next.js App Router                    → Vercel
```

- **Node 22, TypeScript, pnpm.** ESM (`"type": "module"`).
- **server/** — Fastify, `postgres` (porsager) for queries, `pino` for logs. The
  poller runs in the same process on an interval; no queue, no Redis.
- **web/** — Next.js 15 App Router, React 19, plain CSS Modules. Server
  components fetch the API. No client-side data fetching in v0.1.

---

## Data model

One table. Resist adding more.

```sql
create table programs (
  program_id      text primary key,          -- base58
  first_seen_at   timestamptz not null default now(),
  deploy_slot     bigint      not null,
  bytecode_sha256 text        not null,
  size_bytes      integer     not null,
  -- null = this is the first program with this hash (NEW)
  -- set  = program_id of the earliest program with the same hash (COPY)
  copy_of         text        references programs(program_id)
);

create index programs_first_seen_idx on programs (first_seen_at desc);
create index programs_hash_idx       on programs (bytecode_sha256);

-- resume point so a restart doesn't re-scan from zero
create table poll_cursor (
  id         integer primary key default 1,
  last_slot  bigint  not null,
  updated_at timestamptz not null default now()
);
```

**Verdict rule.** On insert, look for an existing row with the same
`bytecode_sha256`, ordered by `first_seen_at` ascending. If one exists, set
`copy_of` to *its* `program_id` (or to *its* `copy_of` if it is itself a copy, so
every copy points at the original). Otherwise leave null.

---

## How to find new deploys

Upgradeable programs store their bytecode in a **ProgramData** account owned by
`BPFLoaderUpgradeab1e11111111111111111111111`.

ProgramData account layout:

| Offset | Size | Meaning |
| --- | --- | --- |
| 0 | 4 | enum discriminator, `3` = ProgramData |
| 4 | 8 | `slot` (u64 LE) — the slot it was last deployed/upgraded |
| 12 | 1 | Option tag for upgrade authority (1 = present) |
| 13 | 32 | upgrade authority pubkey |
| 45 | .. | the ELF bytecode |

**Poll loop** (every 2 minutes):

1. `getProgramAccounts` on the loader with
   `filters: [{ memcmp: { offset: 0, bytes: <base58 of 03000000> } }]` and
   `dataSlice: { offset: 4, length: 8 }`. The dataSlice is essential — without it
   you download every program's full bytecode on every tick.
2. Decode each slot, keep accounts with `slot > last_slot`.
3. For each new one, fetch the full account (`getAccountInfo`, base64) and
   SHA-256 the bytes **from offset 45 to the end** — that's the program itself,
   not the header.
4. Map ProgramData → program id. A program's ProgramData address is
   `findProgramAddress([programId], loader)`, which is one-way, so build the
   reverse mapping by listing **Program** accounts on the loader
   (discriminator `2`, whose bytes 4..36 hold their ProgramData address), again
   with a `dataSlice`.
5. Insert, apply the verdict rule, advance `last_slot`.

**Cost discipline.** Two `getProgramAccounts` calls per tick at 10 credits each
plus a `getSlot`. At 2-minute intervals that is roughly 45% of the Helius free
tier's monthly credits — acceptable. Do not poll faster without checking the
budget. Trailing bytes of a program account are zero-padded; hash the whole
slice anyway, it is deterministic.

---

## API

Public, read-only, no auth. Set `access-control-allow-origin: *`.

| Route | Returns |
| --- | --- |
| `GET /health` | `{ "ok": true }` |
| `GET /api/programs?window=today\|week&limit=50` | `{ items: Program[], total: number }` |
| `GET /api/stats?window=today` | `{ deploys, copies, fresh, copyRate }` |

```ts
interface Program {
  programId: string;
  firstSeenAt: string;   // ISO
  deploySlot: number;
  sizeBytes: number;
  verdict: "new" | "copy";
  copyOf: string | null; // the original, when verdict === "copy"
}
```

**Honesty rules — these matter more than they look.**

- An unreachable database must return **500**, never an empty list. "No deploys
  yet" and "we cannot tell you" are different answers and must never look alike.
- `copyOf` is a fact (identical hash), not a guess. Do not soften the wording.
- Never claim a program is novel because it is merely *not yet* in the database.
  The honest phrasing is "no earlier copy on record", and the UI should say that.

---

## Web

One route: `/`.

- Header: the name, and today's stat line — `N deployed today · M were copies`.
- A list, newest first. Each row: the program id (truncated, monospace, links to
  an explorer), how long ago, size, and the verdict.
- `COPY` rows show what they copy: `copy of 9qjS…6sNP`.
- Empty state must distinguish **no deploys yet** from **backend unreachable**.

Design comes after it works. Once v0.1 is live, do a proper design pass — read
the anti-slop design law in the global CLAUDE.md and follow it exactly. Decide a
signature first: the strongest candidate here is **the hash itself** — every
program has a SHA-256, which is a real per-program visual that also carries
meaning, and duplicates literally render identically. That is a signature no
other site can have.

---

## Deploying

The VPS already runs other stacks; ports must not collide.

- VPS `187.127.137.136`, ssh as `root` with `~/.ssh/hostinger_tenki`.
- **Taken:** 3000, 3001, 3011, 5432, 5433, 8080, 8090, 8099, 4030, 5678, 6300.
  Use **3021** for this API and keep Postgres container-internal (no host port).
- Caddy fronts everything. Append to `/etc/caddy/Caddyfile`:
  ```
  stk-api.187.127.137.136.sslip.io {
      reverse_proxy localhost:3021
  }
  ```
  then `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` and
  `systemctl reload caddy`. TLS is automatic.
- Web: `vercel deploy --prod --yes --cwd web`.

### Two traps that already cost hours

1. **Never pipe a Vercel env var in from PowerShell.** It stores a UTF-8 BOM
   *and* a trailing CRLF inside the value; `fetch` then throws `TypeError` on URL
   parse while `/health` looks perfectly healthy. Use
   `printf 'https://host' | vercel env add API_URL production`, then verify with
   `vercel env pull` and `cat -A`.
2. **Deploy the web app with `--cwd web`.** If `web/` ever depends on a workspace
   package, Vercel will not upload it — that needs the project's Root Directory
   set in the dashboard. Keep `web/` self-contained and this never bites.

Secrets live in `server/.env` (chmod 600, gitignored). Needed: `HELIUS_API_KEY`,
`POSTGRES_PASSWORD`, `DATABASE_URL`.

---

## Build order

Each step is a commit. Do not skip ahead — step 4 is where the product either
works or doesn't, and everything after it is presentation.

1. Repo scaffold: pnpm workspace, tsconfig, `.gitignore`, `.env.example`.
2. `server/`: Fastify with `/health`, Postgres connection, schema migration.
3. RPC client: `getProgramAccounts` / `getAccountInfo` against Helius, with
   retry on 429 and 5xx.
4. **The poller**: discover new ProgramData accounts, hash bytecode, map to
   program ids, insert, apply the verdict rule. Verify against a program you can
   check by hand on an explorer.
5. `/api/programs` and `/api/stats`.
6. `web/`: the single page, server-rendered, reading the API.
7. Docker Compose + deploy to the VPS, Caddy route, verify `/health` over TLS.
8. Vercel deploy, set `API_URL`, verify the page renders real rows.
9. Design pass (see above).

## Definition of done for v0.1

- The poller has been running for over an hour and rows are accumulating.
- The page shows real programs, correctly labelled, with a real copy rate.
- Both `/health` and the page are reachable over HTTPS.
- A `COPY` verdict has been verified by hand: two program ids, identical hashes.
