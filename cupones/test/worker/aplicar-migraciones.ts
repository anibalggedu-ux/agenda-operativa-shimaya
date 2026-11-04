import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Aplica las migraciones reales (migrations/*.sql) a la D1 local antes de cada archivo de pruebas.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
