/**
 * Simple migration runner using pg directly.
 * Bypasses Prisma CLI entirely - much more reliable in Docker.
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Ensure _prisma_migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    VARCHAR(36) NOT NULL PRIMARY KEY,
        "checksum"              VARCHAR(64) NOT NULL,
        "finished_at"           TIMESTAMPTZ,
        "migration_name"        VARCHAR(255) NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        TIMESTAMPTZ,
        "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Find migration directories
    const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("No migrations directory found, skipping.");
      return;
    }

    const dirs = fs
      .readdirSync(migrationsDir)
      .filter((d) => {
        const full = path.join(migrationsDir, d);
        return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "migration.sql"));
      })
      .sort();

    if (dirs.length === 0) {
      console.log("No migrations found.");
      return;
    }

    for (const dir of dirs) {
      // Check if already applied
      const { rows } = await pool.query(
        `SELECT id FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL`,
        [dir]
      );

      if (rows.length > 0) {
        console.log(`  ✓ ${dir} (already applied)`);
        continue;
      }

      // Read and execute SQL
      const sqlPath = path.join(migrationsDir, dir, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");

      console.log(`  → Applying ${dir}...`);

      const migrationId = crypto.randomUUID();

      // Record start
      await pool.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at")
         VALUES ($1, $2, $3, now())
         ON CONFLICT DO NOTHING`,
        [migrationId, checksum, dir]
      );

      try {
        await pool.query(sql);

        // Record completion
        await pool.query(
          `UPDATE "_prisma_migrations" SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1`,
          [migrationId]
        );

        console.log(`  ✓ ${dir} applied successfully`);
      } catch (err) {
        console.error(`  ✗ ${dir} failed:`, err.message);
        await pool.query(
          `UPDATE "_prisma_migrations" SET "logs" = $1 WHERE "id" = $2`,
          [err.message, migrationId]
        );
        throw err;
      }
    }

    console.log("All migrations applied successfully!");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
