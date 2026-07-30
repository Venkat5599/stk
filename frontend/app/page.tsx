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
  toWindow,
  type Program,
  type TimeWindow,
} from "@/lib/api";
import styles from "./page.module.css";

export const revalidate = 30;

type View = "new" | "copies";

const WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: "today", label: "Last 24h" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; view?: string }>;
}) {
  const params = await searchParams;
  const window = toWindow(params.window);
  const view: View = params.view === "copies" ? "copies" : "new";

  // Deliberately not caught. A failure belongs in error.tsx, because an outage
  // and a quiet chain are different facts and must never look alike.
  const [stats, page] = await Promise.all([fetchStats(window), fetchPrograms(window, 150)]);

  const shown = page.items.filter((p) => (view === "copies" ? p.copyOf : !p.copyOf));
  const copyRate = stats.copyRate === null ? null : Math.round(stats.copyRate * 100);
  const href = (next: { window?: TimeWindow; view?: View }) =>
    `/?window=${next.window ?? window}&view=${next.view ?? view}`;

  return (
    <>
      <nav className={styles.nav}>
        <span className={styles.navBrand}>stk</span>
        <span className={styles.navThesis}>every Solana deploy, hashed</span>
        <div className={styles.navRight}>
          <a
            className={styles.navLink}
            href={`${apiBaseUrl}/api/programs?window=${window}`}
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
          <span className={styles.navStatus}>MAINNET</span>
        </div>
      </nav>

      <Ticker programs={page.items.slice(0, 24)} />

      <div className={styles.shell}>
        <section className={styles.summary}>
          <div className={styles.summaryLead}>
            <span className={styles.summaryValue}>{stats.fresh}</span>
            <span className={styles.summaryLabel}>
              programs carried new code
              <br />
              {WINDOWS.find((w) => w.value === window)?.label.toLowerCase()}
            </span>
          </div>
          <div className={styles.summaryAside}>
            <span>{stats.deploys} deployed</span>
            <span className={styles.sep}>·</span>
            <span>{stats.copies} copies</span>
            <span className={styles.sep}>·</span>
            <span>{copyRate === null ? "—" : `${copyRate}% copy rate`}</span>
          </div>
        </section>

        <div className={styles.controls}>
          <div className={styles.tabs}>
            <a
              className={view === "new" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              href={href({ view: "new" })}
            >
              New code
            </a>
            <a
              className={view === "copies" ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              href={href({ view: "copies" })}
            >
              Copies
            </a>
          </div>
          <div className={styles.windows}>
            {WINDOWS.map((w) => (
              <a
                className={w.value === window ? `${styles.win} ${styles.winOn}` : styles.win}
                href={href({ window: w.value })}
                key={w.value}
              >
                {w.label}
              </a>
            ))}
          </div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>
              {view === "copies"
                ? "Copies — bytecode already on record"
                : "New code — no earlier copy on record"}
            </h2>
            <span className={styles.rule} aria-hidden="true" />
            <span className={styles.sectionMeta}>{shown.length} shown</span>
          </div>

          {shown.length === 0 ? (
            <p className={styles.quiet}>
              {view === "copies"
                ? "No duplicate bytecode in this window. Every program here carried code the record had not seen."
                : "Nothing new in this window. This is the chain being quiet, not stk failing to look."}
            </p>
          ) : (
            <ol className={styles.list}>
              {shown.map((program) => (
                <Row key={program.programId} program={program} />
              ))}
            </ol>
          )}
        </section>

        <footer className={styles.footer}>
          <span className={styles.footerBrand}>stk</span>
          <p className={styles.footerNote}>
            Reads the upgradeable loader directly and hashes what each program actually
            contains. A copy is an identity of bytes, never a guess. New code means no
            earlier copy is on record, which is narrower than unprecedented.
          </p>
        </footer>
      </div>
    </>
  );
}

function Row({ program }: { program: Program }) {
  const isCopy = program.verdict === "copy";

  return (
    <li className={isCopy ? `${styles.row} ${styles.rowCopy}` : styles.row}>
      <div className={styles.rowBody}>
        <div className={styles.rowTitle}>
          <a
            className={styles.address}
            href={explorerUrl(program.programId)}
            rel="noreferrer noopener"
            target="_blank"
          >
            {shortAddress(program.programId, 8)}
          </a>
          <span className={isCopy ? styles.tagCopy : styles.tagNew}>
            {isCopy ? "COPY" : "NEW CODE"}
          </span>
        </div>

        <p className={styles.rowLine}>
          seen {timeAgo(program.firstSeenAt)}
          {isCopy && program.copyOf ? (
            <>
              {" · copies "}
              <a
                className={styles.copyOf}
                href={explorerUrl(program.copyOf)}
                rel="noreferrer noopener"
                target="_blank"
              >
                {shortAddress(program.copyOf, 6)}
              </a>
            </>
          ) : null}
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
            <dd>{program.sha256.slice(0, 20)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.rowMark}>
        <Fingerprint sha256={program.sha256} height={40} muted={isCopy} />
      </div>
    </li>
  );
}
