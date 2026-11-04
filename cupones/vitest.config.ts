import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import path from "node:path";

// Pruebas de integración del Worker: corren dentro de workerd con una D1 local real
// (Miniflare) a la que se aplican las MISMAS migraciones que en producción.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        main: "./src/worker/index.ts",
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ["test/worker/**/*.test.ts"],
      setupFiles: ["./test/worker/aplicar-migraciones.ts"],
    },
  };
});
