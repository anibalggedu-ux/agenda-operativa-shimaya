import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { campaign, count, coupon, makeApi, redeem, lookup, userWithSession } from "./helpers";

describe("anulación de cupones", () => {
  it("anula un cupón disponible con motivo, y deja de poder canjearse", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const r = await api.call("POST", `/api/admin/coupons/${c.id}/void`, { cookie: m.cookie, body: { reason: "Impreso con error" } });
    expect(r.status).toBe(200);
    expect((await lookup(api, v, c.code)).body.state).toBe("voided");
    expect((await redeem(api, v, c.code)).status).toBe(409);
    const row = await env.DB.prepare("SELECT void_reason, voided_by FROM coupons WHERE id = ?").bind(c.id).first();
    expect(row).toEqual({ void_reason: "Impreso con error", voided_by: m.id });
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'coupon_voided' AND entity_id = ? AND actor_user_id = ?", c.id, m.id)).toBe(1);
  });

  it("exige motivo", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const c = await coupon((await campaign(api)).id);
    expect((await api.call("POST", `/api/admin/coupons/${c.id}/void`, { cookie: m.cookie, body: {} })).status).toBe(422);
    expect((await api.call("POST", `/api/admin/coupons/${c.id}/void`, { cookie: m.cookie, body: { reason: " " } })).status).toBe(422);
  });

  it("NO se puede anular un cupón ya canjeado ni anular dos veces", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const used = await coupon(camp.id);
    await redeem(api, v, used.code);
    const r = await api.call("POST", `/api/admin/coupons/${used.id}/void`, { cookie: m.cookie, body: { reason: "intento" } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("not_voidable");
    expect((await lookup(api, v, used.code)).body.state).toBe("redeemed");

    const c = await coupon(camp.id);
    await api.call("POST", `/api/admin/coupons/${c.id}/void`, { cookie: m.cookie, body: { reason: "primera" } });
    expect((await api.call("POST", `/api/admin/coupons/${c.id}/void`, { cookie: m.cookie, body: { reason: "segunda" } })).status).toBe(409);
  });
});

describe("la base de datos protege el historial aunque se salte la aplicación", () => {
  it("un cupón canjeado o anulado no vuelve a disponible", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const used = await coupon(camp.id);
    await redeem(api, v, used.code);
    await expect(env.DB.prepare("UPDATE coupons SET status = 'available' WHERE id = ?").bind(used.id).run()).rejects.toThrow(/estado_de_cupon_inmutable/);
    const voided = await coupon(camp.id, { status: "voided" });
    await expect(env.DB.prepare("UPDATE coupons SET status = 'available', void_reason = NULL, voided_at = NULL WHERE id = ?").bind(voided.id).run()).rejects.toThrow();
    await expect(env.DB.prepare("DELETE FROM coupons WHERE id = ?").bind(used.id).run()).rejects.toThrow();
  });

  it("no se pueden editar ni borrar canjes, consentimientos ni auditoría", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const c = await coupon((await campaign(api)).id);
    const red = await redeem(api, v, c.code);
    const id = red.body.redemption.id;
    await expect(env.DB.prepare("UPDATE redemptions SET redeemed_by = ? WHERE id = ?").bind(v.id, id).run()).rejects.toThrow(/canje_inmutable/);
    await expect(env.DB.prepare("DELETE FROM redemptions WHERE id = ?").bind(id).run()).rejects.toThrow(/canje_inmutable/);
    await expect(env.DB.prepare("UPDATE audit_logs SET action = 'x' WHERE entity_id = ?").bind(id).run()).rejects.toThrow(/auditoria_inmutable/);
    await expect(env.DB.prepare("DELETE FROM audit_logs WHERE entity_id = ?").bind(id).run()).rejects.toThrow(/auditoria_inmutable/);
  });

  it("restricciones: código único, solo dígitos, un solo canje por cupón", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id, { code: "11122233" });
    await expect(coupon(camp.id, { code: "11122233" })).rejects.toThrow();
    await expect(coupon(camp.id, { code: "1112223x" })).rejects.toThrow();
    await expect(coupon(camp.id, { code: "123" })).rejects.toThrow();
    await redeem(api, v, c.code);
    await expect(
      env.DB.prepare("INSERT INTO redemptions (id, coupon_id, campaign_id, redeemed_by, redeemed_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), c.id, camp.id, v.id, "2026-10-24T17:00:00.000Z", "otra-clave-distinta-1")
        .run(),
    ).rejects.toThrow();
  });
});

