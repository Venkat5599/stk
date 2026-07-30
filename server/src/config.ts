// Every tunable in one place, validated once at boot. A missing key should stop
// the process here rather than surface as a confusing 401 twenty minutes later.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required — see .env.example`);
  return value;
}

export const config = {
  /**
   * The full RPC endpoint, key included.
   *
   * Kept whole in the environment so that changing provider or cluster is a
   * deploy-time decision rather than a code change, and so the key never has to
   * be reassembled anywhere it might be logged.
   */
  rpcUrl: required("SOLANA_RPC_URL"),
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env["PORT"] ?? 3021),

  poll: {
    enabled: process.env["POLL_ENABLED"] !== "0",
    intervalMs: Number(process.env["POLL_INTERVAL_MS"] ?? 120_000),
    /** How far back to look on a cold start, in slots (~400ms each). */
    coldStartSlots: Number(process.env["POLL_COLD_START_SLOTS"] ?? 9_000),
  },
} as const;

export const rpcUrl = config.rpcUrl;
