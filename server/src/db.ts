import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, { onnotice: () => {} });

export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  // schema.sql is copied next to the compiled output by the build
  const ddl = await readFile(join(here, "schema.sql"), "utf8");
  await sql.unsafe(ddl);
}

export interface ProgramRow {
  program_id: string;
  first_seen_at: Date;
  deploy_slot: string;
  bytecode_sha256: string;
  size_bytes: number;
  copy_of: string | null;
}

/** Where the last poll stopped. Null means we have never polled. */
export async function readCursor(): Promise<number | null> {
  const rows = await sql<{ last_slot: string }[]>`
    select last_slot from poll_cursor where id = 1
  `;
  return rows[0] ? Number(rows[0].last_slot) : null;
}

export async function writeCursor(slot: number): Promise<void> {
  await sql`
    insert into poll_cursor (id, last_slot, updated_at)
    values (1, ${slot}, now())
    on conflict (id) do update
      set last_slot = excluded.last_slot, updated_at = now()
  `;
}

/**
 * Record a program and decide its verdict in one transaction.
 *
 * The verdict is decided here rather than at read time so it is fixed at the
 * moment of discovery: whoever had these bytes first keeps the claim, and a
 * later re-scan can never reshuffle who is the original. If the earliest
 * match is itself a copy we point at *its* original, so every copy in a family
 * names the same ancestor instead of forming a chain.
 */
export async function recordProgram(p: {
  programId: string;
  deploySlot: number;
  sha256: string;
  sizeBytes: number;
}): Promise<{ inserted: boolean; copyOf: string | null }> {
  return sql.begin(async (tx) => {
    const existing = await tx<{ program_id: string; copy_of: string | null }[]>`
      select program_id, copy_of from programs
      where bytecode_sha256 = ${p.sha256}
      order by first_seen_at asc, program_id asc
      limit 1
    `;
    const first = existing[0];
    const copyOf = first ? (first.copy_of ?? first.program_id) : null;

    const inserted = await tx<{ program_id: string }[]>`
      insert into programs (program_id, deploy_slot, bytecode_sha256, size_bytes, copy_of)
      values (${p.programId}, ${p.deploySlot}, ${p.sha256}, ${p.sizeBytes}, ${copyOf})
      on conflict (program_id) do nothing
      returning program_id
    `;

    return { inserted: inserted.length > 0, copyOf };
  });
}