describe("campañas, cupones individuales y consultas del moderador", () => {
  const body = (o: object = {}) => ({
    name: `Verano ${crypto.randomUUID().slice(0, 6)}`,
    description: "Prueba",
    benefit: "Una porción de gyoza",
    startsAt: "2026-12-01T05:00:00.000Z",
    endsAt: "2027-01-01T05:00:00.000Z",
    status: "active",
    codeLength: 8,
    ...o,
  });

  it("crea campañas con validación (fin posterior al inicio, longitud 4–16, nombre único)", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const ok = body();
    expect((await api.call("POST", "/api/admin/campaigns", { cookie: m.cookie, body: ok })).status).toBe(201);
    expect((await api.call("POST", "/api/admin/campaigns", { cookie: m.cookie, body: ok })).status).toBe(409);
    expect((await api.call("POST", "/api/admin/campaigns", { cookie: m.cookie, body: body({ endsAt: "2026-11-01T00:00:00.000Z" }) })).status).toBe(422);
    expect((await api.call("POST", "/api/admin/campaigns", { cookie: m.cookie, body: body({ codeLength: 3 }) })).status).toBe(422);
    expect((await api.call("POST", "/api/admin/campaigns", { cookie: m.cookie, body: body({ codeLength: 17 }) })).status).toBe(422);
  });

  it("la longitud del código no se puede cambiar cuando ya hay cupones", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const camp = await campaign(api, { codeLength: 8 });
    await coupon(camp.id);
    const r = await api.call("PATCH", `/api/admin/campaigns/${camp.id}`, { cookie: m.cookie, body: body({ codeLength: 10 }) });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("code_length_locked");
    expect((await api.call("PATCH", `/api/admin/campaigns/${camp.id}`, { cookie: m.cookie, body: body({ codeLength: 8, status: "inactive" }) })).status).toBe(200);
  });

  it("desactivar la campaña impide nuevos canjes", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    await api.call("PATCH", `/api/admin/campaigns/${camp.id}`, { cookie: m.cookie, body: body({ name: camp.name, status: "inactive", startsAt: "2026-01-01T05:00:00.000Z", endsAt: "2027-12-31T05:00:00.000Z" }) });
    expect((await redeem(api, v, c.code)).status).toBe(409);
  });

  it("cupón individual: valida longitud y unicidad global", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const a = await campaign(api, { codeLength: 6 });
    const b = await campaign(api, { codeLength: 6 });
    expect((await api.call("POST", "/api/admin/coupons", { cookie: m.cookie, body: { campaignId: a.id, code: "001122" } })).status).toBe(201);
    expect((await api.call("POST", "/api/admin/coupons", { cookie: m.cookie, body: { campaignId: b.id, code: "001122" } })).status).toBe(409);
    expect((await api.call("POST", "/api/admin/coupons", { cookie: m.cookie, body: { campaignId: a.id, code: "00112" } })).status).toBe(422);
    expect((await api.call("POST", "/api/admin/coupons", { cookie: m.cookie, body: { campaignId: a.id, code: "00112x" } })).status).toBe(422);
  });

  it("listado de cupones con filtros por estado efectivo, campaña y prefijo de código; paginado en servidor", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    for (let i = 0; i < 5; i++) await coupon(camp.id, { code: `9001000${i}` });
    await redeem(api, v, "90010000");
    const search = (b: object) => api.call("POST", "/api/admin/coupons/search", { cookie: m.cookie, body: { campaignId: camp.id, ...b } });
    expect((await search({})).body.total).toBe(5);
    expect((await search({ state: "redeemed" })).body.total).toBe(1);
    expect((await search({ state: "available" })).body.total).toBe(4);
    expect((await search({ code: "9001000" })).body.total).toBe(5);
    expect((await search({ code: "90010003" })).body.items[0].code).toBe("90010003");
    const p = await search({ pageSize: 2, page: 3 });
    expect(p.body).toMatchObject({ total: 5, page: 3, pageSize: 2 });
    expect(p.body.items).toHaveLength(1);
    expect((await search({ pageSize: 1000 })).status).toBe(422);
  });

  it("historial de canjes: filtros por trabajador, campaña y fechas, con contacto cuando existe", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const w1 = await userWithSession(api, "validador", "w1");
    const w2 = await userWithSession(api, "validador", "w2");
    const camp = await campaign(api);
    const r1 = await redeem(api, w1, (await coupon(camp.id)).code);
    await redeem(api, w2, (await coupon(camp.id)).code);
    await api.call("POST", `/api/validador/redemptions/${r1.body.redemption.id}/contact`, {
      cookie: w1.cookie,
      body: { firstName: "Elena", email: "elena@ejemplo.com", consent: true, consentTextVersion: "2026-10-v1" },
    });
    const get = (q: string) => api.call("GET", `/api/admin/redemptions?campaignId=${camp.id}&${q}`, { cookie: m.cookie });
    expect((await get("")).body.total).toBe(2);
    const byW1 = await get(`workerId=${w1.id}`);
    expect(byW1.body.total).toBe(1);
    expect(byW1.body.items[0]).toMatchObject({ firstName: "Elena", email: "elena@ejemplo.com" });
    expect((await get("contact=sin")).body.total).toBe(1);
    expect((await get("contact=con")).body.total).toBe(1);
    expect((await get("from=2026-10-24&to=2026-10-24")).body.total).toBe(2);
    expect((await get("from=2026-10-25")).body.total).toBe(0);
    const clients = await api.call("GET", `/api/admin/clients?campaignId=${camp.id}`, { cookie: m.cookie });
    expect(clients.body.total).toBe(1);
    expect(clients.body.items[0]).toMatchObject({ firstName: "Elena", consentVersion: "2026-10-v1", campaign: camp.name });
  });

  it("auditoría consultable por acción y nunca expone contraseñas, tokens ni códigos", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id, { code: "31415926" });
    await redeem(api, v, c.code);
    const all = await api.call("GET", "/api/admin/audit?pageSize=100", { cookie: m.cookie });
    expect(all.status).toBe(200);
    const text = JSON.stringify(all.body);
    expect(text).not.toContain("31415926");
    expect(text).not.toMatch(/pbkdf2|password|token/i);
    const logins = await api.call("GET", "/api/admin/audit?action=coupon_redeemed", { cookie: m.cookie });
    expect(logins.body.items.every((i: { action: string }) => i.action === "coupon_redeemed")).toBe(true);
  });
});
