import { Fingerprint } from "@/components/Fingerprint";
import { Ticker } from "@/components/Ticker";
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
  // Deliberately not caught. A failure belongs in error.tsx, because an outage
  // and a quiet chain are different facts and must never look alike.
  const [stats, page] = await Promise.all([fetchStats("today"), fetchPrograms("today", 80)]);

  const copyRate = stats.copyRate === null ? null : Math.round(stats.copyRate * 100);

  return (
    <>
      <nav className={styles.nav}>
        <span className={styles.navBrand}>stk</span>
        <div className={styles.navLinks}>
          <a className={styles.navLink} href="#record">
            Record
          </a>
          <a
            className={styles.navLink}
            href="https://stk-api.187.127.137.136.sslip.io/api/programs?window=today"
            rel="noreferrer noopener"
            target="_blank"
          >
            API
          </a>
          <a
            className={styles.navLink}
            href="https://github.com/Venkat5599/stk"
            rel="noreferrer noopener"
            target="_blank"
          >
            Source
          </a>
        </div>
        <span className={styles.navStatus}>MAINNET</span>
      </nav>

      <header className={styles.hero}>
        <h1 className={styles.wordmark}>STK</h1>
        <p className={styles.thesis}>
          Every program deployed to Solana, hashed. New code separated from the copies.
        </p>
      </header>

      <Ticker programs={page.items.slice(0, 20)} />

      <main className={styles.page}>
        <section className={styles.readout} aria-label="Last 24 hours">
          <div className={styles.figure}>
            <span className={styles.figureValue}>{stats.deploys}</span>
            <span className={styles.figureLabel}>Deployed</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>{stats.fresh}</span>
            <span className={styles.figureLabel}>New code</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>{stats.copies}</span>
            <span className={styles.figureLabel}>Copies</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>
              {copyRate === null ? "\u2014" : `${copyRate}%`}
            </span>
            <span className={styles.figureLabel}>Copy rate</span>
          </div>
        </section>

        <section id="record" className={styles.record}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>The record</h2>
            <span className={styles.sectionMeta}>
              {stats.recordBeganAt
                ? `Begins ${timeAgo(stats.recordBeganAt)} \u00b7 ${page.total} programs`
                : `${page.total} programs`}
            </span>
          </div>

          {page.items.length === 0 ? (
            <p className={styles.quiet}>
              No programs have deployed since the record began. This is the chain being
              quiet, not stk failing to look.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thMark} scope="col">
                    Fingerprint
                  </th>
                  <th scope="col">Program</th>
                  <th className={styles.thNum} scope="col">
                    Age
                  </th>
                  <th className={styles.thNum} scope="col">
                    Size
                  </th>
                  <th className={styles.thNum} scope="col">
                    Slot
                  </th>
                  <th className={styles.thEnd} scope="col">
                    Verdict
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((program) => (
                  <Row key={program.programId} program={program} />
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className={styles.footer}>
          <p className={styles.footerNote}>
            stk reads the upgradeable loader directly and hashes what each program
            actually contains. A verdict of copy is an identity of bytes, never a guess.
            New code means no earlier copy is on record, which is not the same as
            unprecedented.
          </p>
        </footer>
      </main>
    </>
  );
}

function Row({ program }: { program: Program }) {
  const isCopy = program.verdict === "copy";

  return (
    <tr className={isCopy ? styles.rowCopy : undefined}>
      <td className={styles.tdMark}>
        <Fingerprint sha256={program.sha256} height={20} muted={isCopy} />
      </td>
      <td>
        <a
          className={styles.address}
          href={explorerUrl(program.programId)}
          rel="noreferrer noopener"
          target="_blank"
        >
          {shortAddress(program.programId, 6)}
        </a>
      </td>
      <td className={styles.tdNum}>{timeAgo(program.firstSeenAt)}</td>
      <td className={styles.tdNum}>{formatSize(program.sizeBytes)}</td>
      <td className={styles.tdNum}>{program.deploySlot.toLocaleString("en-US")}</td>
      <td className={styles.tdEnd}>
        {isCopy && program.copyOf ? (
          <>
            <span className={styles.copy}>COPY</span>
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
            <span className={styles.new}>NEW</span>
            <span className={styles.copyOf}>no earlier copy</span>
          </>
        )}
      </td>
    </tr>
  );
}
