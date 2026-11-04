import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { campaign, coupon, key, lookup, makeApi, redeem, storeWithSession, userWithSession } from "./helpers";

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

describe("zonas", () => {
  it("el moderador asigna zonas y las estadísticas agrupan emitidos y canjeados por zona (el analista las ve)", async () => {
    const { api, m, camp, minka, polo } = await escenario();
    const otra = await storeWithSession(api, m);
    expect((await api.call("POST", `/api/admin/stores/${minka.id}/zone`, { cookie: m.cookie, body: { zone: "  Lima   Norte " } })).body.zone).toBe("Lima Norte");
    await api.call("POST", `/api/admin/stores/${polo.id}/zone`, { cookie: m.cookie, body: { zone: "Lima Norte" } });
    for (const s of [minka, polo]) {
      await coupon(camp.id, { code: "0001", storeId: s.id });
      await coupon(camp.id, { code: "0002", storeId: s.id });
    }
    await coupon(camp.id, { code: "0001", storeId: otra.id });
    await redeem(api, minka.user, "0001");

    const analista = await userWithSession(api, "analista");
    const rep = await api.call("GET", `/api/analytics/report?campaignId=${camp.id}`, { cookie: analista.cookie });
    expect(rep.body.byZone).toEqual([
      { zone: "Lima Norte", stores: 2, issued: 4, redeemed: 1, redemptionRate: 0.25 },
      { zone: null, stores: 1, issued: 1, redeemed: 0, redemptionRate: 0 },
    ]);
    // Quitar la zona la deja "sin zona".
    await api.call("POST", `/api/admin/stores/${polo.id}/zone`, { cookie: m.cookie, body: { zone: "" } });
    const list = await api.call("GET", "/api/admin/stores", { cookie: m.cookie });
    expect(list.body.stores.find((s: { id: string }) => s.id === polo.id).zone).toBeNull();
  });

  it("al crear tiendas en lote se puede indicar la zona", async () => {
    const { api, m } = await escenario();
    const nombre = `Z ${crypto.randomUUID().slice(0, 6)}`;
    const r = await api.call("POST", "/api/admin/stores", { cookie: m.cookie, body: { names: [nombre], zone: "Sur" } });
    expect(r.status).toBe(201);
    const list = await api.call("GET", "/api/admin/stores", { cookie: m.cookie });
    expect(list.body.stores.find((s: { name: string }) => s.name === nombre).zone).toBe("Sur");
  });
});
