import { defineConfig, env } from "prisma/config";

process.loadEnvFile();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx scripts/seed-admin.ts",
  },
});
