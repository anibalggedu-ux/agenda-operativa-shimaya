import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { PASSWORD, campaign, coupon, key, makeApi, redeem, lookup, userWithSession, type Api, type User } from "./helpers";
import { SESSION_IDLE_MS, SESSION_LIFETIME_MS } from "../../src/worker/auth";

const UUID = "00000000-0000-4000-8000-000000000000";

type Role = "validador" | "moderador" | "analista";
interface Endpoint {
  name: string;
  method: string;
  path: string;
  body?: object;
  headers?: Record<string, string>;
  allowed: Role[];
}

// MATRIZ DE PERMISOS (debe coincidir con docs/ROLES_Y_PERMISOS.md).
const MATRIX: Endpoint[] = [
  { name: "consultar cupón", method: "POST", path: "/api/validador/coupons/lookup", body: { code: "00000000" }, allowed: ["validador"] },
  { name: "confirmar canje", method: "POST", path: "/api/validador/redemptions", body: { code: "00000000" }, headers: { "idempotency-key": "a".repeat(20) }, allowed: ["validador"] },
  { name: "registrar contacto", method: "POST", path: `/api/validador/redemptions/${UUID}/contact`, body: {}, allowed: ["validador"] },
  { name: "resumen del moderador", method: "GET", path: "/api/admin/overview", allowed: ["moderador"] },
  { name: "historial de canjes", method: "GET", path: "/api/admin/redemptions", allowed: ["moderador"] },
  { name: "clientes con consentimiento", method: "GET", path: "/api/admin/clients", allowed: ["moderador"] },
  { name: "listar campañas", method: "GET", path: "/api/admin/campaigns", allowed: ["moderador"] },
  { name: "crear campaña", method: "POST", path: "/api/admin/campaigns", body: {}, allowed: ["moderador"] },
  { name: "editar campaña", method: "PATCH", path: `/api/admin/campaigns/${UUID}`, body: {}, allowed: ["moderador"] },
  { name: "buscar cupones", method: "POST", path: "/api/admin/coupons/search", body: {}, allowed: ["moderador"] },
  { name: "crear cupón", method: "POST", path: "/api/admin/coupons", body: {}, allowed: ["moderador"] },
  { name: "anular cupón", method: "POST", path: `/api/admin/coupons/${UUID}/void`, body: {}, allowed: ["moderador"] },
  { name: "vista previa de importación", method: "POST", path: "/api/admin/imports/preview", body: {}, allowed: ["moderador"] },
  { name: "confirmar importación", method: "POST", path: "/api/admin/imports/confirm", body: {}, allowed: ["moderador"] },
  { name: "listar importaciones", method: "GET", path: "/api/admin/imports", allowed: ["moderador"] },
  { name: "errores de importación", method: "GET", path: `/api/admin/imports/${UUID}/errors`, allowed: ["moderador"] },
  { name: "auditoría", method: "GET", path: "/api/admin/audit", allowed: ["moderador"] },
  { name: "trabajadores", method: "GET", path: "/api/admin/workers", allowed: ["moderador"] },
  { name: "estadísticas agregadas", method: "GET", path: "/api/analytics/report", allowed: ["moderador", "analista"] },
  { name: "campañas (solo nombre)", method: "GET", path: "/api/analytics/campaigns", allowed: ["moderador", "analista"] },
];

