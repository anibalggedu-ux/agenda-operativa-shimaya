// Bindings del Worker (mantener alineado con wrangler.jsonc).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    /** Solo existe en pruebas (ver vitest.config.ts). */
    TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
  }
}
interface Env extends Cloudflare.Env {}
