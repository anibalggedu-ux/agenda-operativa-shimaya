import { describe, expect, it } from "vitest";
import { campaign, coupon, makeApi, redeem, userWithSession } from "./helpers";

describe("resumen del moderador", () => {
  it("responde 200 con indicadores", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    await redeem(api, v, (await coupon(camp.id)).code);
    const r = await api.call("GET", "/api/admin/overview", { cookie: m.cookie });
    expect(r.status).toBe(200);
    expect(r.body.redemptionsToday).toBeGreaterThanOrEqual(1);
    expect(r.body.inventory.issued).toBeGreaterThanOrEqual(1);
  });
});
