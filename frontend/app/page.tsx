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
  const [stats, page] = await Promise.all([fetchStats("today"), fetchPrograms("today", 150)]);

  const copyRate = stats.copyRate === null ? null : Math.round(stats.copyRate * 100);
  const clusters = buildClusters(page.items);

  return (
    <>
      <nav className={styles.nav}>
        <span className={styles.navBrand}>stk</span>
        <span className={styles.navThesis}>every Solana deploy, hashed</span>
        <div className={styles.navRight}>
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
          <span className={styles.navStatus}>MAINNET</span>
        </div>
      </nav>

      <Ticker programs={page.items.slice(0, 24)} />

      <div className={styles.shell}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Last 24 hours</h2>
          <div className={styles.panels}>
            <Panel value={String(stats.deploys)} label="Programs deployed" />
            <Panel value={String(stats.fresh)} label="Carried new code" />
            <Panel value={String(stats.copies)} label="Were copies" />
            <Panel
              value={copyRate === null ? "—" : `${copyRate}%`}
              label="Copy rate"
              bar={copyRate}
            />
          </div>
        </section>

        {clusters.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Most copied bytecode</h2>
            <div className={styles.clusters}>
              {clusters.map((cluster) => (
                <article className={styles.cluster} key={cluster.originalId}>
                  <div className={styles.clusterHead}>
                    <Fingerprint sha256={cluster.sha256} height={24} />
                    <span className={styles.clusterCount}>
                      {cluster.copies.length + 1} programs
                    </span>
                  </div>
                  <a
                    className={styles.clusterOriginal}
                    href={explorerUrl(cluster.originalId)}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {shortAddress(cluster.originalId, 6)}
                  </a>
                  <span className={styles.clusterLabel}>had these bytes first</span>
                  <ul className={styles.clusterList}>
                    {cluster.copies.slice(0, 4).map((copy) => (
                      <li key={copy.programId}>
                        <a
                          className={styles.clusterCopy}
                          href={explorerUrl(copy.programId)}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          {shortAddress(copy.programId, 6)}
                        </a>
                      </li>
                    ))}
                    {cluster.copies.length > 4 ? (
                      <li className={styles.clusterMore}>+{cluster.copies.length - 4} more</li>
                    ) : null}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>The record</h2>
            <span className={styles.sectionMeta}>
              {page.total} programs
              {stats.recordBeganAt ? ` · begins ${timeAgo(stats.recordBeganAt)}` : ""}
            </span>
          </div>

          {page.items.length === 0 ? (
            <p className={styles.quiet}>
              No programs have deployed since the record began. This is the chain being
              quiet, not stk failing to look.
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Fingerprint</th>
                    <th scope="col">Program</th>
                    <th scope="col">Verdict</th>
                    <th scope="col">Copies</th>
                    <th className={styles.num} scope="col">
                      Size
                    </th>
                    <th className={styles.num} scope="col">
                      Slot
                    </th>
                    <th className={styles.num} scope="col">
                      Seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((program) => (
                    <Row key={program.programId} program={program} />
                  ))}
                </tbody>
              </table>
            </div>
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

function Panel({ value, label, bar }: { value: string; label: string; bar?: number | null }) {
  return (
    <div className={styles.panel}>
      <span className={styles.panelValue}>{value}</span>
      <span className={styles.panelLabel}>{label}</span>
      {typeof bar === "number" ? (
        <span className={styles.bar}>
          <span className={styles.barFill} style={{ inlineSize: `${bar}%` }} />
        </span>
      ) : null}
    </div>
  );
}

interface Cluster {
  originalId: string;
  sha256: string;
  copies: Program[];
}

/**
 * Group copies by the program that carried their bytes first.
 *
 * Derived from the page already fetched rather than a second request: the
 * verdict is decided server-side at insert, so copyOf already names the true
 * original and nothing here has to re-decide it.
 */
function buildClusters(programs: Program[]): Cluster[] {
  const byOriginal = new Map<string, Program[]>();
  for (const program of programs) {
    if (!program.copyOf) continue;
    const existing = byOriginal.get(program.copyOf);
    if (existing) existing.push(program);
    else byOriginal.set(program.copyOf, [program]);
  }

  return [...byOriginal.entries()]
    .map(([originalId, copies]) => ({
      originalId,
      sha256: copies[0]?.sha256 ?? "",
      copies,
    }))
    .filter((cluster) => cluster.sha256 !== "")
    .sort((a, b) => b.copies.length - a.copies.length)
    .slice(0, 4);
}

function Row({ program }: { program: Program }) {
  const isCopy = program.verdict === "copy";

  return (
    <tr className={isCopy ? styles.rowCopy : undefined}>
      <td className={styles.cellMark}>
        <Fingerprint sha256={program.sha256} height={16} muted={isCopy} />
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
      <td>
        <span className={isCopy ? styles.tagCopy : styles.tagNew}>
          {isCopy ? "COPY" : "NEW"}
        </span>
      </td>
      <td className={styles.cellOf}>
        {isCopy && program.copyOf ? (
          <a
            className={styles.copyOf}
            href={explorerUrl(program.copyOf)}
            rel="noreferrer noopener"
            target="_blank"
          >
            {shortAddress(program.copyOf, 4)}
          </a>
        ) : (
          <span className={styles.none}>&mdash;</span>
        )}
      </td>
      <td className={styles.num}>{formatSize(program.sizeBytes)}</td>
      <td className={styles.num}>{program.deploySlot.toLocaleString("en-US")}</td>
      <td className={styles.num}>{timeAgo(program.firstSeenAt)}</td>
    </tr>
  );
}
