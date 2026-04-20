import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL || "postgres://feed2040:feed2040@localhost:5432/feed2040",
  },
});
