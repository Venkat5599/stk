import { Fingerprint } from "@/components/Fingerprint";
import {
  explorerUrl,
  fetchPrograms,
  fetchStats,
  formatSize,
  shortAddress,
  timeAgo,
  type Program,
} from "@/lib/api";
import styles from "./page.module.css";

export const revalidate = 30;

export default async function Home() {
  // Deliberately not caught. A failure here belongs in error.tsx, because an
  // outage and an empty chain are different facts.
  const [stats, page] = await Promise.all([fetchStats("today"), fetchPrograms("today", 60)]);

  const copyRate = stats.copyRate === null ? null : Math.round(stats.copyRate * 100);

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>stk</span>
          <span className={styles.tagline}>new Solana code, separated from the copies</span>
        </div>
        <a
          className={styles.source}
          href="https://github.com/Venkat5599/stk"
          rel="noreferrer noopener"
          target="_blank"
        >
          Source
        </a>
      </header>

      <section className={styles.ledger} aria-label="Last 24 hours">
        <div className={styles.figureGroup}>
          <div className={styles.figure}>
            <span className={styles.figureValue}>{stats.deploys}</span>
            <span className={styles.figureLabel}>programs deployed</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>{stats.fresh}</span>
            <span className={styles.figureLabel}>carried new code</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>
              {copyRate === null ? "\u2014" : `${copyRate}%`}
            </span>
            <span className={styles.figureLabel}>were copies</span>
          </div>
        </div>
        <p className={styles.ledgerNote}>
          Every program on this page had its deployed bytecode hashed. A program whose
          hash already existed is a copy of the one that carried those bytes first.
          {stats.recordBeganAt ? (
            <> The record begins {timeAgo(stats.recordBeganAt)}; nothing before that is known.</>
          ) : null}
        </p>
      </section>

      {page.items.length === 0 ? (
        <p className={styles.quiet}>
          No programs have deployed since the record began. This is the chain being quiet,
          not stk failing to look.
        </p>
      ) : (
        <ol className={styles.list}>
          {page.items.map((program) => (
            <ProgramRow key={program.programId} program={program} />
          ))}
        </ol>
      )}

      <footer className={styles.footer}>
        <p className={styles.footerNote}>
          stk reads the upgradeable loader directly and hashes what each program actually
          contains. A verdict of copy is an identity of bytes, never a guess.
        </p>
      </footer>
    </main>
  );
}

function ProgramRow({ program }: { program: Program }) {
  const isCopy = program.verdict === "copy";

  return (
    <li className={isCopy ? `${styles.row} ${styles.rowCopy}` : styles.row}>
      <div className={styles.mark}>
        <Fingerprint sha256={program.sha256} muted={isCopy} />
      </div>

      <div className={styles.identity}>
        <a
          className={styles.address}
          href={explorerUrl(program.programId)}
          rel="noreferrer noopener"
          target="_blank"
        >
          {shortAddress(program.programId, 6)}
        </a>
        <span className={styles.meta}>
          {timeAgo(program.firstSeenAt)} &middot; {formatSize(program.sizeBytes)} &middot; slot{" "}
          {program.deploySlot.toLocaleString("en-US")}
        </span>
      </div>

      <div className={styles.verdict}>
        {isCopy && program.copyOf ? (
          <>
            <span className={styles.verdictCopy}>Copy</span>
            <a
              className={styles.copyOf}
              href={explorerUrl(program.copyOf)}
              rel="noreferrer noopener"
              target="_blank"
            >
              of {shortAddress(program.copyOf, 4)}
            </a>
          </>
        ) : (
          <>
            <span className={styles.verdictNew}>New code</span>
            <span className={styles.copyOf}>no earlier copy on record</span>
          </>
        )}
      </div>
    </li>
  );
}
