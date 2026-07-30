"use client";

import styles from "./page.module.css";

/*
  An outage renders as an outage. The one thing this must never do is look like
  a quiet day on the chain.
*/
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.page}>
      <div className={styles.outage}>
        <h1 className={styles.outageTitle}>The record is unreachable</h1>
        <p className={styles.outageBody}>
          stk could not reach its backend, so it does not know what deployed. The chain
          kept its own record; this page simply cannot read it right now.
        </p>
        <button type="button" className={styles.retry} onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
