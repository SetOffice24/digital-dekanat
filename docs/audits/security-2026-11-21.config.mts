import { defineConfig } from "vitest/config";
import path from "node:path";

// Evidence reproductions deliberately excluded from the regular regression suite.
export default defineConfig({
  test: { environment: "node", include: ["docs/audits/security-2026-11-21.repro.ts"], fileParallelism: false },
  resolve: { alias: {
    "@": path.resolve(process.cwd(), "src"),
    "server-only": path.resolve(process.cwd(), "tests/server-only-stub.ts"),
  } },
});
