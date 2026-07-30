import type { FastifyInstance } from "fastify";
import { sql } from "./db.js";

// The record is public and read-only, so there is no auth and nothing to
// rate-limit an identity against.

const WINDOWS = { today: "24 hours", week: "7 days", month: "30 days" } as const;
type Window = keyof typeof WINDOWS;

function windowOf(value: unknown): Window {
  return value === "week" || value === "month" ? value : "today";
}

function limitOf(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(Math.trunc(n), 1), 200);
}

export interface Program {
  programId: string;
  firstSeenAt: string;
  deploySlot: number;
  sizeBytes: number;
  sha256: string;
  verdict: "new" | "copy";
  /** The program that had these bytes first. Only set when verdict is "copy". */
  copyOf: string | null;
}

export function registerRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({ ok: true }));

  app.get<{ Querystring: { window?: string; limit?: string } }>(
    "/api/programs",
    async (req) => {
      const window = windowOf(req.query.window);
      const limit = limitOf(req.query.limit);
      const interval = WINDOWS[window];

      const rows = await sql<
        {
          program_id: string;
          first_seen_at: Date;
          deploy_slot: string;
          size_bytes: number;
          bytecode_sha256: string;
          copy_of: string | null;
        }[]
      >`
        select program_id, first_seen_at, deploy_slot, size_bytes, bytecode_sha256, copy_of
        from programs
        where first_seen_at > now() - ${interval}::interval
        order by first_seen_at desc, program_id desc
        limit ${limit}
      `;

      const [count] = await sql<{ total: string }[]>`
        select count(*)::text as total from programs
        where first_seen_at > now() - ${interval}::interval
      `;

      const items: Program[] = rows.map((r) => ({
        programId: r.program_id,
        firstSeenAt: r.first_seen_at.toISOString(),
        deploySlot: Number(r.deploy_slot),
        sizeBytes: r.size_bytes,
        sha256: r.bytecode_sha256,
        verdict: r.copy_of ? "copy" : "new",
        copyOf: r.copy_of,
      }));

      return { items, total: Number(count?.total ?? 0), window };
    },
  );

  app.get<{ Querystring: { window?: string } }>("/api/stats", async (req) => {
    const window = windowOf(req.query.window);
    const interval = WINDOWS[window];

    const [row] = await sql<{ deploys: string; copies: string }[]>`
      select
        count(*)::text                                as deploys,
        count(*) filter (where copy_of is not null)::text as copies
      from programs
      where first_seen_at > now() - ${interval}::interval
    `;

    const deploys = Number(row?.deploys ?? 0);
    const copies = Number(row?.copies ?? 0);

    // The oldest row we hold is where the record honestly begins. Without it a
    // reader would assume today's numbers cover a full day even on the first
    // hour of running.
    const [begins] = await sql<{ started: Date | null }[]>`
      select min(first_seen_at) as started from programs
    `;

    return {
      window,
      deploys,
      copies,
      fresh: deploys - copies,
      copyRate: deploys === 0 ? null : copies / deploys,
      recordBeganAt: begins?.started ? begins.started.toISOString() : null,
    };
  });
}