describe("matriz de permisos: acceso cruzado entre roles, llamando directo a la API", () => {
  it("cada endpoint rechaza (403) a los roles no autorizados y a nadie sin sesión (401)", async () => {
    const api = makeApi();
    const users: Record<Role, User> = {
      validador: await userWithSession(api, "validador"),
      moderador: await userWithSession(api, "moderador"),
      analista: await userWithSession(api, "analista"),
    };
    for (const ep of MATRIX) {
      const anon = await api.call(ep.method, ep.path, { body: ep.body, headers: ep.headers });
      expect(anon.status, `${ep.name} sin sesión`).toBe(401);
      for (const role of Object.keys(users) as Role[]) {
        const res = await api.call(ep.method, ep.path, { body: ep.body, headers: ep.headers, cookie: users[role].cookie });
        if (ep.allowed.includes(role)) {
          expect([401, 403], `${ep.name} permitido a ${role}`).not.toContain(res.status);
          expect(res.status, `${ep.name} no debe fallar con 5xx`).toBeLessThan(500);
        }
        else expect(res.status, `${ep.name} debe negarse a ${role}`).toBe(403);
      }
    }
  });

  it("los intentos denegados quedan en la auditoría", async () => {
    const api = makeApi();
    const a = await userWithSession(api, "analista");
    await api.call("GET", "/api/admin/clients", { cookie: a.cookie });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'access_denied' AND actor_user_id = ?").bind(a.id).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("el rol sale del servidor: una cookie falsa o adulterada no sirve", async () => {
    const api = makeApi();
    const r = await api.call("GET", "/api/admin/overview", { cookie: "__Host-sid=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(r.status).toBe(401);
    const noRolFromClient = await api.call("GET", "/api/admin/overview", { headers: { "x-role": "moderador" } });
    expect(noRolFromClient.status).toBe(401);
  });
});

describe("sesiones", () => {
  it("la cookie es HttpOnly, Secure, SameSite=Strict y con prefijo __Host-", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    const login = await api.call("POST", "/api/auth/login", { body: { email: u.email, password: PASSWORD } });
    const setCookie = login.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^__Host-sid=/);
    for (const attr of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) expect(setCookie).toContain(attr);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(JSON.stringify(login.body)).not.toContain(setCookie.split(";")[0]!.split("=")[1]!);
  });

  it("cerrar sesión la invalida de verdad en el servidor", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(200);
    const out = await api.call("POST", "/api/auth/logout", { cookie: u.cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(401);
  });

  it("expira por tiempo absoluto", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    // La actividad frecuente mantiene viva la sesión por inactividad, pero no más allá del máximo absoluto.
    for (let elapsed = 0; elapsed < SESSION_LIFETIME_MS - 2 * 3600_000; elapsed += 2 * 3600_000) {
      api.clock.advance(2 * 3600_000);
      expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(200);
    }
    api.clock.set(new Date(Date.parse("2026-10-24T17:00:00.000Z") + SESSION_LIFETIME_MS - 1).toISOString());
    expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(200);
    api.clock.advance(1);
    expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(401);
  });

  it("expira por inactividad", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    api.clock.advance(SESSION_IDLE_MS);
    expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(401);
  });

  it("una cuenta desactivada pierde el acceso de inmediato", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(u.id).run();
    expect((await api.call("GET", "/api/auth/me", { cookie: u.cookie })).status).toBe(401);
    const login = await api.call("POST", "/api/auth/login", { body: { email: u.email, password: PASSWORD } });
    expect(login.status).toBe(401);
  });

  it("no existe registro público ni endpoint para cambiar roles", async () => {
    const api = makeApi();
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
    for (const path of ["/api/auth/register", "/api/users", "/api/admin/users", "/api/auth/signup"]) {
      const r = await api.call("POST", path, { body: { email: "x@y.co", password: "x", role: "moderador" } });
      expect([401, 404]).toContain(r.status);
    }
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });
});

