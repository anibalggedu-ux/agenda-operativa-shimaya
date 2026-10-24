import { Hono } from "hono";
import { z } from "zod";
import { audit } from "../audit";
import { authenticate, clearSessionCookie, startSession } from "../auth";
import { ApiError, type AppEnv, clientIp, parse, readJson, tooManyRequests } from "../http";
import { dummyHash, verifyPassword } from "../password";
import { LIMITS, accountKey, hit, reset } from "../ratelimit";

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

export const authRoutes = new Hono<AppEnv>();

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
