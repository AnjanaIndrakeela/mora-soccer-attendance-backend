import { defineConfig } from "vitest/config";

// Set before anything loads src/config/env.ts; inherited by globalSetup and test workers.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://mora:mora@localhost:5432/mora_soccer_test?schema=public",
  JWT_SECRET: "test-jwt-secret",
  QR_TOKEN_SECRET: "test-qr-secret",
  CLIENT_URL: "http://localhost:3000",
});

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
  },
});
