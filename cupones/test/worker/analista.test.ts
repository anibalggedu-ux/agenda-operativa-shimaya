import { describe, expect, it } from "vitest";
import { CONSENT_TEXT_VERSION } from "../../src/shared/consent";
import { campaign, coupon, makeApi, redeem, redemptionAt, userWithSession } from "./helpers";

describe("el analista solo recibe estadísticas agregadas", () => {
  it("las respuestas no contienen datos personales, códigos ni identificadores de canje/cliente/trabajador", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador", "Rosa");
    const an = await userWithSession(api, "analista");
    const camp = await campaign(api);
    const c = await coupon(camp.id, { code: "00424242" });
    const red = await redeem(api, v, c.code);
    await api.call("POST", `/api/validador/redemptions/${red.body.redemption.id}/contact`, {
      cookie: v.cookie,
      body: { firstName: "Zoraida", lastName: "Chumpitaz", phone: "987001122", email: "zoraida.unica@ejemplo.com", consent: true, consentTextVersion: CONSENT_TEXT_VERSION },
    });

    const report = await api.call("GET", `/api/analytics/report?campaignId=${camp.id}`, { cookie: an.cookie });
    const camps = await api.call("GET", "/api/analytics/campaigns", { cookie: an.cookie });
    expect(report.status).toBe(200);
    const raw = JSON.stringify([report.body, camps.body]);
    for (const secret of ["Zoraida", "Chumpitaz", "987001122", "zoraida.unica", "00424242", red.body.redemption.id, v.id, v.email, "Rosa", "consent", "contact", "phone", "email"]) {
      expect(raw.toLowerCase(), `no debe aparecer "${secret}"`).not.toContain(secret.toLowerCase());
    }
    expect(Object.keys(report.body).sort()).toEqual(["byCampaign", "byDay", "byHour", "byMonth", "byWeek", "filters", "inventory", "redemptionsInRange"]);
    expect(Object.keys(camps.body.campaigns[0]).sort()).toEqual(["id", "name"]);
  });

  it("no puede llegar a ningún endpoint con datos individuales", async () => {
    const api = makeApi();
    const an = await userWithSession(api, "analista");
    for (const path of ["/api/admin/redemptions", "/api/admin/clients", "/api/admin/audit", "/api/admin/imports", "/api/admin/workers", "/api/admin/overview", "/api/admin/campaigns"]) {
      expect((await api.call("GET", path, { cookie: an.cookie })).status, path).toBe(403);
    }
    expect((await api.call("POST", "/api/admin/coupons/search", { cookie: an.cookie, body: {} })).status).toBe(403);
  });

  it("no hay endpoints de exportación con datos personales", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    for (const path of ["/api/admin/export", "/api/admin/clients/export", "/api/admin/clients.csv", "/api/analytics/export"]) {
      expect((await api.call("GET", path, { cookie: m.cookie })).status, path).toBe(404);
    }
  });
});

