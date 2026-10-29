import type { MiddlewareHandler } from "hono";
import type { Role } from "../shared/types";
import { audit } from "./audit";
import { ApiError, type AppEnv, type Ctx } from "./http";
import { randomToken, sha256Hex } from "./util";

export const SESSION_LIFETIME_MS = 12 * 3600_000;
export const SESSION_IDLE_MS = 3 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

const isHttps = (c: Ctx) => new URL(c.req.url).protocol === "https:";
/** `__Host-` exige Secure + Path=/ + sin Domain: la cookie no se puede fijar desde subdominios. */
const cookieName = (c: Ctx) => (isHttps(c) ? "__Host-sid" : "sid");

function readCookie(c: Ctx, name: string): string | null {
  const header = c.req.header("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export async function startSession(c: Ctx, userId: string, now: Date): Promise<void> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const t = now.toISOString();
  const expires = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, t),
    c.env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      userId,
      t,
      expires,
      t,
    ),
  ]);
  const attrs = [`${cookieName(c)}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_LIFETIME_MS / 1000}`];
  if (isHttps(c)) attrs.push("Secure");
  c.header("Set-Cookie", attrs.join("; "), { append: true });
}

export function clearSessionCookie(c: Ctx): void {
  const attrs = [`${cookieName(c)}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (isHttps(c)) attrs.push("Secure");
  c.header("Set-Cookie", attrs.join("; "), { append: true });
}

interface SessionRow {
  id: string;
  expires_at: string;
  last_seen_at: string;
  uid: string;
  display_name: string;
  role: Role;
  active: number;
}

/** Devuelve el usuario de la sesión vigente o null. Valida expiración absoluta, inactividad y cuenta activa. */
export async function authenticate(c: Ctx, now: Date): Promise<AppEnv["Variables"]["user"] | null> {
  const token = readCookie(c, cookieName(c));
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT s.id, s.expires_at, s.last_seen_at, u.id AS uid, u.display_name, u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
  )
    .bind(id)
    .first<SessionRow>();
  if (!row) return null;
  const t = now.getTime();
  if (!row.active || t >= Date.parse(row.expires_at) || t - Date.parse(row.last_seen_at) >= SESSION_IDLE_MS) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  if (t - Date.parse(row.last_seen_at) > TOUCH_EVERY_MS) {
    await c.env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(now.toISOString(), id).run();
  }
  return { id: row.uid, name: row.display_name, role: row.role, sessionId: id };
}

/** Exige sesión válida y uno de los roles indicados. La autorización vive aquí, en el servidor. */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await authenticate(c, c.get("now"));
    if (!user) throw new ApiError(401, "unauthenticated", "Tu sesión expiró. Inicia sesión de nuevo.");
    if (!roles.includes(user.role)) {
      await audit(c.env.DB, c.get("now").toISOString(), {
        actorUserId: user.id,
        action: "access_denied",
        details: { role: user.role, method: c.req.method, route: c.req.routePath },
      });
      throw new ApiError(403, "forbidden", "No tienes permiso para esta acción.");
    }
    c.set("user", user);
    await next();
  };
}
