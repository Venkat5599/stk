# stk

**Is this Solana program new code, or a copy of something already deployed?**

Hundreds of programs deploy to Solana mainnet every day. Most are duplicates —
the same bytecode redeployed under a fresh address. Explorers show you all of
them and tell you nothing about which is which.

stk hashes the bytecode of every new deploy and answers that one question. A
program whose hash has never been seen is new. A program whose hash already
exists is a copy, and stk shows you the original.

The copy rate is worth watching on its own: it is a live measure of how much
real building is happening versus how much is copy-paste.

## Status

Early. See [SPEC.md](SPEC.md) for the v0.1 scope and build plan.

## Stack

TypeScript throughout. Fastify + Postgres for the API and poller, deployed with
Docker Compose behind Caddy. Next.js on Vercel for the web app. Solana data via
Helius RPC.
