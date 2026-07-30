/*
  The site's binding to the stk API.

  This is kept self-contained rather than importing @stk/sdk, because Vercel
  uploads this directory on its own and a workspace dependency would not arrive
  with it. The shapes below must stay in step with packages/sdk.
*/

const API_BASE = process.env.API_URL ?? "http://localhost:3021";

/** In production an unset API_URL would quietly render an empty site against
 *  localhost. An empty page and a misconfigured one must never look alike. */
const MISCONFIGURED = !process.env.API_URL && process.env.NODE_ENV === "production";

const TIMEOUT_MS = 10_000;

/** Declared here rather than imported from @stk/sdk: Vercel uploads this
 *  directory on its own, so a workspace import would not arrive with it.
 *  These must stay in step with packages/sdk. */
type TimeWindow = "today" | "week" | "month";
type ProgramVerdict = "new" | "copy";

export interface Program {
  programId: string;
  firstSeenAt: string;
  deploySlot: number;
  sizeBytes: number;
  sha256: string;
  verdict: ProgramVerdict;
  copyOf: string | null;
}

export interface ProgramPage {
  items: Program[];
  total: number;
  window: TimeWindow;
}

export interface Stats {
  window: TimeWindow;
  deploys: number;
  copies: number;
  fresh: number;
  copyRate: number | null;
  recordBeganAt: string | null;
}

export class ApiUnavailableError extends Error {
  constructor(path: string, cause: string) {
    super(`stk API unavailable (${cause}) for ${path}`);
    this.name = "ApiUnavailableError";
  }
}

async function get<T>(path: string): Promise<T> {
  if (MISCONFIGURED) throw new ApiUnavailableError(path, "API_URL not configured");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      // the record moves on the order of minutes; 30s keeps a burst of readers
      // off the backend without the page ever looking stale
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiUnavailableError(path, err instanceof Error ? err.name : "network error");
  }
  if (!res.ok) throw new ApiUnavailableError(path, `HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiUnavailableError(path, "unparseable response");
  }
}

export function fetchPrograms(window: TimeWindow = "today", limit = 60): Promise<ProgramPage> {
  return get<ProgramPage>(`/api/programs?window=${window}&limit=${limit}`);
}

export function fetchStats(window: TimeWindow = "today"): Promise<Stats> {
  return get<Stats>(`/api/stats?window=${window}`);
}

export function shortAddress(address: string, edge = 4): string {
  if (address.length <= edge * 2 + 1) return address;
  return `${address.slice(0, edge)}\u2026${address.slice(-edge)}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Relative time, floored — "just now" for anything under a minute. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Block explorer for an address. Overridable so a fork can point elsewhere. */
const EXPLORER_BASE = process.env["EXPLORER_BASE_URL"] ?? "https://solscan.io/account";

export const explorerUrl = (id: string) => `${EXPLORER_BASE}/${id}`;

/** The public API this deployment reads, for linking readers straight at it. */
export const apiBaseUrl = API_BASE;
