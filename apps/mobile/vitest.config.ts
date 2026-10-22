import { defineConfig } from "vitest/config";

/**
 * Unit tests for the app's pure logic (src/lib); screens are checked in the web build. The app's
 * tsconfig extends Expo's, which the test transformer cannot resolve, so tests use the repo base.
 */
export default defineConfig({
  tsconfig: "../../tsconfig.base.json",
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
