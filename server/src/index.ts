import Fastify, { type FastifyError } from "fastify";
import { config } from "./config.js";
import { migrate, sql } from "./db.js";
import { log, logOptions } from "./log.js";
import { startPoller } from "./poller.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({ logger: logOptions });

// The record is public, so anything may read it from anywhere.
app.addHook("onRequest", async (_req, reply) => {
  reply.header("access-control-allow-origin", "*");
});

registerRoutes(app);

// A failed query must surface as a 500. Returning an empty list here would
// tell a reader "nothing deployed", which is a different and false claim.
app.setErrorHandler((err: FastifyError, _req, reply) => {
  app.log.error({ err: err.message }, "request failed");
  reply.status(err.statusCode ?? 500).send({ error: "internal error" });
});

async function main(): Promise<void> {
  await migrate();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  log.info({ port: config.port }, "stk: api listening");
  startPoller();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info({ signal }, "stk: shutting down");
    void app
      .close()
      .then(() => sql.end({ timeout: 5 }))
      .finally(() => process.exit(0));
  });
}

main().catch((err) => {
  log.error({ err: String(err) }, "stk: failed to start");
  process.exit(1);
});
