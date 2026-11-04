import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { campaign, count, coupon, key, lookup, makeApi, redeem, storeWithSession, userWithSession } from "./helpers";

async function escenario() {
  const api = makeApi();
  const m = await userWithSession(api, "moderador");
  const camp = await campaign(api, { codeLength: 4 });
  const minka = await storeWithSession(api, m);
  const polo = await storeWithSession(api, m);
  return { api, m, camp, minka, polo };
}

describe("cupones por tienda", () => {
  it("el mismo código existe en cada tienda y se canjea una vez en cada una", async () => {
    const { api, camp, minka, polo } = await escenario();
    const code = "0001";
    await coupon(camp.id, { code, storeId: minka.id });
    await coupon(camp.id, { code, storeId: polo.id });

    expect((await redeem(api, minka.user, code)).status).toBe(201);
    // El canje en Minka no toca el cupón de El Polo.
    expect((await lookup(api, polo.user, code)).body.state).toBe("available");
    expect((await redeem(api, polo.user, code)).status).toBe(201);
    // Cada uno ya está canjeado en su propia tienda.
    expect((await redeem(api, minka.user, code, key())).status).toBe(409);
    expect((await redeem(api, polo.user, code, key())).status).toBe(409);
  });

  it("una tienda no alcanza los cupones de otra", async () => {
    const { api, camp, minka, polo } = await escenario();
    const soloMinka = await coupon(camp.id, { code: "0777", storeId: minka.id });
    expect((await lookup(api, polo.user, soloMinka.code)).body.state).toBe("not_found");
    const r = await redeem(api, polo.user, soloMinka.code);
    expect(r.status).toBe(404);
    expect((await lookup(api, minka.user, soloMinka.code)).body.state).toBe("available");
  });

  it("los cupones anteriores sin tienda siguen valiendo en cualquier tienda, y el de la tienda tiene prioridad", async () => {
    const { api, camp, minka, polo } = await escenario();
    await coupon(camp.id, { code: "0500" });
    expect((await lookup(api, polo.user, "0500")).body.state).toBe("available");

    await coupon(camp.id, { code: "0600" });
    const propio = await coupon(camp.id, { code: "0600", storeId: minka.id });
    expect((await redeem(api, minka.user, "0600")).status).toBe(201);
    const row = await env.DB.prepare("SELECT status FROM coupons WHERE id = ?").bind(propio.id).first<{ status: string }>();
    expect(row?.status).toBe("redeemed");
    // Para El Polo sigue disponible el cupón sin tienda.
    expect((await lookup(api, polo.user, "0600")).body.state).toBe("available");
  });

  it("el moderador importa un CSV para una tienda y el mismo CSV para otra", async () => {
    const { api, m, camp, minka, polo } = await escenario();
    const csv = "0001\n0002\n0003\n";
    const imp = (storeId: string) => api.call("POST", "/api/admin/imports/confirm", { cookie: m.cookie, body: { campaignId: camp.id, storeId, csv } });
    expect((await imp(minka.id)).body.imported).toBe(3);
    expect((await imp(polo.id)).body.imported).toBe(3);
    // Repetirlo para la misma tienda se rechaza.
    expect((await imp(minka.id)).status).toBe(422);
  });

  it("el listado del moderador filtra por tienda y muestra su nombre", async () => {
    const { api, m, camp, minka, polo } = await escenario();
    await coupon(camp.id, { code: "0010", storeId: minka.id });
    await coupon(camp.id, { code: "0010", storeId: polo.id });
    const r = await api.call("POST", "/api/admin/coupons/search", { cookie: m.cookie, body: { storeId: minka.id, campaignId: camp.id } });
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].store).toBe(minka.name);
  });

  it("no se puede mover un cupón a otra tienda", async () => {
    const { camp, minka, polo } = await escenario();
    const c = await coupon(camp.id, { code: "0020", storeId: minka.id });
    await expect(env.DB.prepare("UPDATE coupons SET store_id = ? WHERE id = ?").bind(polo.id, c.id).run()).rejects.toThrow();
  });
});

