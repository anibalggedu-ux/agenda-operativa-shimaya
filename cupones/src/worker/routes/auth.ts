import { Hono } from "hono";
import { z } from "zod";
import { audit } from "../audit";
import { authenticate, clearSessionCookie, startSession } from "../auth";
import { ApiError, type AppEnv, clientIp, parse, readJson, tooManyRequests } from "../http";
import { dummyHash, verifyPassword } from "../password";
import { isPinFormat } from "../pin";
import { LIMITS, accountKey, hit, reset } from "../ratelimit";

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

const pinLoginSchema = z.object({
  storeId: z.string().uuid("Elige tu tienda."),
  pin: z.string().trim().refine(isPinFormat, "El PIN tiene 6 números."),
});

export const authRoutes = new Hono<AppEnv>();

/** Lista pública de tiendas activas (solo nombre) para que el líder elija la suya en la pantalla del PIN. */
authRoutes.get("/tiendas", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name FROM stores WHERE active = 1 ORDER BY name COLLATE NOCASE").all<{ id: string; name: string }>();
  return c.json({ stores: r.results });
});

/** Ingreso del líder de tienda con el PIN de su tienda. Misma sesión y cookie que el ingreso con correo. */
authRoutes.post("/pin-login", async (c) => {
  const { storeId, pin } = parse(pinLoginSchema, await readJson(c));
  const db = c.env.DB;
  const now = c.get("now");

  const storeKey = `pin:store:${storeId}`;
  const [byIp, byStore] = [await hit(db, `pin:ip:${clientIp(c)}`, LIMITS.pinPerIp, now), await hit(db, storeKey, LIMITS.pinPerStore, now)];
  if (!byIp.allowed || !byStore.allowed) {
    if (byIp.firstBlock || byStore.firstBlock) {
      await audit(db, now.toISOString(), { actorUserId: null, action: "pin_rate_limited", entityType: "store", entityId: storeId });
    }
    throw tooManyRequests(Math.max(byIp.retryAfterSeconds, byStore.retryAfterSeconds));
  }

  const store = await db
    .prepare(
      `SELECT s.id, s.pin_hash, s.active, u.id AS user_id, u.display_name, u.role, u.active AS user_active
         FROM stores s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .bind(storeId)
    .first<{ id: string; pin_hash: string; active: number; user_id: string; display_name: string; role: string; user_active: number }>();

  // Siempre se calcula un hash (aunque la tienda no exista) para no filtrar datos por tiempo de respuesta.
  const pinOk = await verifyPassword(pin, store?.pin_hash ?? (await dummyHash()));
  if (!store || !store.active || !store.user_active || !pinOk) {
    await audit(db, now.toISOString(), { actorUserId: store?.user_id ?? null, action: "pin_login_failed", entityType: "store", entityId: storeId });
    throw new ApiError(401, "bad_pin", "PIN incorrecto.");
  }

  await startSession(c, store.user_id, now);
  await db.batch([
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now.toISOString(), store.user_id),
    db
      .prepare("INSERT INTO audit_logs (at, actor_user_id, action, entity_type, entity_id) VALUES (?, ?, 'login_success', 'store', ?)")
      .bind(now.toISOString(), store.user_id, store.id),
  ]);
  await reset(db, storeKey);
  return c.json({ user: { id: store.user_id, name: store.display_name, role: store.role } });
});

authRoutes.post("/login", async (c) => {
  const { email, password } = parse(loginSchema, await readJson(c));
  const db = c.env.DB;
  const now = c.get("now");

  const acctKey = await accountKey(email);
  const [byIp, byAccount] = [
    await hit(db, `login:ip:${clientIp(c)}`, LIMITS.loginPerIp, now),
    await hit(db, acctKey, LIMITS.loginPerAccount, now),
  ];
  if (!byIp.allowed || !byAccount.allowed) {
    if (byIp.firstBlock || byAccount.firstBlock) {
      await audit(db, now.toISOString(), { actorUserId: null, action: "login_rate_limited" });
    }
    throw tooManyRequests(Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds));
  }

  const user = await db
    .prepare("SELECT id, display_name, role, password_hash, active FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; display_name: string; role: string; password_hash: string; active: number }>();

  // Siempre se calcula un hash (aunque el correo no exista) para no filtrar cuentas por tiempo de respuesta.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!user || !user.active || !passwordOk) {
    await audit(db, now.toISOString(), {
      actorUserId: user?.id ?? null,
      action: "login_failed",
    });
    throw new ApiError(401, "bad_credentials", "Correo o contraseña incorrectos.");
  }

  await startSession(c, user.id, now);
  await db.batch([
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now.toISOString(), user.id),
    db
      .prepare("INSERT INTO audit_logs (at, actor_user_id, action, entity_type, entity_id) VALUES (?, ?, 'login_success', 'user', ?)")
      .bind(now.toISOString(), user.id, user.id),
  ]);
  await reset(db, acctKey);
  return c.json({ user: { id: user.id, name: user.display_name, role: user.role } });
});

authRoutes.post("/logout", async (c) => {
  const user = await authenticate(c, c.get("now"));
  if (user) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(user.sessionId).run();
    await audit(c.env.DB, c.get("now").toISOString(), { actorUserId: user.id, action: "logout", entityType: "user", entityId: user.id });
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = await authenticate(c, c.get("now"));
  if (!user) throw new ApiError(401, "unauthenticated", "No hay sesión activa.");
  return c.json({ user: { id: user.id, name: user.name, role: user.role } });
});
