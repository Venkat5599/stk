import { Fingerprint } from "./Fingerprint";
import { shortAddress, type Program } from "@/lib/api";
import styles from "./Ticker.module.css";

/*
  A running strip of the most recent deploys.

  The list is rendered twice and translated across its own width, so the loop
  closes with no jump and no gap. Everything in it is real and already in the
  DOM before the animation starts — if motion never runs, or the reader has
  asked for none, the strip simply sits still and stays readable.
*/

export function Ticker({ programs }: { programs: Program[] }) {
  if (programs.length === 0) return null;

  const strip = [...programs, ...programs];

  return (
    <div className={styles.ticker} aria-label="Most recent deploys">
      <div className={styles.track}>
        {strip.map((program, index) => (
          <span
            className={styles.item}
            key={`${program.programId}-${index}`}
            aria-hidden={index >= programs.length}
          >
            <Fingerprint sha256={program.sha256} height={14} muted={program.verdict === "copy"} />
            <span className={styles.address}>{shortAddress(program.programId, 4)}</span>
            <span
              className={program.verdict === "copy" ? styles.copy : styles.new}
            >
              {program.verdict === "copy" ? "COPY" : "NEW"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
