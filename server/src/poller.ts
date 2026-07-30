import { createHash } from "node:crypto";
import { config } from "./config.js";
import { readCursor, recordProgram, writeCursor } from "./db.js";
import { log } from "./log.js";
import {
  BYTECODE_OFFSET,
  getAccountBytes,
  getSlot,
  findProgramIdFor,
  listProgramDataSlots,
} from "./rpc.js";

/** Ceiling on how many programs one tick will process. A burst (or a cold
 *  start with a wide window) must not turn into a thousand RPC calls. */
const MAX_PER_TICK = 60;

let running = false;

/**
 * One pass: find programs deployed or upgraded since the cursor, hash what
 * they actually contain, and record the verdict.
 */
export async function tick(): Promise<{ found: number; recorded: number }> {
  // Ticks are not allowed to overlap. getProgramAccounts can take tens of
  // seconds, and two passes racing would double the RPC spend to reach the
  // same answer.
  if (running) {
    log.warn("poll: previous tick still running, skipping");
    return { found: 0, recorded: 0 };
  }
  running = true;

  try {
    const cursor = await readCursor();
    // On a cold start, look back a bounded window rather than at all of
    // history — the record begins when the poller does, and it says so.
    const since = cursor ?? (await getSlot()) - config.poll.coldStartSlots;

    const accounts = await listProgramDataSlots();
    const fresh = accounts
      .filter((a) => a.slot > since)
      .sort((a, b) => a.slot - b.slot);

    if (fresh.length === 0) {
      log.info({ since }, "poll: nothing new");
      return { found: 0, recorded: 0 };
    }

    const batch = fresh.slice(0, MAX_PER_TICK);
    let recorded = 0;

    for (const account of batch) {
      try {
        const programId = await findProgramIdFor(account.programDataAddress);
        if (!programId) {
          // A ProgramData account with no Program pointing at it is a closed
          // program: the bytecode is gone and there is nothing to hash.
          log.debug({ ...account }, "poll: no program account, skipping");
          continue;
        }

        const raw = await getAccountBytes(account.programDataAddress);
        if (!raw || raw.length <= BYTECODE_OFFSET) {
          log.debug({ programId }, "poll: empty program data, skipping");
          continue;
        }

        const bytecode = raw.subarray(BYTECODE_OFFSET);
        const sha256 = createHash("sha256").update(bytecode).digest("hex");

        const { inserted, copyOf } = await recordProgram({
          programId,
          deploySlot: account.slot,
          sha256,
          sizeBytes: bytecode.length,
        });

        if (inserted) {
          recorded++;
          log.info(
            { programId, slot: account.slot, verdict: copyOf ? "copy" : "new", copyOf },
            "poll: recorded",
          );
        }
      } catch (err) {
        // One bad program must not cost us the rest of the batch.
        log.error(
          { programDataAddress: account.programDataAddress, err: String(err) },
          "poll: program failed",
        );
      }
    }

    // Advance only as far as we actually processed. If the batch was capped,
    // the next tick picks up exactly where this one stopped instead of
    // silently dropping the remainder.
    const last = batch[batch.length - 1];
    if (last) await writeCursor(last.slot);

    log.info(
      { found: fresh.length, processed: batch.length, recorded, throughTo: last?.slot },
      "poll: done",
    );
    return { found: fresh.length, recorded };
  } finally {
    running = false;
  }
}

export function startPoller(): void {
  if (!config.poll.enabled) {
    log.warn("poll: disabled (POLL_ENABLED=0)");
    return;
  }

  const run = () =>
    tick().catch((err) => log.error({ err: String(err) }, "poll: tick failed"));

  run();
  setInterval(run, config.poll.intervalMs).unref();
  log.info({ intervalMs: config.poll.intervalMs }, "poll: started");
}
