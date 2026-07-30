import bs58 from "bs58";
import { rpcUrl } from "./config.js";

// ---------------------------------------------------------------------------
// A small JSON-RPC client for the one thing this product reads from the chain:
// the upgradeable loader's accounts.
//
// Layout of a ProgramData account (what the loader stores the bytecode in):
//   0..4    u32   discriminator, 3 = ProgramData
//   4..12   u64   slot it was last deployed or upgraded at
//   12      u8    Option tag for the upgrade authority
//   13..45  [u8]  upgrade authority pubkey
//   45..    [u8]  the ELF
//
// And a Program account (the thing you actually call), 36 bytes:
//   0..4    u32   discriminator, 2 = Program
//   4..36   [u8]  the address of its ProgramData account
// ---------------------------------------------------------------------------

export const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";

/** Byte offset where the ELF starts inside a ProgramData account. */
export const BYTECODE_OFFSET = 45;

const DISCRIMINATOR_PROGRAM = discriminator(2);
const DISCRIMINATOR_PROGRAM_DATA = discriminator(3);

/** memcmp compares base58, so a u32 discriminator has to be encoded as bytes. */
function discriminator(value: number): string {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return bs58.encode(buf);
}

export class RpcError extends Error {
  constructor(method: string, cause: string) {
    super(`solana rpc ${method}: ${cause}`);
    this.name = "RpcError";
  }
}

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 90_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(method: string, params: unknown[]): Promise<T> {
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        // getProgramAccounts over the loader is legitimately slow, but a hung
        // socket must not stall a tick forever — ticks are overlap-guarded, so
        // one stall would otherwise stop ingestion for good.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err instanceof Error ? err.name : "network error";
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    // 429 is the shared rate limit and 5xx is transient; both are worth waiting
    // out. Anything else (401 on a bad key, 400 on a bad request) will not fix
    // itself, so fail immediately and loudly.
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new RpcError(method, `HTTP ${res.status}`);

    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new RpcError(method, body.error.message ?? "unknown error");
    if (body.result === undefined) throw new RpcError(method, "no result");
    return body.result;
  }

  throw new RpcError(method, `${lastError} (after ${MAX_ATTEMPTS} attempts)`);
}

export function getSlot(): Promise<number> {
  return call<number>("getSlot", [{ commitment: "confirmed" }]);
}

interface RawAccount {
  pubkey: string;
  account: { data: [string, string]; lamports: number };
}

/**
 * Every ProgramData account, sliced down to just its deploy slot.
 *
 * The dataSlice is what makes this affordable: without it the node returns the
 * full bytecode of every program on Solana on every tick.
 */
export async function listProgramDataSlots(): Promise<
  { programDataAddress: string; slot: number }[]
> {
  const accounts = await call<RawAccount[]>("getProgramAccounts", [
    LOADER,
    {
      encoding: "base64",
      dataSlice: { offset: 4, length: 8 },
      filters: [{ memcmp: { offset: 0, bytes: DISCRIMINATOR_PROGRAM_DATA } }],
    },
  ]);

  const out: { programDataAddress: string; slot: number }[] = [];
  for (const a of accounts) {
    const raw = a.account.data[0];
    if (!raw) continue;
    const buf = Buffer.from(raw, "base64");
    if (buf.length < 8) continue;
    out.push({ programDataAddress: a.pubkey, slot: Number(buf.readBigUInt64LE(0)) });
  }
  return out;
}

/**
 * The program id that owns a ProgramData account.
 *
 * A ProgramData address is derived from its program id, and that derivation
 * only runs one way, so the mapping is recovered by asking the loader for the
 * Program account whose body points back at this address.
 */
export async function findProgramIdFor(programDataAddress: string): Promise<string | null> {
  const accounts = await call<RawAccount[]>("getProgramAccounts", [
    LOADER,
    {
      encoding: "base64",
      dataSlice: { offset: 0, length: 0 },
      filters: [
        { memcmp: { offset: 0, bytes: DISCRIMINATOR_PROGRAM } },
        { memcmp: { offset: 4, bytes: programDataAddress } },
      ],
    },
  ]);
  return accounts[0]?.pubkey ?? null;
}

/** The raw bytes of an account, or null if it no longer exists. */
export async function getAccountBytes(address: string): Promise<Buffer | null> {
  const res = await call<{ value: { data: [string, string] } | null }>("getAccountInfo", [
    address,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  const raw = res.value?.data[0];
  return raw ? Buffer.from(raw, "base64") : null;
}
