import { describe, expect, it } from "vitest";
import { Clock, campaign, count, coupon, key, lookup, makeApi, redeem, userWithSession } from "./helpers";

describe("consulta de cupones (no consume)", () => {
  it("cupón disponible: muestra solo campaña, beneficio, vigencia y estado", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const r = await lookup(api, v, c.code);
    expect(r.status).toBe(200);
    expect(r.body.state).toBe("available");
    expect(r.body.message).toBe("Cupón disponible");
    expect(Object.keys(r.body.coupon).sort()).toEqual(["benefit", "campaign", "validFrom", "validUntil"]);
    expect(r.body.coupon.campaign).toBe(camp.name);
  });

  it("consultar NO consume: se puede consultar varias veces y luego canjear", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    for (let i = 0; i < 3; i++) expect((await lookup(api, v, c.code)).body.state).toBe("available");
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(0);
    expect((await redeem(api, v, c.code)).status).toBe(201);
  });

  it("código inexistente", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const r = await lookup(api, v, "99999999");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ state: "not_found", message: "No encontramos ese código" });
    expect(r.body.coupon).toBeUndefined();
  });

  it("formato inválido (letras, muy corto) se rechaza en el servidor", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    for (const code of ["abc12345", "12", "1234567890123456789", "12 34 56", "", null, 12345678]) {
      const r = await lookup(api, v, code as string);
      expect(r.status).toBe(422);
    }
  });

  it("cupón vencido, anulado y campaña inactiva", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const past = await campaign(api, { startsAt: "2026-01-01T05:00:00.000Z", endsAt: "2026-02-01T05:00:00.000Z" });
    const expired = await coupon(past.id);
    expect((await lookup(api, v, expired.code)).body).toMatchObject({ state: "expired", message: "Este cupón está vencido" });

    const live = await campaign(api);
    const voided = await coupon(live.id, { status: "voided" });
    expect((await lookup(api, v, voided.code)).body).toMatchObject({ state: "voided", message: "Este cupón fue anulado" });

    const inactive = await campaign(api, { status: "inactive" });
    const inInactive = await coupon(inactive.id);
    expect((await lookup(api, v, inInactive.code)).body).toMatchObject({ state: "unavailable", message: "La campaña no está disponible" });
  });

  it("cupón usado: el validador NO recibe datos de quién ni cuándo lo canjeó, ni del cliente", async () => {
    const api = makeApi();
    const v1 = await userWithSession(api, "validador", "ana");
    const v2 = await userWithSession(api, "validador", "beto");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const red = await redeem(api, v1, c.code);
    await api.call("POST", `/api/validador/redemptions/${red.body.redemption.id}/contact`, {
      cookie: v1.cookie,
      body: { firstName: "Marisol", phone: "987654321", consent: true, consentTextVersion: "2026-10-v1" },
    });
    const r = await lookup(api, v2, c.code);
    expect(r.body.state).toBe("redeemed");
    const text = JSON.stringify(r.body);
    for (const leak of ["Marisol", "987654321", v1.id, v1.email, red.body.redemption.id, "redeemedAt", "worker"]) expect(text).not.toContain(leak);
  });

  it("conserva ceros iniciales y no confunde '00012345' con '12345'", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api, { codeLength: 8 });
    await coupon(camp.id, { code: "00012345" });
    expect((await lookup(api, v, "00012345")).body.state).toBe("available");
    expect((await lookup(api, v, "12345")).body.state).toBe("not_found");
    expect((await lookup(api, v, "000012345")).body.state).toBe("not_found");
    const red = await redeem(api, v, "00012345");
    expect(red.status).toBe(201);
    const row = await (await import("cloudflare:workers")).env.DB.prepare("SELECT code FROM coupons WHERE id IN (SELECT coupon_id FROM redemptions WHERE id = ?)")
      .bind(red.body.redemption.id)
      .first<{ code: string }>();
    expect(row?.code).toBe("00012345");
  });
});

