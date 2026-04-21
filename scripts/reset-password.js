#!/usr/bin/env node
/**
 * Reset a user's password from the command line.
 *
 * Usage:
 *   node scripts/reset-password.js <username> <new-password>
 *
 * Docker:
 *   docker compose exec app node scripts/reset-password.js admin MyNewPass123
 */

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
  console.error("Usage: node scripts/reset-password.js <username> <new-password>");
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error("Password must be at least 6 characters");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query(
      'SELECT username, role FROM "User" WHERE username = $1',
      [username]
    );

    if (rows.length === 0) {
      console.error(`User "${username}" not found.`);
      const all = await pool.query('SELECT username, role FROM "User" ORDER BY "createdAt"');
      console.error("Available users:", all.rows.map((u) => `${u.username} (${u.role})`).join(", "));
      process.exit(1);
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE "User" SET password = $1 WHERE username = $2', [hashed, username]);

    console.log(`Password reset for "${username}" (${rows[0].role}) successfully.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
