import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const TEST_URL = "postgresql://postgres:postgres@localhost:5433/familyday?schema=test";

// Prepare a clean "test" schema before the suite runs. Scoped to the `test`
// schema only — the imported data in `public` is never touched.
export default async function globalSetup() {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  try {
    await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS test CASCADE");
    await prisma.$executeRawUnsafe("CREATE SCHEMA test");
  } catch (err) {
    console.error(
      "\nCould not reset the test schema. Is the local Postgres running? (npm run db:local)\n"
    );
    throw err;
  } finally {
    await prisma.$disconnect();
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_URL, DIRECT_URL: TEST_URL },
  });
}