describe("indicadores", () => {
  it("categorías de estado mutuamente excluyentes: suman exactamente el total emitido (sin doble conteo)", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const an = await userWithSession(api, "analista");
    const live = await campaign(api);
    const expired = await campaign(api, { startsAt: "2026-01-01T05:00:00.000Z", endsAt: "2026-02-01T05:00:00.000Z" });
    const inactive = await campaign(api, { status: "inactive" });

    // en la campaña vigente: 3 disponibles, 2 canjeados, 1 anulado
    for (let i = 0; i < 3; i++) await coupon(live.id);
    for (let i = 0; i < 2; i++) await redeem(api, v, (await coupon(live.id)).code);
    await coupon(live.id, { status: "voided" });
    // en la vencida: 2 sin canjear (vencidos), 1 anulado (cuenta como anulado, NO como vencido), 1 canjeado antes de vencer
    await coupon(expired.id);
    await coupon(expired.id);
    await coupon(expired.id, { status: "voided" });
    await redemptionAt(expired.id, v.id, "2026-01-15T15:00:00.000Z");
    // en la inactiva: 2 → "campaña no disponible"
    await coupon(inactive.id);
    await coupon(inactive.id);

    const get = async (id: string) => (await api.call("GET", `/api/analytics/report?campaignId=${id}`, { cookie: an.cookie })).body.inventory;
    expect(await get(live.id)).toMatchObject({ issued: 6, available: 3, redeemed: 2, voided: 1, expired: 0, unavailable: 0, redemptionRate: 2 / 6 });
    expect(await get(expired.id)).toMatchObject({ issued: 4, available: 0, redeemed: 1, voided: 1, expired: 2, unavailable: 0, redemptionRate: 1 / 4 });
    expect(await get(inactive.id)).toMatchObject({ issued: 2, unavailable: 2, redeemed: 0, redemptionRate: 0 });
    for (const id of [live.id, expired.id, inactive.id]) {
      const inv = await get(id);
      expect(inv.available + inv.redeemed + inv.voided + inv.expired + inv.unavailable).toBe(inv.issued);
    }
  });

  it("estado vacío: sin cupones la tasa es null (no 0 ni NaN)", async () => {
    const api = makeApi();
    const an = await userWithSession(api, "analista");
    const camp = await campaign(api);
    const r = (await api.call("GET", `/api/analytics/report?campaignId=${camp.id}`, { cookie: an.cookie })).body;
    expect(r.inventory).toMatchObject({ issued: 0, redeemed: 0, redemptionRate: null });
    expect(r.byDay).toEqual([]);
    expect(r.byCampaign).toEqual([]);
    expect(r.byHour).toHaveLength(24);
    expect(r.byHour.every((h: { count: number }) => h.count === 0)).toBe(true);
  });

  it("agrupa por día, semana, mes y hora en horario de Lima (no UTC)", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const an = await userWithSession(api, "analista");
    const camp = await campaign(api);
    // En Lima: sáb 24-oct 22:00 | dom 25-oct 00:00 | sáb 31-oct 23:59:59.999 | dom 1-nov 00:00 (UTC-5)
    await redemptionAt(camp.id, v.id, "2026-10-25T03:00:00.000Z");
    await redemptionAt(camp.id, v.id, "2026-10-25T05:00:00.000Z");
    await redemptionAt(camp.id, v.id, "2026-11-01T04:59:59.999Z");
    await redemptionAt(camp.id, v.id, "2026-11-01T05:00:00.000Z");
    const r = (await api.call("GET", `/api/analytics/report?campaignId=${camp.id}`, { cookie: an.cookie })).body;
    expect(r.redemptionsInRange).toBe(4);
    expect(r.byDay).toEqual([
      { date: "2026-10-24", count: 1 },
      { date: "2026-10-25", count: 1 },
      { date: "2026-10-31", count: 1 },
      { date: "2026-11-01", count: 1 },
    ]);
    // semanas que empiezan lunes: 19-oct (24 y 25), 26-oct (31-oct y 1-nov)
    expect(r.byWeek).toEqual([
      { weekStart: "2026-10-19", count: 2 },
      { weekStart: "2026-10-26", count: 2 },
    ]);
    expect(r.byMonth).toEqual([
      { month: "2026-10", count: 3 },
      { month: "2026-11", count: 1 },
    ]);
    const hours = Object.fromEntries(r.byHour.map((h: { hour: number; count: number }) => [h.hour, h.count]));
    expect(hours[22]).toBe(1);
    expect(hours[0]).toBe(2);
    expect(hours[23]).toBe(1);
  });

  it("filtros de fecha (días de Lima, ambos extremos inclusivos) y de campaña", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const an = await userWithSession(api, "analista");
    const a = await campaign(api);
    const b = await campaign(api);
    await redemptionAt(a.id, v.id, "2026-10-25T03:00:00.000Z"); // 24-oct Lima
    await redemptionAt(a.id, v.id, "2026-10-25T05:00:00.000Z"); // 25-oct Lima
    await redemptionAt(a.id, v.id, "2026-10-26T04:59:59.999Z"); // 25-oct Lima (último ms)
    await redemptionAt(a.id, v.id, "2026-10-26T05:00:00.000Z"); // 26-oct Lima
    await redemptionAt(b.id, v.id, "2026-10-25T10:00:00.000Z");
    const n = async (q: string) => (await api.call("GET", `/api/analytics/report?${q}`, { cookie: an.cookie })).body.redemptionsInRange;
    expect(await n(`campaignId=${a.id}&from=2026-10-25&to=2026-10-25`)).toBe(2);
    expect(await n(`campaignId=${a.id}&from=2026-10-24&to=2026-10-26`)).toBe(4);
    expect(await n(`campaignId=${a.id}&from=2026-10-26`)).toBe(1);
    expect(await n(`campaignId=${a.id}&to=2026-10-24`)).toBe(1);
    expect(await n(`campaignId=${b.id}`)).toBe(1);
    expect((await api.call("GET", "/api/analytics/report?from=2026-13-40", { cookie: an.cookie })).status).toBe(422);
    expect((await api.call("GET", "/api/analytics/report?from=2026-10-26&to=2026-10-25", { cookie: an.cookie })).status).toBe(422);
  });

  it("comparación entre campañas usa el cohorte emitido; la tasa tiene denominador = cupones emitidos", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const an = await userWithSession(api, "analista");
    const camp = await campaign(api);
    for (let i = 0; i < 4; i++) await coupon(camp.id);
    await redeem(api, v, (await coupon(camp.id)).code);
    const r = (await api.call("GET", `/api/analytics/report?campaignId=${camp.id}`, { cookie: an.cookie })).body;
    expect(r.byCampaign).toEqual([{ campaignId: camp.id, name: camp.name, issued: 5, redeemed: 1, redemptionRate: 0.2 }]);
    expect(r.inventory.redemptionRate).toBe(0.2);
  });
});
