/**
 * Starts a local embedded PostgreSQL instance for development / testing.
 *
 *   npm run db:local
 *
 * No Docker or system Postgres install required — a real Postgres binary is
 * downloaded and run against a local data directory (./.pgdata). The instance
 * stays up until you press Ctrl+C. Run migrations / import / dev in a second
 * terminal while this is running.
 *
 * Connection (matches .env DATABASE_URL):
 *   postgresql://postgres:postgres@localhost:5433/familyday
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), ".pgdata");
const PORT = 5433;
const DB_NAME = "familyday";

async function main() {
  const alreadyInitialised = existsSync(path.join(DATA_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  if (!alreadyInitialised) {
    console.log("Initialising local Postgres data directory (first run)…");
    await pg.initialise();
  }

  console.log(`Starting Postgres on port ${PORT}…`);
  await pg.start();

  // Create the app database if it does not already exist.
  try {
    await pg.createDatabase(DB_NAME);
    console.log(`Created database "${DB_NAME}".`);
  } catch {
    console.log(`Database "${DB_NAME}" already exists.`);
  }

  console.log(
    `\nLocal Postgres is running:\n  postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}\n\nLeave this running. In another terminal:\n  npm run prisma:migrate\n  npm run import\n  npm run dev\n\nPress Ctrl+C to stop.`
  );

  const shutdown = async () => {
    console.log("\nStopping Postgres…");
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start local Postgres:", err);
  process.exit(1);
});
