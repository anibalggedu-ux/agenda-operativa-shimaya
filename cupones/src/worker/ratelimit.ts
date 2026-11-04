import { sha256Hex } from "./util";

// Límites de intentos con ventana fija, guardados en D1 (misma base que el resto: funciona
// igual en local y en producción, y se prueba de verdad). Complementa —no sustituye— las
// reglas de rate limiting / WAF de Cloudflare recomendadas en el README.

export interface Limit {
  /** Máximo de eventos permitidos por ventana. */
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  loginPerIp: { max: 20, windowSeconds: 15 * 60 },
  loginPerAccount: { max: 5, windowSeconds: 15 * 60 },
  /** PIN de tienda: se cuentan solo los intentos (la clave es la tienda, no un dato personal). */
  pinPerStore: { max: 10, windowSeconds: 15 * 60 },
  pinPerIp: { max: 20, windowSeconds: 15 * 60 },
  lookupPerUser: { max: 90, windowSeconds: 60 },
  redeemPerUser: { max: 30, windowSeconds: 60 },
  /** Búsquedas/canjes fallidos (código inexistente o no canjeable): freno a adivinar códigos. */
  failedCodePerUser: { max: 15, windowSeconds: 10 * 60 },
  failedCodePerIp: { max: 40, windowSeconds: 10 * 60 },
} satisfies Record<string, Limit>;

export interface Verdict {
  allowed: boolean;
  retryAfterSeconds: number;
  /** true solo la primera vez que se supera el límite en una ventana (para auditar sin inundar). */
  firstBlock: boolean;
}

/** Suma un evento a la clave y dice si el total sigue dentro del límite. Atómico (un solo UPSERT). */
export async function hit(db: D1Database, key: string, limit: Limit, now: Date): Promise<Verdict> {
  const t = now.getTime();
  const windowMs = limit.windowSeconds * 1000;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
       RETURNING count, window_start`,
    )
    .bind(key, t, windowMs)
    .first<{ count: number; window_start: number }>();
  const count = row?.count ?? 1;
  const start = row?.window_start ?? t;
  return {
    allowed: count <= limit.max,
    retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - t) / 1000)),
    firstBlock: count === limit.max + 1,
  };
}

/** Consulta sin sumar: ¿esta clave ya agotó su límite en la ventana vigente? */
export async function isBlocked(db: D1Database, key: string, limit: Limit, now: Date): Promise<Verdict> {
  const t = now.getTime();
  const windowMs = limit.windowSeconds * 1000;
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number }>();
  if (!row || t - row.window_start >= windowMs) return { allowed: true, retryAfterSeconds: 0, firstBlock: false };
  return {
    allowed: row.count < limit.max,
    retryAfterSeconds: Math.max(1, Math.ceil((row.window_start + windowMs - t) / 1000)),
    firstBlock: false,
  };
}

export async function reset(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}

/** Borra contadores vencidos (llamar de vez en cuando; es barato). */
export async function purgeExpired(db: D1Database, now: Date): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE ?1 - window_start > 86400000").bind(now.getTime()).run();
}

/** Las claves que contienen correos van con hash: la tabla no guarda datos personales. */
export const accountKey = async (email: string) => `login:acct:${await sha256Hex(email.trim().toLowerCase())}`;
