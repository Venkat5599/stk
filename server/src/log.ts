import pino from "pino";

/** Shared logger options. Fastify builds its own instance from these so its
 *  request logs and the poller's logs come out in one format. */
export const logOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  // The API key rides in the RPC URL; it must never reach a log line.
  redact: { paths: ["rpcUrl", "url"], censor: "[redacted]" },
};

export const log = pino(logOptions);
