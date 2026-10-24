// Datos de demostración FICTICIOS, solo para la base LOCAL. Nunca datos reales.
//   npm run db:migrate:local && npm run db:seed:local
// Crea 3 usuarios de ejemplo con contraseñas aleatorias (se imprimen una sola vez; no se guardan).
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/worker/password";
import { q, querySql, runSql } from "./wrangler";

if (process.argv.includes("--remote")) {
  console.error("Este script es solo para la base local. No siembres datos de demostración en producción.");
  process.exit(1);
}
if ((querySql("--local", "SELECT COUNT(*) AS n FROM users")[0] as { n: number }).n > 0) {
  console.error("La base local ya tiene usuarios. Para empezar de cero: borra la carpeta .wrangler/state y vuelve a migrar.");
  process.exit(1);
}

let seed = 20261024;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const id = () => crypto.randomUUID();
const DAY = 86400_000;
const now = Date.now();
const iso = (t: number) => new Date(t).toISOString();

const users = [
  { id: id(), email: "validador@demo.shimaya.test", name: "Valeria Validadora (demo)", role: "validador", pass: randomBytes(9).toString("base64url") },
  { id: id(), email: "validador2@demo.shimaya.test", name: "Víctor Validador (demo)", role: "validador", pass: randomBytes(9).toString("base64url") },
  { id: id(), email: "moderador@demo.shimaya.test", name: "Marta Moderadora (demo)", role: "moderador", pass: randomBytes(9).toString("base64url") },
  { id: id(), email: "analista@demo.shimaya.test", name: "Andrés Analista (demo)", role: "analista", pass: randomBytes(9).toString("base64url") },
];

const campaigns = [
  { id: id(), name: "Gyoza de Verano (demo)", benefit: "Una porción de gyoza gratis", start: now - 20 * DAY, end: now + 25 * DAY, status: "active", len: 8, base: 10000, n: 80, redeemed: 34 },
  { id: id(), name: "Lunes de Ramen (demo)", benefit: "20% de descuento en ramen", start: now - 90 * DAY, end: now - 10 * DAY, status: "active", len: 6, base: 500, n: 40, redeemed: 22 },
  { id: id(), name: "Noche de Katsu (demo, pausada)", benefit: "Bebida gratis con tu katsu", start: now - 5 * DAY, end: now + 40 * DAY, status: "inactive", len: 8, base: 90000, n: 15, redeemed: 0 },
];

const sql: string[] = [];
for (const u of users) {
  sql.push(`INSERT INTO users (id, email, display_name, role, password_hash) VALUES (${q(u.id)}, ${q(u.email)}, ${q(u.name)}, ${q(u.role)}, ${q(await hashPassword(u.pass))});`);
}
const validators = users.filter((u) => u.role === "validador");
const moderator = users.find((u) => u.role === "moderador")!;
const sampleCodes: Record<string, string> = {};
const names = ["Cliente Ficticio Uno", "Cliente Ficticio Dos", "Cliente Ficticio Tres", "Cliente Ficticio Cuatro"];

for (const c of campaigns) {
  sql.push(
    `INSERT INTO campaigns (id, name, description, benefit, starts_at, ends_at, status, code_length, created_by) VALUES (${q(c.id)}, ${q(c.name)}, 'Campaña de demostración', ${q(c.benefit)}, ${q(iso(c.start))}, ${q(iso(c.end))}, ${q(c.status)}, ${c.len}, ${q(moderator.id)});`,
  );
  for (let i = 0; i < c.n; i++) {
    const code = String(c.base + i).padStart(c.len, "0"); // empiezan con ceros a propósito
    const cid = id();
    const created = c.start + 60_000 * i;
    const status = i === c.n - 1 && c.redeemed > 0 ? "voided" : "available";
    sql.push(
      status === "voided"
        ? `INSERT INTO coupons (id, code, campaign_id, status, void_reason, voided_at, voided_by, created_by, created_at, updated_at) VALUES (${q(cid)}, ${q(code)}, ${q(c.id)}, 'voided', 'Impreso con error (demo)', ${q(iso(now - 2 * DAY))}, ${q(moderator.id)}, ${q(moderator.id)}, ${q(iso(created))}, ${q(iso(created))});`
        : `INSERT INTO coupons (id, code, campaign_id, created_by, created_at, updated_at) VALUES (${q(cid)}, ${q(code)}, ${q(c.id)}, ${q(moderator.id)}, ${q(iso(created))}, ${q(iso(created))});`,
    );
    if (i < c.redeemed) {
      const at = Math.min(now - 3600_000, c.end - 3600_000) - Math.floor(rnd() * 14 * DAY);
      // horas de comida concentradas (12–15 h y 19–22 h, hora de Lima)
      const day = new Date(Math.max(at, c.start + 3600_000));
      const limaHour = pick([12, 13, 13, 14, 19, 20, 20, 21, 15, 22]);
      day.setUTCHours(limaHour + 5, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
      const redeemedAt = Math.min(day.getTime(), now - 60_000);
      const rid = id();
      sql.push(
        `INSERT INTO redemptions (id, coupon_id, campaign_id, redeemed_by, redeemed_at, idempotency_key) VALUES (${q(rid)}, ${q(cid)}, ${q(c.id)}, ${q(pick(validators).id)}, ${q(iso(redeemedAt))}, ${q(`demo-${rid}`)});`,
      );
      if (i % 4 === 0 && c.len === 8) {
        const contact = id();
        const n = i / 4;
        sql.push(
          `INSERT INTO customer_contacts (id, first_name, last_name, phone, email, created_at) VALUES (${q(contact)}, ${q(names[n % names.length]!.split(" ")[0]!)}, ${q(`Ficticio ${n + 1}`)}, ${q(`90000${String(1000 + n)}`)}, ${q(`cliente${n + 1}@example.com`)}, ${q(iso(redeemedAt))});`,
          `INSERT INTO marketing_consents (id, contact_id, redemption_id, consent_text_version, consent_text, consented_at, recorded_by) VALUES (${q(id())}, ${q(contact)}, ${q(rid)}, '2026-10-v1', 'Texto de consentimiento de demostración', ${q(iso(redeemedAt))}, ${q(validators[0]!.id)});`,
        );
      }
      sql.push(`INSERT INTO audit_logs (at, actor_user_id, action, entity_type, entity_id) VALUES (${q(iso(redeemedAt))}, ${q(validators[0]!.id)}, 'coupon_redeemed', 'redemption', ${q(rid)});`);
    } else if (i === c.redeemed) {
      sampleCodes[c.name] = code;
    }
  }
}

runSql("--local", sql.join("\n"));

console.log("\nDatos de demostración cargados (todo ficticio).\n");
console.log("Usuarios (contraseña mostrada solo ahora):");
for (const u of users) console.log(`  ${u.role.padEnd(10)} ${u.email.padEnd(32)} ${u.pass}`);
const c0 = campaigns[0]!;
console.log("\nCódigos para probar a mano:");
console.log(`  ${sampleCodes[c0.name]}  → disponible (campaña vigente)`);
console.log(`  ${sampleCodes[campaigns[1]!.name]}  → vencido (campaña terminada)`);
console.log(`  ${sampleCodes[campaigns[2]!.name]}  → campaña pausada`);
console.log(`  ${String(c0.base).padStart(c0.len, "0")}  → ya canjeado`);
console.log(`  ${String(c0.base + c0.n - 1).padStart(c0.len, "0")}  → anulado`);
console.log("  99999999  → no existe");