describe("campañas que reinician el 1 al 1000", () => {
  it("una campaña nueva vuelve a usar los mismos números en la misma tienda; se canjea el de la campaña vigente", async () => {
    const { api, m, minka } = await escenario();
    const vieja = await campaign(api, { codeLength: 4, startsAt: "2026-01-01T05:00:00.000Z", endsAt: "2026-09-01T05:00:00.000Z" });
    const nueva = await campaign(api, { codeLength: 4 });
    const csv = "0001\n0002\n";
    const imp = (campaignId: string) => api.call("POST", "/api/admin/imports/confirm", { cookie: m.cookie, body: { campaignId, storeId: minka.id, csv } });
    expect((await imp(vieja.id)).body.imported).toBe(2);
    expect((await imp(nueva.id)).body.imported).toBe(2);
    // El cupón de la campaña vencida no estorba: se canjea el de la vigente.
    const r = await redeem(api, minka.user, "0001");
    expect(r.status).toBe(201);
    expect(r.body.redemption.campaign).toBe(nueva.name);
    // Segunda vez: el vigente ya está canjeado y el viejo está vencido: no se puede.
    expect((await redeem(api, minka.user, "0001", key())).status).toBe(409);
  });
});

describe("zonas por rango de número", () => {
  const guardar = (api: ReturnType<typeof makeApi>, m: { cookie: string }, campaignId: string, zones: object[]) =>
    api.call("PUT", `/api/admin/campaigns/${campaignId}/zones`, { cookie: m.cookie, body: { zones } });

  it("el validador ve la zona del cupón según su número, al consultar y al canjear", async () => {
    const { api, m, camp, minka } = await escenario();
    expect((await guardar(api, m, camp.id, [{ name: "Comercios menores", from: 1, to: 200 }, { name: "Oficinas", from: 201, to: 400 }])).status).toBe(200);
    for (const code of ["0001", "0200", "0201", "0999"]) await coupon(camp.id, { code, storeId: minka.id });

    expect((await lookup(api, minka.user, "0001")).body.coupon.zone).toBe("Comercios menores");
    expect((await lookup(api, minka.user, "0200")).body.coupon.zone).toBe("Comercios menores");
    expect((await lookup(api, minka.user, "0201")).body.coupon.zone).toBe("Oficinas");
    expect((await lookup(api, minka.user, "0999")).body.coupon.zone).toBeNull();
    const r = await redeem(api, minka.user, "0201");
    expect(r.body.redemption.zone).toBe("Oficinas");
  });

  it("rechaza rangos cruzados, invertidos o con nombre repetido, y no deja la campaña a medias", async () => {
    const { api, m, camp } = await escenario();
    await guardar(api, m, camp.id, [{ name: "A", from: 1, to: 10 }]);
    expect((await guardar(api, m, camp.id, [{ name: "A", from: 1, to: 200 }, { name: "B", from: 150, to: 300 }])).status).toBe(422);
    expect((await guardar(api, m, camp.id, [{ name: "A", from: 20, to: 10 }])).status).toBe(422);
    expect((await guardar(api, m, camp.id, [{ name: "A", from: 1, to: 5 }, { name: "a", from: 6, to: 9 }])).status).toBe(422);
    expect((await guardar(api, m, camp.id, [{ name: "", from: 1, to: 5 }])).status).toBe(422);
    const list = await api.call("GET", `/api/admin/campaigns/${camp.id}/zones`, { cookie: m.cookie });
    expect(list.body.zones).toMatchObject([{ name: "A", from: 1, to: 10 }]);
    expect((await guardar(api, m, crypto.randomUUID(), [])).status).toBe(404);
  });

  it("cambiar un rango se aplica de inmediato a los cupones ya cargados; cada campaña tiene sus rangos", async () => {
    const { api, m, camp, minka } = await escenario();
    const otra = await campaign(api, { codeLength: 4 });
    await coupon(camp.id, { code: "0150", storeId: minka.id });
    await coupon(otra.id, { code: "0150", storeId: minka.id });
    await guardar(api, m, camp.id, [{ name: "Norte", from: 1, to: 100 }]);
    await guardar(api, m, otra.id, [{ name: "Sur", from: 100, to: 200 }]);
    const zona = async () => (await api.call("POST", "/api/admin/coupons/search", { cookie: m.cookie, body: { campaignId: camp.id } })).body.items[0].zone;
    expect(await zona()).toBeNull();
    await guardar(api, m, camp.id, [{ name: "Norte", from: 1, to: 200 }]);
    expect(await zona()).toBe("Norte");
  });

  it("las estadísticas agrupan emitidos y canjeados por zona (el analista las ve)", async () => {
    const { api, m, camp, minka, polo } = await escenario();
    await guardar(api, m, camp.id, [{ name: "Oficinas", from: 201, to: 400 }, { name: "Comercios menores", from: 1, to: 200 }]);
    for (const s of [minka, polo]) {
      await coupon(camp.id, { code: "0001", storeId: s.id });
      await coupon(camp.id, { code: "0002", storeId: s.id });
      await coupon(camp.id, { code: "0250", storeId: s.id });
    }
    await coupon(camp.id, { code: "0900", storeId: minka.id });
    await redeem(api, minka.user, "0001");
    await redeem(api, polo.user, "0250");

    const analista = await userWithSession(api, "analista");
    const rep = await api.call("GET", `/api/analytics/report?campaignId=${camp.id}`, { cookie: analista.cookie });
    expect(rep.body.byZone).toEqual([
      { zone: "Comercios menores", stores: 2, issued: 4, redeemed: 1, redemptionRate: 0.25 },
      { zone: "Oficinas", stores: 2, issued: 2, redeemed: 1, redemptionRate: 0.5 },
      { zone: null, stores: 1, issued: 1, redeemed: 0, redemptionRate: 0 },
    ]);
  });

  it("al eliminar la campaña se eliminan sus zonas", async () => {
    const { api, m, camp } = await escenario();
    await guardar(api, m, camp.id, [{ name: "Norte", from: 1, to: 100 }]);
    expect((await api.call("DELETE", `/api/admin/campaigns/${camp.id}`, { cookie: m.cookie })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM campaign_zones WHERE campaign_id = ?", camp.id)).toBe(0);
  });
});

describe("eliminar campañas", () => {
  const del = (api: ReturnType<typeof makeApi>, m: { cookie: string }, id: string) => api.call("DELETE", `/api/admin/campaigns/${id}`, { cookie: m.cookie });

  it("elimina una campaña sin canjes con sus cupones y su historial de importación", async () => {
    const { api, m, camp, minka } = await escenario();
    const imp = await api.call("POST", "/api/admin/imports/confirm", { cookie: m.cookie, body: { campaignId: camp.id, storeId: minka.id, csv: "0001\n0002\nmalo\n", mode: "parcial" } });
    expect(imp.status).toBe(201);
    const r = await del(api, m, camp.id);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ deleted: true, coupons: 2 });
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM campaigns WHERE id = ?", camp.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM import_batches WHERE campaign_id = ?", camp.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'campaign_deleted' AND entity_id = ?", camp.id)).toBe(1);
  });

  it("no elimina una campaña con cupones canjeados: deben conservarse", async () => {
    const { api, m, camp, minka } = await escenario();
    await coupon(camp.id, { code: "0001", storeId: minka.id });
    await coupon(camp.id, { code: "0002", storeId: minka.id });
    expect((await redeem(api, minka.user, "0001")).status).toBe(201);
    const r = await del(api, m, camp.id);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("campaign_has_redemptions");
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(2);
  });

  it("no elimina una campaña con cupones anulados", async () => {
    const { api, m, camp, minka } = await escenario();
    await coupon(camp.id, { code: "0001", storeId: minka.id });
    await coupon(camp.id, { code: "0002", storeId: minka.id, status: "voided" });
    const r = await del(api, m, camp.id);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("campaign_has_voided");
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(2);
  });

  it("una campaña inexistente da 404 y los demás roles no pueden eliminar", async () => {
    const { api, m, camp, minka } = await escenario();
    expect((await del(api, m, crypto.randomUUID())).status).toBe(404);
    const analista = await userWithSession(api, "analista");
    expect((await del(api, analista, camp.id)).status).toBe(403);
    expect((await del(api, minka.user, camp.id)).status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM campaigns WHERE id = ?", camp.id)).toBe(1);
  });
});