describe("canje", () => {
  it("canje exitoso deja el cupón canjeado y registra el canje", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const r = await redeem(api, v, c.code);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ replayed: false, message: "Cupón canjeado correctamente" });
    expect((await lookup(api, v, c.code)).body.state).toBe("redeemed");
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ? AND redeemed_by = ?", c.id, v.id)).toBe(1);
  });

  it("segundo canje del mismo cupón (otra clave) es rechazado", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    expect((await redeem(api, v, c.code)).status).toBe(201);
    const second = await redeem(api, v, c.code, key());
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: "coupon_unavailable", state: "redeemed", message: "Este cupón ya fue canjeado" });
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(1);
  });

  it("canje de inexistente, vencido, anulado e inactivo es rechazado y no crea canjes", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    expect((await redeem(api, v, "88888888")).status).toBe(404);

    const past = await campaign(api, { startsAt: "2026-01-01T05:00:00.000Z", endsAt: "2026-02-01T05:00:00.000Z" });
    const live = await campaign(api);
    const inactive = await campaign(api, { status: "inactive" });
    const cases = [
      [await coupon(past.id), "expired"],
      [await coupon(live.id, { status: "voided" }), "voided"],
      [await coupon(inactive.id), "unavailable"],
    ] as const;
    for (const [c, state] of cases) {
      const r = await redeem(api, v, c.code);
      expect(r.status).toBe(409);
      expect(r.body.state).toBe(state);
      expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(0);
    }
  });

  it("exige clave de reintento válida", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const sin = await api.call("POST", "/api/validador/redemptions", { cookie: v.cookie, body: { code: c.code } });
    expect(sin.status).toBe(422);
    const corta = await redeem(api, v, c.code, "abc");
    expect(corta.status).toBe(422);
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(0);
  });

  it("reintento de una solicitud ya procesada devuelve el MISMO canje sin duplicar", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const k = key();
    const first = await redeem(api, v, c.code, k);
    const retry = await redeem(api, v, c.code, k);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.redemption.id).toBe(first.body.redemption.id);
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(1);
  });

  it("la misma clave no puede reutilizarse para canjear OTRO cupón", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const a = await coupon(camp.id);
    const b = await coupon(camp.id);
    const k = key();
    expect((await redeem(api, v, a.code, k)).status).toBe(201);
    const r = await redeem(api, v, b.code, k);
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("idempotency_key_reused");
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", b.id)).toBe(0);
  });

  it("doble clic: dos envíos simultáneos con la MISMA clave crean un solo canje", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    const k = key();
    const results = await Promise.all([redeem(api, v, c.code, k), redeem(api, v, c.code, k), redeem(api, v, c.code, k)]);
    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.redemption.id)).size).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(1);
  });

  it("dos trabajadores canjean el mismo cupón a la vez: solo uno lo consigue", async () => {
    const api = makeApi();
    const workers = await Promise.all(Array.from({ length: 6 }, (_, i) => userWithSession(api, "validador", `w${i}`)));
    const camp = await campaign(api);
    for (let round = 0; round < 5; round++) {
      const c = await coupon(camp.id);
      const results = await Promise.all(workers.map((w) => redeem(api, w, c.code)));
      const ok = results.filter((r) => r.status === 201);
      const lost = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(1);
      expect(lost).toHaveLength(workers.length - 1);
      expect(lost.every((r) => r.body.state === "redeemed")).toBe(true);
      expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'coupon_redeemed' AND entity_id = ?", ok[0]!.body.redemption.id)).toBe(1);
    }
  });

  it("el moderador y el analista NO pueden canjear", async () => {
    const api = makeApi();
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    for (const role of ["moderador", "analista"] as const) {
      const u = await userWithSession(api, role);
      expect((await redeem(api, u, c.code)).status).toBe(403);
      expect((await lookup(api, u, c.code)).status).toBe(403);
    }
    expect(await count("SELECT COUNT(*) AS n FROM redemptions WHERE coupon_id = ?", c.id)).toBe(0);
  });
});

describe("vigencia y zona horaria", () => {
  const start = "2026-12-01T05:00:00.000Z"; // 00:00 en Lima del 1 de diciembre
  const end = "2027-01-01T05:00:00.000Z"; // 00:00 en Lima del 1 de enero: EXCLUSIVO

  async function stateAt(iso: string) {
    const clock = new Clock(Date.parse(iso));
    const api = makeApi(clock);
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api, { startsAt: start, endsAt: end });
    const c = await coupon(camp.id);
    return (await lookup(api, v, c.code)).body.state as string;
  }

  it("inicio inclusivo: un milisegundo antes no vale, en el instante exacto sí", async () => {
    expect(await stateAt("2026-12-01T04:59:59.999Z")).toBe("unavailable");
    expect(await stateAt("2026-12-01T05:00:00.000Z")).toBe("available");
  });

  it("fin exclusivo: un milisegundo antes vale, en el instante exacto está vencido", async () => {
    expect(await stateAt("2027-01-01T04:59:59.999Z")).toBe("available");
    expect(await stateAt("2027-01-01T05:00:00.000Z")).toBe("expired");
  });

  it("el último día en hora de Lima (31 dic 23:59) todavía vale aunque en UTC ya sea 1 de enero", async () => {
    expect(await stateAt("2027-01-01T04:30:00.000Z")).toBe("available");
  });

  it("canjear en el límite del fin falla y un milisegundo antes funciona", async () => {
    const clock = new Clock(Date.parse("2027-01-01T04:59:59.999Z"));
    const api = makeApi(clock);
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api, { startsAt: start, endsAt: end });
    const a = await coupon(camp.id);
    const b = await coupon(camp.id);
    expect((await redeem(api, v, a.code)).status).toBe(201);
    clock.set("2027-01-01T05:00:00.000Z");
    expect((await redeem(api, v, b.code)).status).toBe(409);
  });
});
