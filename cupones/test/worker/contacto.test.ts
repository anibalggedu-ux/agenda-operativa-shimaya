import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CONSENT_DEFAULT_CHECKED, CONSENT_TEXT, CONSENT_TEXT_VERSION } from "../../src/shared/consent";
import { campaign, count, coupon, key, lookup, makeApi, redeem, userWithSession } from "./helpers";

const V = CONSENT_TEXT_VERSION;
const contact = (api: ReturnType<typeof makeApi>, cookie: string, id: string, body: object, db?: D1Database) =>
  api.call("POST", `/api/validador/redemptions/${id}/contact`, { cookie, body, db });

async function redeemed() {
  const api = makeApi();
  const v = await userWithSession(api, "validador");
  const camp = await campaign(api);
  const c = await coupon(camp.id);
  const red = await redeem(api, v, c.code);
  return { api, v, camp, c, id: red.body.redemption.id as string };
}

describe("registro opcional de contacto", () => {
  it("el consentimiento parte desmarcado", () => {
    expect(CONSENT_DEFAULT_CHECKED).toBe(false);
  });

  it("canje sin datos del cliente: se completa normalmente y no se crea ningún contacto", async () => {
    const before = await count("SELECT COUNT(*) AS n FROM customer_contacts");
    const { api, v, c } = await redeemed();
    expect((await lookup(api, v, c.code)).body.state).toBe("redeemed");
    expect(await count("SELECT COUNT(*) AS n FROM customer_contacts")).toBe(before);
    expect(await count("SELECT COUNT(*) AS n FROM marketing_consents mc JOIN redemptions r ON r.id = mc.redemption_id WHERE r.coupon_id = ?", c.id)).toBe(0);
  });

  it("con consentimiento y teléfono: guarda contacto, consentimiento (fecha, versión, texto) y vínculo con el canje", async () => {
    const { api, v, id } = await redeemed();
    const r = await contact(api, v.cookie, id, { firstName: " Lucía ", lastName: "Quispe", phone: "+51 987-654-321", email: "", consent: true, consentTextVersion: V });
    expect(r.status).toBe(201);
    const row = await env.DB.prepare(
      `SELECT cc.first_name, cc.last_name, cc.phone, cc.email, mc.consent_text_version, mc.consent_text, mc.consented_at, mc.redemption_id, mc.recorded_by
         FROM marketing_consents mc JOIN customer_contacts cc ON cc.id = mc.contact_id WHERE mc.redemption_id = ?`,
    )
      .bind(id)
      .first<Record<string, string>>();
    expect(row).toMatchObject({
      first_name: "Lucía",
      last_name: "Quispe",
      phone: "+51987654321",
      email: null,
      consent_text_version: V,
      consent_text: CONSENT_TEXT,
      consented_at: "2026-10-24T17:00:00.000Z",
      redemption_id: id,
      recorded_by: v.id,
    });
  });

  it("solo correo es suficiente (no se exigen teléfono y correo a la vez); solo nombre no", async () => {
    const a = await redeemed();
    expect((await contact(a.api, a.v.cookie, a.id, { email: "Cliente@Ejemplo.COM", consent: true, consentTextVersion: V })).status).toBe(201);
    const stored = await env.DB.prepare("SELECT cc.email FROM marketing_consents mc JOIN customer_contacts cc ON cc.id = mc.contact_id WHERE mc.redemption_id = ?").bind(a.id).first<{ email: string }>();
    expect(stored?.email).toBe("cliente@ejemplo.com");

    const b = await redeemed();
    const r = await contact(b.api, b.v.cookie, b.id, { firstName: "Solo Nombre", consent: true, consentTextVersion: V });
    expect(r.status).toBe(422);
    expect(r.body.fieldErrors.contact).toMatch(/al menos un teléfono o un correo/);
  });

  it("valida solo los campos con contenido: vacíos pasan, con contenido inválido fallan", async () => {
    const { api, v, id } = await redeemed();
    const bad = await contact(api, v.cookie, id, { phone: "abc", email: "no-es-correo", consent: true, consentTextVersion: V });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.fieldErrors).sort()).toEqual(["email", "phone"]);
    const ok = await contact(api, v.cookie, id, { firstName: "", lastName: "", phone: "", email: "ok@ejemplo.com", consent: true, consentTextVersion: V });
    expect(ok.status).toBe(201);
  });

  it("ingresar teléfono o correo SIN consentimiento no guarda nada", async () => {
    const { api, v, id } = await redeemed();
    const r = await contact(api, v.cookie, id, { phone: "987654321", email: "a@b.co", consent: false, consentTextVersion: V });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("consent_required");
    expect(await count("SELECT COUNT(*) AS n FROM marketing_consents WHERE redemption_id = ?", id)).toBe(0);
    const omitido = await contact(api, v.cookie, id, { phone: "987654321", consentTextVersion: V });
    expect(omitido.status).toBe(422);
  });

  it("versión de texto de consentimiento desconocida se rechaza (el servidor no confía en texto del navegador)", async () => {
    const { api, v, id } = await redeemed();
    const r = await contact(api, v.cookie, id, { phone: "987654321", consent: true, consentTextVersion: "inventada" });
    expect(r.status).toBe(422);
    const extra = await contact(api, v.cookie, id, { phone: "987654321", consent: true, consentTextVersion: V, consentText: "otro texto" });
    expect(extra.status).toBe(422);
  });

  it("reintento del mismo envío no duplica el contacto (idempotente)", async () => {
    const { api, v, id } = await redeemed();
    const body = { phone: "987654321", consent: true, consentTextVersion: V };
    const [a, b, c] = await Promise.all([contact(api, v.cookie, id, body), contact(api, v.cookie, id, body), contact(api, v.cookie, id, body)]);
    expect([a.status, b.status, c.status].every((s) => s === 201 || s === 200)).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM marketing_consents WHERE redemption_id = ?", id)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM customer_contacts WHERE id IN (SELECT contact_id FROM marketing_consents WHERE redemption_id = ?)", id)).toBe(1);
    const again = await contact(api, v.cookie, id, body);
    expect(again.body).toEqual({ saved: true, alreadyRegistered: true });
  });

  it("NO se fusionan personas por compartir teléfono o correo: cada canje con consentimiento crea su propio contacto", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const c = await coupon(camp.id);
      ids.push((await redeem(api, v, c.code)).body.redemption.id);
    }
    for (const id of ids) await contact(api, v.cookie, id, { phone: "955555555", email: "familia@ejemplo.com", consent: true, consentTextVersion: V });
    expect(await count("SELECT COUNT(*) AS n FROM customer_contacts WHERE phone = '955555555'")).toBe(2);
  });

  it("si falla el guardado del contacto, el cupón sigue canjeado y no se puede canjear de nuevo", async () => {
    const { api, v, c, id } = await redeemed();
    const failing = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") {
          return (sql: string) => {
            if (sql.includes("customer_contacts")) throw new Error("fallo simulado de D1");
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const r = await contact(api, v.cookie, id, { phone: "987654321", consent: true, consentTextVersion: V }, failing);
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("contact_save_failed");
    expect(r.body.message).toMatch(/canje ya quedó registrado/);
    expect(await count("SELECT COUNT(*) AS n FROM marketing_consents WHERE redemption_id = ?", id)).toBe(0);
    expect((await lookup(api, v, c.code)).body.state).toBe("redeemed");
    expect((await redeem(api, v, c.code)).status).toBe(409);
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(1);
    // y el reintento, ya con la base sana, funciona
    expect((await contact(api, v.cookie, id, { phone: "987654321", consent: true, consentTextVersion: V })).status).toBe(201);
  });

  it("solo quien hizo el canje puede asociarle contacto (otro validador ve 'no existe')", async () => {
    const { api, id } = await redeemed();
    const other = await userWithSession(api, "validador", "otro");
    const r = await contact(api, other.cookie, id, { phone: "987654321", consent: true, consentTextVersion: V });
    expect(r.status).toBe(404);
    expect(await count("SELECT COUNT(*) AS n FROM marketing_consents WHERE redemption_id = ?", id)).toBe(0);
  });

  it("pasada la ventana de 30 minutos ya no se puede asociar contacto", async () => {
    const { api, v, id } = await redeemed();
    api.clock.advance(31 * 60_000);
    const r = await contact(api, v.cookie, id, { phone: "987654321", consent: true, consentTextVersion: V });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("contact_window_closed");
  });

  it("la auditoría del contacto no guarda datos personales", async () => {
    const { api, v, id } = await redeemed();
    await contact(api, v.cookie, id, { firstName: "Verónica", lastName: "Huamán", phone: "944112233", email: "vero.audit@ejemplo.com", consent: true, consentTextVersion: V });
    const rows = await env.DB.prepare("SELECT * FROM audit_logs WHERE entity_id = ?").bind(id).all();
    const text = JSON.stringify(rows.results);
    expect(rows.results.length).toBeGreaterThan(0);
    for (const pii of ["Verónica", "Huamán", "944112233", "vero.audit@ejemplo.com"]) expect(text).not.toContain(pii);
  });
});
