// A typed client for the stk API.
//
// The record is public and read-only, so there is no auth and no key. Point it
// at the hosted API or at your own instance.
//
//   const stk = new Stk();
//   const { items } = await stk.programs({ window: "today" });

/**
 * Where the client points when no `baseUrl` is given.
 *
 * Set `STK_API_URL` to target your own instance without touching call sites.
 * The literal is the public hosted record, documented in the README.
 */
export const DEFAULT_BASE_URL =
  process.env["STK_API_URL"] ?? "https://stk-api.187.127.137.136.sslip.io";

export type Window = "today" | "week" | "month";
export type Verdict = "new" | "copy";

export interface Program {
  /** base58 program id */
  programId: string;
  /** when stk first saw it, ISO 8601 — not necessarily when it deployed */
  firstSeenAt: string;
  deploySlot: number;
  sizeBytes: number;
  /** SHA-256 of the deployed bytecode, hex */
  sha256: string;
  verdict: Verdict;
  /** the program that carried these exact bytes first; null when verdict is "new" */
  copyOf: string | null;
}

export interface ProgramPage {
  items: Program[];
  /** rows in the whole window, which may exceed items.length */
  total: number;
  window: Window;
}

export interface Stats {
  window: Window;
  deploys: number;
  copies: number;
  fresh: number;
  /** copies / deploys, or null when nothing has been seen yet */
  copyRate: number | null;
  /** the oldest row held. Everything before this is outside the record. */
  recordBeganAt: string | null;
}

/**
 * Thrown when the API cannot be reached or answers with an error.
 *
 * Catching this and rendering zero rows would tell your reader that nothing
 * deployed, which is a different claim from "we cannot currently tell you".
 * Show an outage.
 */
export class StkUnavailableError extends Error {
  constructor(path: string, cause: string) {
    super(`stk API unavailable (${cause}) for ${path}`);
    this.name = "StkUnavailableError";
  }
}

export interface StkOptions {
  /** Defaults to the hosted API. A trailing slash is trimmed for you. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Swap the HTTP implementation — a test double, an instrumented fetch. */
  fetch?: typeof globalThis.fetch;
  /**
   * Merged into every request. This is the hook a framework needs: Next.js
   * passes `{ next: { revalidate: 30 } }` here for ISR, which is why nothing
   * in this package imports from a framework.
   */
  requestInit?: RequestInit;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class Stk {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #requestInit: RequestInit;

  constructor(options: StkOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("Stk: no fetch available. Use Node 18+, or pass options.fetch.");
    }
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // bind so a passed-in fetch is never called with the wrong receiver
    this.#fetch = fetchImpl.bind(globalThis);
    this.#requestInit = options.requestInit ?? {};
  }

  async #get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...this.#requestInit,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      throw new StkUnavailableError(path, err instanceof Error ? err.name : "network error");
    }
    if (!res.ok) throw new StkUnavailableError(path, `HTTP ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new StkUnavailableError(path, "unparseable response");
    }
  }

  /** Programs first seen inside the window, newest first. */
  programs(opts: { window?: Window; limit?: number } = {}): Promise<ProgramPage> {
    const params = new URLSearchParams({ window: opts.window ?? "today" });
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    return this.#get<ProgramPage>(`/api/programs?${params}`);
  }

  /** How many deployed in the window, and how many were copies. */
  stats(window: Window = "today"): Promise<Stats> {
    return this.#get<Stats>(`/api/stats?window=${window}`);
  }

  /** True when the API answers. */
  async health(): Promise<boolean> {
    const res = await this.#get<{ ok: boolean }>("/health");
    return res.ok === true;
  }
}

/** Shorten a base58 address for display without losing its identity. */
export function shortAddress(address: string, edge = 4): string {
  if (address.length <= edge * 2 + 1) return address;
  return `${address.slice(0, edge)}\u2026${address.slice(-edge)}`;
}
