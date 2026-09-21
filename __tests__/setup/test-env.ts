// Runs in each test worker before test modules are imported, so the Prisma
// client (lib/db) connects to an isolated "test" schema, never touching the
// imported master data in the default "public" schema.
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5433/familyday?schema=test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.ADMIN_PIN = "2026";
process.env.SESSION_SECRET = "test-secret-at-least-16-characters-long-000";
