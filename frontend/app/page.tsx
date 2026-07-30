import { Fingerprint } from "@/components/Fingerprint";
import { Ticker } from "@/components/Ticker";
import {
  apiBaseUrl,
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
            href={`${apiBaseUrl}/api/programs?window=today`}
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
          <div className={styles.headline}>
            <span className={styles.headlineValue}>{stats.fresh}</span>
            <span className={styles.headlineLabel}>
              programs carried new code in the last 24h
            </span>
          </div>
          <div className={styles.readoutAside}>
            <span>{stats.deploys} deployed</span>
            <span className={styles.dot}>&middot;</span>
            <span>{stats.copies} copies</span>
            <span className={styles.dot}>&middot;</span>
            <span>{copyRate === null ? "\u2014" : `${copyRate}% copy rate`}</span>
          </div>
        </section>

        <section id="record" className={styles.record}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>The record &mdash; every deploy, hashed</h2>
            <span className={styles.rule} aria-hidden="true" />
            <span className={styles.sectionMeta}>
              {stats.recordBeganAt ? `begins ${timeAgo(stats.recordBeganAt)}` : null}
            </span>
          </div>

          {page.items.length === 0 ? (
            <p className={styles.quiet}>
              No programs have deployed since the record began. This is the chain being
              quiet, not stk failing to look.
            </p>
          ) : (
            <ol className={styles.list}>
              {page.items.map((program) => (
                <Card key={program.programId} program={program} />
              ))}
            </ol>
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

function Card({ program }: { program: Program }) {
  const isCopy = program.verdict === "copy";

  return (
    <li className={isCopy ? `${styles.card} ${styles.cardCopy}` : styles.card}>
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>
          <a
            className={styles.address}
            href={explorerUrl(program.programId)}
            rel="noreferrer noopener"
            target="_blank"
          >
            {shortAddress(program.programId, 6)}
          </a>
          <span className={isCopy ? styles.tagCopy : styles.tagNew}>
            {isCopy ? "COPY" : "NEW CODE"}
          </span>
        </div>

        <p className={styles.cardLine}>
          seen {timeAgo(program.firstSeenAt)}
          {isCopy && program.copyOf ? (
            <>
              {" \u00b7 copies "}
              <a
                className={styles.copyOf}
                href={explorerUrl(program.copyOf)}
                rel="noreferrer noopener"
                target="_blank"
              >
                {shortAddress(program.copyOf, 6)}
              </a>
            </>
          ) : (
            " \u00b7 no earlier copy on record"
          )}
        </p>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>size</dt>
            <dd>{formatSize(program.sizeBytes)}</dd>
          </div>
          <div className={styles.fact}>
            <dt>slot</dt>
            <dd>{program.deploySlot.toLocaleString("en-US")}</dd>
          </div>
          <div className={styles.fact}>
            <dt>sha256</dt>
            <dd>{program.sha256.slice(0, 16)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.cardMark}>
        <Fingerprint sha256={program.sha256} height={44} muted={isCopy} />
      </div>
    </li>
  );
}