describe("login", () => {
  it("credenciales incorrectas: mensaje genérico, igual para correo inexistente y clave errónea", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    const wrongPass = await api.call("POST", "/api/auth/login", { body: { email: u.email, password: "incorrecta" }, ip: "192.0.2.10" });
    const wrongUser = await api.call("POST", "/api/auth/login", { body: { email: "no-existe@prueba.test", password: "incorrecta" }, ip: "192.0.2.11" });
    expect(wrongPass.status).toBe(401);
    expect(wrongUser.status).toBe(401);
    expect(wrongPass.body).toEqual(wrongUser.body);
  });

  it("límite de intentos por cuenta: el 6.º intento se bloquea aunque la clave sea correcta", async () => {
    const api = makeApi();
    const u = await userWithSession(api, "validador");
    for (let i = 0; i < 5; i++) {
      const r = await api.call("POST", "/api/auth/login", { body: { email: u.email, password: "mala" }, ip: `192.0.2.${20 + i}` });
      expect(r.status).toBe(401);
    }
    const blocked = await api.call("POST", "/api/auth/login", { body: { email: u.email, password: PASSWORD }, ip: "192.0.2.99" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    api.clock.advance(15 * 60_000 + 1);
    expect((await api.call("POST", "/api/auth/login", { body: { email: u.email, password: PASSWORD }, ip: "192.0.2.99" })).status).toBe(200);
  });

  it("límite por IP", async () => {
    const api = makeApi();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await api.call("POST", "/api/auth/login", { body: { email: `persona${i}@prueba.test`, password: "x" }, ip: "192.0.2.200" })).status;
    }
    expect(last).toBe(429);
  });

  it("la tabla de límites no guarda correos en claro", async () => {
    const api = makeApi();
    await api.call("POST", "/api/auth/login", { body: { email: "secreto.visible@prueba.test", password: "x" }, ip: "192.0.2.50" });
    const keys = await env.DB.prepare("SELECT key FROM rate_limits").all<{ key: string }>();
    expect(keys.results.some((k) => k.key.includes("secreto.visible"))).toBe(false);
  });
});

describe("protección contra adivinar códigos y abuso", () => {
  it("tras 15 códigos inexistentes el validador queda bloqueado (429), incluso para códigos válidos", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const good = await coupon(camp.id);
    for (let i = 0; i < 15; i++) {
      const r = await lookup(api, v, String(70000000 + i));
      expect(r.status).toBe(200);
      expect(r.body.state).toBe("not_found");
    }
    expect((await lookup(api, v, String(70000099))).status).toBe(429);
    expect((await lookup(api, v, good.code)).status).toBe(429);
    expect((await redeem(api, v, good.code)).status).toBe(429);
    api.clock.advance(10 * 60_000 + 1);
    expect((await lookup(api, v, good.code)).status).toBe(200);
  });

  it("adivinar por canje también cuenta", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    for (let i = 0; i < 15; i++) expect((await redeem(api, v, String(60000000 + i))).status).toBe(404);
    expect((await redeem(api, v, String(60000100))).status).toBe(429);
  });

  it("límite general de consultas por minuto", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const camp = await campaign(api);
    const c = await coupon(camp.id);
    let status = 200;
    for (let i = 0; i < 91; i++) status = (await lookup(api, v, c.code)).status;
    expect(status).toBe(429);
  });
});

describe("CSRF y cabeceras", () => {
  it("una petición que modifica datos sin el encabezado propio se rechaza", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const r = await api.call("POST", "/api/validador/coupons/lookup", { cookie: v.cookie, body: { code: "12345678" }, csrf: false });
    expect(r.status).toBe(403);
  });

  it("un Origin ajeno se rechaza aunque traiga el encabezado", async () => {
    const api = makeApi();
    const v = await userWithSession(api, "validador");
    const r = await api.call("POST", "/api/validador/coupons/lookup", { cookie: v.cookie, body: { code: "12345678" }, headers: { origin: "https://sitio-malicioso.example" } });
    expect(r.status).toBe(403);
    const same = await api.call("POST", "/api/validador/coupons/lookup", { cookie: v.cookie, body: { code: "12345678" }, headers: { origin: "https://cupones.test" } });
    expect(same.status).toBe(200);
  });

  it("respuestas de la API: Cache-Control no-store y sin sniffing", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    for (const [path, cookie] of [["/api/admin/clients", m.cookie], ["/api/auth/me", null], ["/api/admin/overview", m.cookie]] as const) {
      const r = await api.call("GET", path, { cookie });
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("los códigos no viajan en URLs: la búsqueda de cupones del moderador es POST", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    expect((await api.call("GET", "/api/admin/coupons/search?code=12345678", { cookie: m.cookie })).status).toBe(404);
  });

  it("errores internos no filtran detalles", async () => {
    const api = makeApi();
    const m = await userWithSession(api, "moderador");
    const r = await api.call("GET", "/api/admin/redemptions?page=abc", { cookie: m.cookie });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).not.toMatch(/stack|SELECT|sqlite/i);
  });
});
