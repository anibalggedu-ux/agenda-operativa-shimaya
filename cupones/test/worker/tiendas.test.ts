import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { campaign, coupon, lookup, makeApi, redeem, userWithSession, type Api, type User } from "./helpers";

let ipSeq = 0;
const ip = () => `192.0.2.${(ipSeq++ % 250) + 1}`;

async function crearTienda(api: Api, m: User, name = `Tienda ${crypto.randomUUID().slice(0, 6)}`) {
  const r = await api.call("POST", "/api/admin/stores", { cookie: m.cookie, body: { names: [name] } });
  expect(r.status).toBe(201);
  return r.body.created[0] as { id: string; name: string; pin: string };
}

const entrar = (api: Api, storeId: string, pin: string, address = ip()) => api.call("POST", "/api/auth/pin-login", { body: { storeId, pin }, ip: address });

describe("PIN de tienda", () => {
  it("el moderador crea tiendas en lote y cada una recibe un PIN de 6 dígitos distinto de su nombre", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const base = crypto.randomUUID().slice(0, 6);
    const r = await api.call("POST", "/api/admin/stores", { cookie: m.cookie, body: { names: [`A ${base}`, `  B ${base}  `, `a ${base}`, ""] } });
    expect(r.status).toBe(201);
    expect(r.body.created).toHaveLength(2);
    for (const s of r.body.created) expect(s.pin).toMatch(/^\d{6}$/);
    expect(r.body.skipped).toEqual([`a ${base}`]);
    const again = await api.call("POST", "/api/admin/stores", { cookie: m.cookie, body: { names: [`A ${base}`] } });
    expect(again.body.created).toHaveLength(0);
    expect(again.body.skipped).toEqual([`A ${base}`]);
  });

  it("el PIN no se guarda en claro ni aparece en la auditoría ni en el listado", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m);
    const row = await env.DB.prepare("SELECT pin_hash FROM stores WHERE id = ?").bind(s.id).first<{ pin_hash: string }>();
    expect(row?.pin_hash).toMatch(/^pbkdf2\$/);
    expect(row?.pin_hash).not.toContain(s.pin);
    const audit = await env.DB.prepare("SELECT group_concat(coalesce(details, ''), ' ') AS d FROM audit_logs WHERE entity_id = ?").bind(s.id).first<{ d: string }>();
    expect(audit?.d ?? "").not.toContain(s.pin);
    const list = await api.call("GET", "/api/admin/stores", { cookie: m.cookie });
    expect(JSON.stringify(list.body)).not.toContain(s.pin);
    expect(JSON.stringify(list.body)).not.toContain("pbkdf2");
  });

  it("el líder entra con el PIN, valida y canjea; el canje queda a nombre de la tienda", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m, `Tienda Miraflores ${crypto.randomUUID().slice(0, 4)}`);
    const login = await entrar(api, s.id, s.pin);
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ name: s.name, role: "validador" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const v = { id: login.body.user.id, email: "", cookie } as User;
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    expect((await lookup(api, v, c.code)).body.state).toBe("available");
    expect((await redeem(api, v, c.code)).status).toBe(201);
    const canjes = await api.call("GET", "/api/admin/redemptions", { cookie: m.cookie });
    expect(canjes.body.items.some((i: { worker: string }) => i.worker === s.name)).toBe(true);
  });

  it("PIN incorrecto: 401 genérico, igual para tienda inexistente", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m);
    const bad = await entrar(api, s.id, s.pin === "000000" ? "111111" : "000000");
    const ghost = await entrar(api, crypto.randomUUID(), "123456");
    expect(bad.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(bad.body).toEqual(ghost.body);
    expect((await entrar(api, s.id, "12345")).status).toBe(422);
  });

  it("límite por tienda: tras 10 errores se bloquea aunque el PIN sea correcto, y se libera con el tiempo", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m);
    const wrong = s.pin === "000000" ? "111111" : "000000";
    for (let i = 0; i < 10; i++) expect((await entrar(api, s.id, wrong)).status).toBe(401);
    const blocked = await entrar(api, s.id, s.pin);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    api.clock.advance(15 * 60_000 + 1);
    expect((await entrar(api, s.id, s.pin)).status).toBe(200);
  });

  it("límite por IP: no se pueden probar PIN de muchas tiendas desde un mismo lugar", async () => {
    const api = makeApi();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await entrar(api, crypto.randomUUID(), "123456", "198.51.100.250")).status;
    expect(last).toBe(429);
  });

  it("nuevo PIN: el anterior deja de servir y se cierran las sesiones abiertas", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m);
    const first = await entrar(api, s.id, s.pin);
    const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
    expect((await api.call("GET", "/api/auth/me", { cookie })).status).toBe(200);
    const reset = await api.call("POST", `/api/admin/stores/${s.id}/reset-pin`, { cookie: m.cookie, body: {} });
    expect(reset.status).toBe(200);
    expect(reset.body.pin).toMatch(/^\d{6}$/);
    expect((await api.call("GET", "/api/auth/me", { cookie })).status).toBe(401);
    if (reset.body.pin !== s.pin) expect((await entrar(api, s.id, s.pin)).status).toBe(401);
    expect((await entrar(api, s.id, reset.body.pin)).status).toBe(200);
    expect((await api.call("POST", `/api/admin/stores/${crypto.randomUUID()}/reset-pin`, { cookie: m.cookie, body: {} })).status).toBe(404);
  });

  it("desactivar una tienda corta el acceso de inmediato y la oculta de la lista pública", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m);
    const cookie = (await entrar(api, s.id, s.pin)).headers.get("set-cookie")!.split(";")[0]!;
    expect((await api.call("POST", `/api/admin/stores/${s.id}/active`, { cookie: m.cookie, body: { active: false } })).status).toBe(200);
    expect((await api.call("GET", "/api/auth/me", { cookie })).status).toBe(401);
    expect((await entrar(api, s.id, s.pin)).status).toBe(401);
    const pub = await api.call("GET", "/api/auth/tiendas");
    expect(pub.body.stores.some((x: { id: string }) => x.id === s.id)).toBe(false);
    await api.call("POST", `/api/admin/stores/${s.id}/active`, { cookie: m.cookie, body: { active: true } });
    expect((await entrar(api, s.id, s.pin)).status).toBe(200);
    expect((await api.call("GET", "/api/auth/tiendas")).body.stores.some((x: { id: string }) => x.id === s.id)).toBe(true);
  });

  it("la lista pública solo trae id y nombre, y la cuenta de la tienda no entra con correo", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const s = await crearTienda(api, m);
    const pub = await api.call("GET", "/api/auth/tiendas");
    expect(pub.status).toBe(200);
    const mine = pub.body.stores.find((x: { id: string }) => x.id === s.id);
    expect(Object.keys(mine).sort()).toEqual(["id", "name"]);
    const u = await env.DB.prepare("SELECT u.email FROM users u JOIN stores s ON s.user_id = u.id WHERE s.id = ?").bind(s.id).first<{ email: string }>();
    for (const password of [s.pin, "sin-clave", ""]) {
      const r = await api.call("POST", "/api/auth/login", { body: { email: u!.email, password: password || "x" }, ip: ip() });
      expect(r.status).toBe(401);
    }
  });
});
