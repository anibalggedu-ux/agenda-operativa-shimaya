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
